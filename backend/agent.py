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

# Verbs that signal the user wants an action performed, not just discussed.
# When present, tool_choice is forced to "required" so the model must
# actually call a tool rather than narrate the action in prose -- this is
# what previously let it hallucinate an entire maintenance run without
# ever calling optimize_lakehouse_table.
ACTION_VERBS = ("optimize", "compact", "clean", "orphan", "remove")

KNOWN_TABLES = {"fact_orders", "fact_order_items"}

SYSTEM_INSTRUCTION = (
    "You are a strict Data Engineering Maintenance Copilot specializing in Apache Iceberg tables. "
    "You have access to tools that check table health, run optimizations, and remove orphan files. "
    "When the input starts with [SYSTEM_EVENT], treat it as an automated background alert and respond with "
    "a clear plain-English explanation of the table's condition, the observed metrics, and the recommended "
    "next step. Do not answer with only a terse action label. "
    "There are exactly two tables: fact_orders and fact_order_items. "
    "If the user asks about 'both tables', 'all tables', or otherwise refers to more than one table, "
    "call the appropriate tool once per table in the same turn, with the correct table_name for each. "
    "CRITICAL RULE: Never claim an action was performed, initiated, or completed unless you actually "
    "called the corresponding tool in this turn. Never invent metrics, orphan files, or results that "
    "did not come from a real tool response. "
    "CRITICAL GUARDRAIL: If the user asks to 'optimize', 'compact', 'clean', or 'remove orphans', "
    "call the appropriate tool with confirmed=false rather than describing it in prose -- the system "
    "handles asking the user for confirmation, you do not need to ask them yourself."
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
    """
    Catches explicit confirmation phrasing before it ever reaches the
    LLM, so a user typing 'confirm optimize' doesn't depend on the model
    correctly re-deriving intent from a fresh call -- also saves a real
    API call against the free-tier daily limit.

    NOTE: this fast-path only ever targets active_table, since it fires
    on generic "confirm"/"authorize" phrasing with no table context of
    its own. Confirming a specific pending action from a multi-table
    turn is handled by the frontend calling the maintenance/orphan
    endpoints directly (see CopilotChat.tsx), not by re-entering the
    agent loop.
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


async def _execute_tool_via_mcp(tool_name: str, tool_args: dict) -> str:
    """
    Real MCP call: goes through the live ClientSession over stdio to the
    agent_tools.py subprocess, not a direct Python function call.
    """
    session = get_mcp_session()
    result = await session.call_tool(tool_name, arguments=tool_args)

    text_parts = [block.text for block in result.content if hasattr(block, "text")]
    return "\n".join(text_parts) if text_parts else str(result.content)


async def run_agent_turn(message_history: list, active_table: str, current_user_input: str):
    pre_check = _confirmation_prompt(active_table, current_user_input)
    if pre_check:
        return pre_check

    tool_schemas = await _get_tool_schemas()
    messages = _build_messages(message_history, current_user_input)

    wants_action = any(verb in current_user_input.lower() for verb in ACTION_VERBS)
    tool_choice = "required" if wants_action else "auto"

    try:
        response = client.chat.completions.create(
            model=MODEL_NAME,
            messages=messages,
            tools=tool_schemas,
            tool_choice=tool_choice,
            temperature=0.0
        )
    except Exception:
        return {
            "sender": "assistant",
            "text": "The agent had trouble formatting that request. Could you rephrase, or try again?"
        }

    choice = response.choices[0].message

    if choice.content and "<function=" in choice.content:
        return {
            "sender": "assistant",
            "text": "The agent tried to run a tool but the request didn't format correctly. Please try again."
        }

    if not choice.tool_calls:
        return {"sender": "assistant", "text": choice.content}

    pending_actions = []
    tool_call_entries = []

    for tool_call in choice.tool_calls:
        tool_name = tool_call.function.name
        tool_args = json.loads(tool_call.function.arguments)

        # Each call carries its own table_name now -- this is what allows
        # "check/optimize both tables" to work in a single turn, rather
        # than forcing every call onto whichever tab happens to be open.
        # Still validated against KNOWN_TABLES so a hallucinated or
        # malformed table name can't slip through; falls back to
        # active_table only if the model's value isn't a real table.
        requested_table = tool_args.get("table_name", active_table)
        tool_args["table_name"] = requested_table if requested_table in KNOWN_TABLES else active_table

        if tool_name in GUARDED_TOOLS and not tool_args.get("confirmed", False):
            confirm_type = "optimize" if tool_name == "optimize_lakehouse_table" else "orphans"
            pending_actions.append({
                "confirmationType": confirm_type,
                "targetTable": tool_args["table_name"]
            })
            continue

        try:
            tool_result = await _execute_tool_via_mcp(tool_name, tool_args)
        except Exception as e:
            tool_result = f"Tool execution failed: {str(e)}"

        tool_call_entries.append((tool_call, tool_result))

    # Any guarded, unconfirmed actions take priority -- surface all of
    # them at once so the user can authorize each table independently,
    # instead of only ever seeing one table's confirmation per turn.
    if pending_actions:
        tables_listed = ", ".join(a["targetTable"] for a in pending_actions)
        return {
            "sender": "system",
            "text": f"The agent requested maintenance action(s) for: {tables_listed}. Each requires administrative clearance.",
            "requiresConfirmation": True,
            "pendingActions": pending_actions
        }

    if not tool_call_entries:
        return {"sender": "assistant", "text": choice.content or "No action was taken."}

    # Feed all executed tool results back in one follow-up call, so a
    # compound question ("status of both tables?") gets one combined,
    # coherent answer instead of only ever addressing the first table.
    follow_up_messages = messages + [
        {
            "role": "assistant",
            "content": None,
            "tool_calls": [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {"name": tc.function.name, "arguments": tc.function.arguments}
                }
                for tc, _ in tool_call_entries
            ]
        }
    ] + [
        {"role": "tool", "tool_call_id": tc.id, "content": result}
        for tc, result in tool_call_entries
    ]

    final_response = client.chat.completions.create(
        model=MODEL_NAME,
        messages=follow_up_messages,
        temperature=0.0
    )
    return {"sender": "assistant", "text": final_response.choices[0].message.content}