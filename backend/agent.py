import json
import asyncio
from openai import OpenAI
from config.config import GROQ_API_KEY
from backend.agent_tools import (
    check_lakehouse_health,
    optimize_lakehouse_table,
    remove_orphan_lakehouse_files
)

client = OpenAI(
    api_key=GROQ_API_KEY,
    base_url="https://api.groq.com/openai/v1"
)

TOOL_MAP = {
    "check_lakehouse_health": check_lakehouse_health,
    "optimize_lakehouse_table": optimize_lakehouse_table,
    "remove_orphan_lakehouse_files": remove_orphan_lakehouse_files
}

# Tools that mutate state and must never fire without human confirmation.
GUARDED_TOOLS = {"optimize_lakehouse_table", "remove_orphan_lakehouse_files"}

MODEL_NAME = "llama-3.1-8b-instant"

SYSTEM_INSTRUCTION = (
    "You are a strict Data Engineering Maintenance Copilot specializing in Apache Iceberg tables. "
    "You have access to tools that check table health, run optimizations, and remove orphan files. "
    "CRITICAL GUARDRAIL: If the user asks to 'optimize', 'compact', 'clean', or 'remove orphans', "
    "do NOT invoke the execution tool immediately. Instead, explain what the tool will do, "
    "and explicitly tell the user that they must click the authorization button to confirm."
)

# OpenAI-style tool schemas -- Groq's API is OpenAI-compatible, so tools are
# declared as JSON schema function definitions, not passed as raw Python
# callables the way Gemini's SDK allowed. This is a manual, explicit contract:
# the model can only ever request a call shaped exactly like this, nothing more.
TOOL_SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "check_lakehouse_health",
            "description": (
                "Queries an Iceberg table's structural health to detect file "
                "fragmentation. Use this when a user asks if a table is slow, "
                "degraded, or needs optimization."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "table_name": {
                        "type": "string",
                        "description": "Name of the target table (e.g., 'fact_orders', 'fact_order_items')."
                    }
                },
                "required": ["table_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "optimize_lakehouse_table",
            "description": (
                "Triggers data compaction (rewriting small parquet files), delete "
                "file compaction, and snapshot expiration. This changes state and "
                "deletes historical snapshots -- only call with confirmed=True if "
                "the human has explicitly authorized the action."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "table_name": {
                        "type": "string",
                        "description": "Name of the target table."
                    },
                    "confirmed": {
                        "type": "boolean",
                        "description": "Explicit user confirmation flag."
                    }
                },
                "required": ["table_name", "confirmed"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "remove_orphan_lakehouse_files",
            "description": (
                "Permanently deletes orphan files -- files present on disk but not "
                "referenced by any live Iceberg snapshot for this table. This "
                "permanently deletes files from disk and cannot be undone -- only "
                "call with confirmed=True if the human has explicitly authorized it."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "table_name": {
                        "type": "string",
                        "description": "Name of the target table."
                    },
                    "confirmed": {
                        "type": "boolean",
                        "description": "Explicit user confirmation flag."
                    }
                },
                "required": ["table_name", "confirmed"]
            }
        }
    }
]


def _build_messages(message_history: list, current_user_input: str) -> list:
    """
    OpenAI-style chat format: plain dicts with 'role'/'content', not the
    types.Content/Part objects Gemini's SDK required.
    """
    messages = [{"role": "system", "content": SYSTEM_INSTRUCTION}]

    for msg in message_history:
        role = "user" if msg["sender"] == "user" else "assistant"
        messages.append({"role": role, "content": msg["text"]})

    messages.append({"role": "user", "content": current_user_input})
    return messages


def _confirmation_prompt(active_table: str, current_user_input: str):
    """
    Catches explicit confirmation phrasing before it ever reaches the
    LLM, so a user typing 'confirm optimize' doesn't depend on the model
    correctly re-deriving intent from a fresh call -- also saves a real
    API call against the free-tier daily limit.
    """
    clean_input = current_user_input.lower()
    if "confirm" not in clean_input and "authorize" not in clean_input:
        return None

    if "compact" in clean_input or "optimize" in clean_input:
        return {
            "sender": "system",
            "text": f"Triggering layout optimization sequence for {active_table}...",
            "requiresConfirmation": True,
            "confirmationType": "optimize",
            "targetTable": active_table
        }
    if "orphan" in clean_input or "clean" in clean_input:
        return {
            "sender": "system",
            "text": f"Evaluating unreferenced metadata blocks for {active_table}...",
            "requiresConfirmation": True,
            "confirmationType": "orphans",
            "targetTable": active_table
        }
    return None


async def _execute_tool(tool_name: str, tool_args: dict):
    """
    All three MCP tools are async (FastMCP-wrapped), so this is a single
    async dispatch point.
    """
    return await TOOL_MAP[tool_name](**tool_args)


async def _run_agent_turn_async(message_history: list, active_table: str, current_user_input: str):
    pre_check = _confirmation_prompt(active_table, current_user_input)
    if pre_check:
        return pre_check

    messages = _build_messages(message_history, current_user_input)

    response = client.chat.completions.create(
        model=MODEL_NAME,
        messages=messages,
        tools=TOOL_SCHEMAS,
        tool_choice="auto",
        temperature=0.2
    )

    choice = response.choices[0].message

    if not choice.tool_calls:
        return {"sender": "assistant", "text": choice.content}

    # Only handling the first requested call -- this agent's guardrail logic
    # assumes a single mutating action per turn.
    tool_call = choice.tool_calls[0]
    tool_name = tool_call.function.name
    tool_args = json.loads(tool_call.function.arguments)

    # Never trust the model's guess at which table -- it can misread the
    # table name from free text (e.g. "orders" instead of "fact_orders").
    # The active table is already known from the UI's table selector.
    tool_args["table_name"] = active_table

    if tool_name in GUARDED_TOOLS and not tool_args.get("confirmed", False):
        confirm_type = "optimize" if tool_name == "optimize_lakehouse_table" else "orphans"
        return {
            "sender": "system",
            "text": f"The agent requested execution of `{tool_name}`. This action requires administrative clearance.",
            "requiresConfirmation": True,
            "confirmationType": confirm_type,
            "targetTable": tool_args["table_name"]
        }

    if tool_name not in TOOL_MAP:
        return {"sender": "assistant", "text": f"Unknown tool requested: {tool_name}"}

    try:
        tool_result = await _execute_tool(tool_name, tool_args)
    except Exception as e:
        return {"sender": "assistant", "text": f"Tool execution failed: {str(e)}"}

    follow_up_messages = messages + [
        {
            "role": "assistant",
            "content": None,
            "tool_calls": [
                {
                    "id": tool_call.id,
                    "type": "function",
                    "function": {
                        "name": tool_name,
                        "arguments": tool_call.function.arguments
                    }
                }
            ]
        },
        {
            "role": "tool",
            "tool_call_id": tool_call.id,
            "content": str(tool_result)
        }
    ]

    final_response = client.chat.completions.create(
        model=MODEL_NAME,
        messages=follow_up_messages,
        temperature=0.2
    )
    return {"sender": "assistant", "text": final_response.choices[0].message.content}


def run_agent_turn(message_history: list, active_table: str, current_user_input: str):
    """
    Synchronous entry point for FastAPI's `def` (threadpool) endpoint.
    Each call gets its own event loop via asyncio.run -- safe here since
    threadpool workers don't already have a running loop.
    """
    return asyncio.run(
        _run_agent_turn_async(message_history, active_table, current_user_input)
    )