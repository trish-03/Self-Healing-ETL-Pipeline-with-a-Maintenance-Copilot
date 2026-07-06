import json
from openai import OpenAI
from config.config import GROQ_API_KEY
from backend.mcp_client import get_mcp_session

client = OpenAI(
    api_key=GROQ_API_KEY,
    base_url="https://api.groq.com/openai/v1"
)

GUARDED_TOOLS = {"optimize_lakehouse_table", "remove_orphan_lakehouse_files"}

MODEL_NAME = "llama-3.3-70b-versatile"

SYSTEM_INSTRUCTION = (
    "You are a strict Data Engineering Maintenance Copilot specializing in Apache Iceberg tables. "
    "You have access to tools that check table health, run optimizations, and remove orphan files. "
    "CRITICAL GUARDRAIL: If the user asks to 'optimize', 'compact', 'clean', or 'remove orphans', "
    "do NOT invoke the execution tool immediately. Instead, explain what the tool will do, "
    "and explicitly tell the user that they must click the authorization button to confirm."
)


def _mcp_tool_to_openai_schema(mcp_tool) -> dict:
    """
    Converts an MCP tool definition (from session.list_tools()) into the
    OpenAI-style function schema Groq expects. This means the tool
    contract lives in exactly one place -- agent_tools.py's docstrings
    and type hints, via FastMCP's own schema generation -- instead of
    being hand-duplicated in the agent as a second source of truth.
    """
    return {
        "type": "function",
        "function": {
            "name": mcp_tool.name,
            "description": mcp_tool.description or "",
            "parameters": mcp_tool.inputSchema,
        }
    }


async def _get_tool_schemas():
    session = get_mcp_session()
    tools_result = await session.list_tools()
    return [_mcp_tool_to_openai_schema(t) for t in tools_result.tools]


def _build_messages(message_history: list, current_user_input: str) -> list:
    messages = [{"role": "system", "content": SYSTEM_INSTRUCTION}]
    for msg in message_history:
        role = "user" if msg["sender"] == "user" else "assistant"
        messages.append({"role": role, "content": msg["text"]})
    messages.append({"role": "user", "content": current_user_input})
    return messages


def _confirmation_prompt(active_table: str, current_user_input: str):
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


async def _execute_tool_via_mcp(tool_name: str, tool_args: dict) -> str:
    """
    Real MCP call: goes through the live ClientSession over stdio to the
    agent_tools.py subprocess, not a direct Python function call.
    """
    session = get_mcp_session()
    result = await session.call_tool(tool_name, arguments=tool_args)

    # MCP tool results come back as a list of content blocks; these tools
    # return plain text, so join any text blocks into a single string.
    text_parts = [block.text for block in result.content if hasattr(block, "text")]
    return "\n".join(text_parts) if text_parts else str(result.content)


async def run_agent_turn(message_history: list, active_table: str, current_user_input: str):
    pre_check = _confirmation_prompt(active_table, current_user_input)
    if pre_check:
        return pre_check

    tool_schemas = await _get_tool_schemas()
    messages = _build_messages(message_history, current_user_input)

    response = client.chat.completions.create(
        model=MODEL_NAME,
        messages=messages,
        tools=tool_schemas,
        tool_choice="auto",
        temperature=0.2
    )

    choice = response.choices[0].message

    if not choice.tool_calls:
        return {"sender": "assistant", "text": choice.content}

    tool_call = choice.tool_calls[0]
    tool_name = tool_call.function.name
    tool_args = json.loads(tool_call.function.arguments)

    # Never trust the model's guess at which table -- the active table
    # is already known from the UI's table selector.
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

    try:
        tool_result = await _execute_tool_via_mcp(tool_name, tool_args)
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
            "content": tool_result
        }
    ]

    final_response = client.chat.completions.create(
        model=MODEL_NAME,
        messages=follow_up_messages,
        temperature=0.2
    )
    return {"sender": "assistant", "text": final_response.choices[0].message.content}