import os
from google import genai
from google.genai import types
from config.config import GEMINI_API_KEY
from backend.agent_tools import (
    check_lakehouse_health,
    optimize_lakehouse_table,
    remove_orphan_lakehouse_files
)

# Initialize the Gemini client using your AI Studio API Key
api_key = GEMINI_API_KEY
client = genai.Client(api_key=api_key)

# Map available tools by name for explicit execution routing
TOOL_MAP = {
    "check_lakehouse_health": check_lakehouse_health,
    "optimize_lakehouse_table": optimize_lakehouse_table,
    "remove_orphan_lakehouse_files": remove_orphan_lakehouse_files
}

def run_agent_turn(message_history: list, active_table: str, current_user_input: str):
    """
    Orchestrates a single conversational turn with Gemini, managing tool calls
    and identifying safety-gated operations that require frontend authorization.
    """
    
    # 1. Check for manual layout confirmation traps before hitting the LLM
    clean_input = current_user_input.lower()
    if "confirm" in clean_input or "authorize" in clean_input:
        if "compact" in clean_input or "optimize" in clean_input:
            return {
                "sender": "system",
                "text": f"Triggering layout optimization sequence for {active_table}...",
                "requiresConfirmation": True,
                "confirmationType": "optimize",
                "targetTable": active_table
            }
        elif "orphan" in clean_input or "clean" in clean_input:
            return {
                "sender": "system",
                "text": f"Evaluating unreferenced metadata blocks for {active_table}...",
                "requiresConfirmation": True,
                "confirmationType": "orphans",
                "targetTable": active_table
            }

    # 2. Build system instructions to anchor the agent's behavior
    system_instruction = (
        "You are a strict Data Engineering Maintenance Copilot specializing in Apache Iceberg tables. "
        f"The user is inspecting the table context: '{active_table}'. "
        "You have access to tools that check table health, run optimizations, and remove orphan files. "
        "CRITICAL GUARDRAIL: If the user asks to 'optimize', 'compact', 'clean', or 'remove orphans', "
        "do NOT invoke the execution tool immediately. Instead, explain what the tool will do, "
        "and explicitly tell the user that they must click the authorization button to confirm."
    )

    # 3. Format history for Gemini's structural format
    contents = []
    for msg in message_history:
        role = "user" if msg["sender"] == "user" else "model"
        contents.append(types.Content(role=role, parts=[types.Part.from_text(text=msg["text"])]))
    
    # Append current user prompt
    contents.append(types.Content(role="user", parts=[types.Part.from_text(text=current_user_input)]))

    # 4. Invoke the model with tool mapping registration
    response = client.models.generate_content(
        model='gemini-2.5-flash',
        contents=contents,
        config=types.GenerateContentConfig(
            system_instruction=system_instruction,
            tools=[check_lakehouse_health, optimize_lakehouse_table, remove_orphan_lakehouse_files],
            temperature=0.2
        )
    )

    # 5. Handle Tool Call executions (Function Calling)
    if response.function_calls:
        for call in response.function_calls:
            tool_name = call.name
            tool_args = call.args
            
            # Inject active table context if the model forgets to pass it
            if "table_name" not in tool_args:
                tool_args["table_name"] = active_table

            # Intercept destructive actions before executing them
            if tool_name in ["optimize_lakehouse_table", "remove_orphan_lakehouse_files"] and not tool_args.get("confirmed", False):
                confirm_type = "optimize" if tool_name == "optimize_lakehouse_table" else "orphans"
                return {
                    "sender": "system",
                    "text": f"The agent requested execution of `{tool_name}`. This action requires administrative clearance.",
                    "requiresConfirmation": True,
                    "confirmationType": confirm_type,
                    "targetTable": tool_args["table_name"]
                }

            # Execute safe tools (like checking health)
            if tool_name in TOOL_MAP:
                try:
                    tool_result = TOOL_MAP[tool_name](**tool_args)
                    
                    # Provide the execution output back to Gemini to ground the final response
                    follow_up_contents = contents + [
                        types.Content(role="model", parts=[types.Part.from_function_call(call)]),
                        types.Content(role="user", parts=[types.Part.from_function_response(
                            name=tool_name,
                            response={"result": tool_result}
                        )])
                    ]
                    
                    final_response = client.models.generate_content(
                        model='gemini-2.5-flash',
                        contents=follow_up_contents,
                        config=types.GenerateContentConfig(system_instruction=system_instruction)
                    )
                    return {"sender": "assistant", "text": final_response.text}
                except Exception as e:
                    return {"sender": "assistant", "text": f"Tool execution failed: {str(e)}"}

    return {"sender": "assistant", "text": response.text}