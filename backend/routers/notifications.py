from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from backend.dependencies import manager, proactive_alerts
from backend.routers.chat import chat_sessions

router = APIRouter(prefix="/api/ws", tags=["Notifications"])

@router.websocket("/alerts")
async def websocket_alerts_endpoint(websocket: WebSocket):
    """Maintains permanent browser channels for proactive background metrics pushes."""
    await manager.connect(websocket)
    
    try:
        # Replay proactive alerts first so late websocket connections still see
        # background health problems that were already detected.
        for alert in proactive_alerts:
            await websocket.send_json(alert)

        # Prevent UI wipeout on refresh: Replay current history state to newly connected socket
        session_id = "default_session"
        if session_id in chat_sessions and chat_sessions[session_id]:
            for msg in chat_sessions[session_id]:
                # Filter background directive messages to keep chat UI clean
                if msg.get("sender") == "user" and "[SYSTEM_EVENT]" in msg.get("text", ""):
                    continue
                
                # Reconstruct payload layout
                await websocket.send_json({
                    "sender": "assistant" if msg.get("sender") == "assistant" else "user",
                    "text": msg.get("text", ""),
                    "requiresConfirmation": msg.get("requiresConfirmation", False),
                    "confirmationType": msg.get("confirmationType"),
                    "targetTable": msg.get("targetTable"),
                    "pendingActions": msg.get("pendingActions", [])
                })

        while True:
            await websocket.receive_text()  # Keep-alive loop listening for client responses
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)