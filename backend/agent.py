import asyncio
from google import genai
from google.genai import types
from config.config import GEMINI_API_KEY
from backend.agent_tools import (
    check_lakehouse_health,
    optimize_lakehouse_table,
    remove_orphan_lakehouse_files
)

client = genai.Client(api_key=GEMINI_API_KEY)

TOOL_MAP = {
    "check_lakehouse_health": check_lakehouse_health,
    "optimize_lakehouse_table": optimize_lakehouse_table,
    "remove_orphan_lakehouse_files": remove_orphan_lakehouse_files
}

# Tools that mutate state and must never fire without human confirmation.
GUARDED_TOOLS = {"optimize_lakehouse_table", "remove_orphan_lakehouse_files"}

MODEL_NAME = "gemini-2.5-flash"

SYSTEM_INSTRUCTION = (
    "You are a strict Data Engineering Maintenance Copilot specializing in Apache Iceberg tables. "
    "You have access to tools that check table health, run optimizations, and remove orphan files. "
    "CRITICAL GUARDRAIL: If the user asks to 'optimize', 'compact', 'clean', or 'remove orphans', "
    "do NOT invoke the execution tool immediately. Instead, explain what the tool will do, "
    "and explicitly tell the user that they must click the authorization button to confirm."
)

# Tools are declared so Gemini can see their signatures and decide to call
# them, but automatic_function_calling.disable=True below means the SDK
# never executes them itself -- execution always goes through TOOL_MAP,
# where the confirmed-flag guardrail actually lives.
GENERATE_CONFIG = types.GenerateContentConfig(
    system_instruction=SYSTEM_INSTRUCTION,
    tools=[check_lakehouse_health, optimize_lakehouse_table, remove_orphan_lakehouse_files],
    automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
    temperature=0.2
)


def _build_contents(message_history: list, current_user_input: str) -> list:
    contents = [
        types.Content(
            role="user" if msg["sender"] == "user" else "model",
            parts=[types.Part.from_text(text=msg["text"])]
        )
        for msg in message_history
    ]
    contents.append(
        types.Content(role="user", parts=[types.Part.from_text(text=current_user_input)])
    )
    return contents


def _confirmation_prompt(active_table: str, current_user_input: str):
    """
    Catches explicit confirmation phrasing before it ever reaches the
    LLM, so a user typing 'confirm optimize' doesn't depend on Gemini
    correctly re-deriving intent from a fresh call.
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
    All three MCP tools are async (FastMCP-wrapped), so this is a
    single async dispatch point rather than the asyncio.run()-per-call
    pattern -- avoids spinning up a fresh event loop for every tool call.
    """
    return await TOOL_MAP[tool_name](**tool_args)


async def _run_agent_turn_async(message_history: list, active_table: str, current_user_input: str):
    pre_check = _confirmation_prompt(active_table, current_user_input)
    if pre_check:
        return pre_check

    contents = _build_contents(message_history, current_user_input)

    response = client.models.generate_content(
        model=MODEL_NAME,
        contents=contents,
        config=GENERATE_CONFIG
    )

    if not response.function_calls:
        return {"sender": "assistant", "text": response.text}

    # Only handling the first requested call -- Gemini can request
    # multiple in one turn, but this agent's guardrail logic assumes
    # a single mutating action per turn. Worth revisiting if you see
    # multi-call responses in practice.
    call = response.function_calls[0]
    tool_name = call.name
    tool_args = dict(call.args)
    tool_args["table_name"] = active_table  # always pass the active table

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

    follow_up_contents = contents + [
        types.Content(
            role="model",
            parts=[types.Part.from_function_call(name=call.name, args=call.args)]
        ),
        types.Content(
            role="user",
            parts=[types.Part.from_function_response(
                name=tool_name,
                response={"result": tool_result}
            )]
        )
    ]

    final_response = client.models.generate_content(
        model=MODEL_NAME,
        contents=follow_up_contents,
        config=GENERATE_CONFIG
    )
    return {"sender": "assistant", "text": final_response.text}


def run_agent_turn(message_history: list, active_table: str, current_user_input: str):
    """
    Synchronous entry point for FastAPI's `def` (threadpool) endpoint.
    Each call gets its own event loop via asyncio.run -- safe here
    since threadpool workers don't already have a running loop.
    """
    return asyncio.run(
        _run_agent_turn_async(message_history, active_table, current_user_input)
    )