from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.agent import run_agent_turn

router = APIRouter(prefix="/api", tags=["chat"])


class ChatRequest(BaseModel):
    table_name: str
    message: str
    history: list


@router.post("/chat")
async def handle_copilot_chat(payload: ChatRequest):
    """Router endpoint providing the full agent processing loop to the Copilot Chat panel."""
    try:
        response_data = await run_agent_turn(
            message_history=payload.history,
            active_table=payload.table_name,
            current_user_input=payload.message
        )
        return response_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Agent Engine Error: {str(e)}")