# backend/routers/notifications.py
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from backend.dependencies import manager

router = APIRouter(prefix="/api/ws", tags=["Notifications"])

@router.websocket("/alerts")
async def websocket_alerts_endpoint(websocket: WebSocket):
    """
    Maintains long-lived browser websocket channels for 
    proactive background data lakehouse alerts.
    """
    await manager.connect(websocket)
    try:
        while True:
            # Keep the channel alive and listening for heartbeats if necessary
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)