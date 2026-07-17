from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from backend.mcp.agent import run_agent_turn

router = APIRouter(prefix="/api", tags=["chat"])

class ChatRequest(BaseModel):
    table_name: str
    message: str
    session_id: str = "default_session"
    history: list = []

# Synchronized in-memory session database cache
chat_sessions = {
    "default_session": []
}

@router.post("/chat")
async def handle_copilot_chat(payload: ChatRequest):
    """Router endpoint providing the full agent processing loop to the Copilot Chat panel."""
    try:
        if payload.session_id not in chat_sessions:
            chat_sessions[payload.session_id] = []

        # If localized chat history is provided and cache is empty, populate it
        if payload.history and not chat_sessions[payload.session_id]:
            for h in payload.history:
                chat_sessions[payload.session_id].append({
                    "sender": h.get("sender", "user"),
                    "text": h.get("text", "")
                })

        # Run the conversational inference pass
        response_data = await run_agent_turn(
            message_history=chat_sessions[payload.session_id],
            active_table=payload.table_name,
            current_user_input=payload.message
        )

        # Commit interactions to cache
        chat_sessions[payload.session_id].append({"sender": "user", "text": payload.message})
        chat_sessions[payload.session_id].append({
            "sender": response_data.get("sender", "assistant"),
            "text": response_data.get("text", ""),
            "requiresConfirmation": response_data.get("requiresConfirmation", False),
            "confirmationType": response_data.get("confirmationType"),
            "targetTable": response_data.get("targetTable"),
            "pendingActions": response_data.get("pendingActions", [])
        })

        return response_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Agent Engine Error: {str(e)}")