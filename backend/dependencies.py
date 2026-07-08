# backend/dependencies.py
import os
import sys
from contextlib import asynccontextmanager
from typing import List
from fastapi import FastAPI, WebSocket
from apscheduler.schedulers.asyncio import AsyncIOScheduler

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from connection.spark_session import get_spark
from backend.mcp_client import start_mcp_session, stop_mcp_session
from maintenance.health_metrics import get_table_health

# ----------------------------------------------------------------------
# 1. Real-Time Connections Manager
# ----------------------------------------------------------------------
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                pass

manager = ConnectionManager()

class SparkState:
    session = None

spark_state = SparkState()
scheduler = AsyncIOScheduler()
alerted_tables = set()

# ----------------------------------------------------------------------
# 2. Autonomous Agent Pulse Execution
# ----------------------------------------------------------------------
async def check_table_health_job():
    """
    APScheduler Background Thread.
    Observes structural states, modifies agent session states, and executes turns.
    """
    from backend.routers.health import _to_health_metrics, _is_fragmented
    from backend.routers.chat import chat_sessions
    from backend.agent import run_agent_turn
    
    if not spark_state.session:
        return

    try:
        for table in ["fact_orders", "fact_order_items"]:
            raw_health = get_table_health(spark_state.session, table)
            metrics = _to_health_metrics(raw_health)
            
            if _is_fragmented(metrics):
                if table not in alerted_tables:
                    # Access/Initialize the persistent conversational tracking thread
                    session_id = "default_session"
                    if session_id not in chat_sessions:
                        chat_sessions[session_id] = []
                    
                    # Direct instruction injected into the agent loop history stream
                    system_alert_directive = (
                        f"[SYSTEM_EVENT]: The Iceberg table '{table}' has degraded structurally. "
                        f"Live File Count is {metrics.live_file_count}. "
                        "Proactively warn the user about fragmentation right now in character and "
                        "explicitly query if they wish to authorize an optimization routine."
                    )
                    
                    # Execute an authentic agent turn using the updated state history
                    agent_response = await run_agent_turn(
                        message_history=chat_sessions[session_id],
                        active_table=table,
                        current_user_input=system_alert_directive
                    )
                    
                    # Commit the system alert and the agent's exact warning statement to the master history log
                    chat_sessions[session_id].append({"sender": "user", "text": system_alert_directive})
                    chat_sessions[session_id].append({
                        "sender": agent_response.get("sender", "assistant"),
                        "text": agent_response.get("text", "")
                    })
                    
                    # Enrich payload with web-socket target confirmation tracking parameters
                    broadcast_payload = {
                        "sender": "assistant",
                        "text": agent_response.get("text", "Table maintenance attention required."),
                        "requiresConfirmation": True,
                        "confirmationType": "optimize",
                        "targetTable": table,
                        "pendingActions": [
                            {"confirmationType": "optimize", "targetTable": table}
                        ]
                    }
                    
                    # Push live to user's dashboard screen
                    await manager.broadcast(broadcast_payload)
                    alerted_tables.add(table)
            else:
                if table in alerted_tables:
                    alerted_tables.remove(table)

    except Exception as e:
        print(f"[Autonomous Agent Lifecycle Error]: {str(e)}", file=sys.stderr)

# ----------------------------------------------------------------------
# 3. Lifespan Hook
# ----------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Initializing global Spark Session...")
    spark_state.session = get_spark("FastAPILakehouseBackend")

    print("Starting MCP client session...")
    await start_mcp_session()

    print("Starting APScheduler Autonomous Monitoring Framework...")
    scheduler.add_job(check_table_health_job, 'interval', seconds=60, id='iceberg_health_check')
    scheduler.start()

    yield

    print("Shutting down APScheduler...")
    scheduler.shutdown()

    print("Shutting down MCP client session...")
    await stop_mcp_session()

    print("Shutting down global Spark Session...")
    if spark_state.session:
        spark_state.session.stop()

def get_spark_session():
    if not spark_state.session:
        raise RuntimeError("Spark session has not been initialized.")
    return spark_state.session