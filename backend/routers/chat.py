# backend/routers/chat.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from backend.agent import run_agent_turn

router = APIRouter(prefix="/api", tags=["chat"])

class ChatRequest(BaseModel):
    table_name: str
    message: str
    session_id: str = "default_session"  # Add session tracking
    history: list = []

# Global in-memory thread session tracker
chat_sessions = {
    "default_session": []
}

@router.post("/chat")
async def handle_copilot_chat(payload: ChatRequest):
    """Router endpoint providing the full agent processing loop to the Copilot Chat panel."""
    try:
        # Initialize session memory if it doesn't exist
        if payload.session_id not in chat_sessions:
            chat_sessions[payload.session_id] = []

        # If frontend sent fresh history initialization, sync it up if empty
        if payload.history and not chat_sessions[payload.session_id]:
            # Normalize structure from frontend schemas to agent's expected message history format
            for h in payload.history:
                chat_sessions[payload.session_id].append({
                    "sender": h.get("sender", "user"),
                    "text": h.get("text", "")
                })

        # 1. Execute agent turn using backend persistent session state
        response_data = await run_agent_turn(
            message_history=chat_sessions[payload.session_id],
            active_table=payload.table_name,
            current_user_input=payload.message
        )

        # 2. Append the user message and assistant reply back into master history
        chat_sessions[payload.session_id].append({"sender": "user", "text": payload.message})
        chat_sessions[payload.session_id].append({
            "sender": response_data.get("sender", "assistant"),
            "text": response_data.get("text", "")
        })

        return response_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Agent Engine Error: {str(e)}")