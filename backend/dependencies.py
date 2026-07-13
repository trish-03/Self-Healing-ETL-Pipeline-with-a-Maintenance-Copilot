import os
import sys
import asyncio
from contextlib import asynccontextmanager
from typing import List
from uuid import uuid4
from fastapi import FastAPI, WebSocket
from apscheduler.schedulers.asyncio import AsyncIOScheduler

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from connection.spark_session import get_spark
from backend.mcp.client import start_mcp_session, stop_mcp_session
from maintenance.health_metrics import get_table_health

# ----------------------------------------------------------------------
# 1. Real-Time Connections Manager for SRE Push Alerts
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

# Global tracking variables
class SparkState:
    session = None

spark_state = SparkState()
scheduler = AsyncIOScheduler()
proactive_alerts = []

# Guards concurrent use of the single shared Spark session. Both the
# scheduler's health-check tick and long-running endpoints (simulation,
# maintenance) issue independent queries against spark_state.session --
# without this, overlapping queries were causing transient collection
# failures, which get_table_health's None-coercion silently turned into
# false "healthy" readings.
spark_busy_lock = asyncio.Lock()


def _format_proactive_alert_text(table: str, metrics) -> str:
    live_kb = (metrics.average_file_size_bytes or 0) / 1024
    delete_count = metrics.delete_file_count or 0
    live_files = metrics.live_file_count or 0
    return (
        f"Automated monitoring detected fragmentation on {table}. "
        f"The table currently has {live_files} live files, an average file size of {live_kb:.2f} KB, "
        f"and {delete_count} delete files. That pattern usually means scans are spreading across too many "
        f"small files and the table is drifting into slower reads. Open Copilot to review the issue and "
        f"authorize compaction if this is still expected."
    )

# ----------------------------------------------------------------------
# 2. Autonomous Agent Pulse Evaluation
# ----------------------------------------------------------------------
async def check_table_health_job():
    """
    SRE Background Pulse.
    Inspects physical metadata, mutates master conversation state,
    and runs a comprehensive agent turn upon threshold violation.
    """
    from backend.routers.health import _to_health_metrics, _is_fragmented, _collection_failed
    from backend.routers.chat import chat_sessions
    from backend.mcp.agent import run_agent_turn

    if not spark_state.session:
        return

    if spark_busy_lock.locked():
        # Something else (simulation, maintenance) already owns the shared
        # Spark session -- skip this tick rather than contend for it and
        # risk a transient failure being misread as "healthy."
        return

    async with spark_busy_lock:
        try:
            for table in ["fact_orders", "fact_order_items"]:
                raw_health = get_table_health(spark_state.session, table, record_history=True)

                if _collection_failed(raw_health):
                    # Metrics genuinely failed to collect this tick -- do
                    # NOT evaluate fragmentation on coerced-to-zero values,
                    # and do NOT let this silently look like "healthy."
                    continue

                metrics = _to_health_metrics(raw_health)

                if _is_fragmented(metrics):
                    session_id = "default_session"
                    if session_id not in chat_sessions:
                        chat_sessions[session_id] = []

                    system_alert_directive = (
                        f"[SYSTEM_EVENT]: The Iceberg table '{table}' has degraded structurally. "
                        f"Live File Count is {metrics.live_file_count}. "
                        "Proactively alert the data engineer right now in character, summarize the fragmentation "
                        "risk, and explicitly request verification to execute an optimization routine. "
                        "Give a concise plain-English explanation of what is happening, not just a button label."
                    )

                    agent_response = await run_agent_turn(
                        message_history=chat_sessions[session_id],
                        active_table=table,
                        current_user_input=system_alert_directive
                    )

                    detailed_text = agent_response.get("text", "").strip()
                    if not detailed_text or len(detailed_text.split()) < 8:
                        detailed_text = _format_proactive_alert_text(table, metrics)
                    else:
                        detailed_text = f"{detailed_text}\n\n{_format_proactive_alert_text(table, metrics)}"

                    chat_sessions[session_id].append({"sender": "user", "text": system_alert_directive})
                    chat_sessions[session_id].append({
                        "sender": agent_response.get("sender", "assistant"),
                        "text": detailed_text
                    })

                    broadcast_payload = {
                        "alertId": str(uuid4()),
                        "sender": "assistant",
                        "text": detailed_text,
                        "requiresConfirmation": True,
                        "confirmationType": "optimize",
                        "targetTable": table,
                        "pendingActions": [
                            {"confirmationType": "optimize", "targetTable": table}
                        ]
                    }

                    proactive_alerts.append(broadcast_payload)
                    if len(proactive_alerts) > 50:
                        proactive_alerts.pop(0)

                    await manager.broadcast(broadcast_payload)

        except Exception as e:
            print(f"[Autonomous Monitoring Failure]: {str(e)}", file=sys.stderr)

# ----------------------------------------------------------------------
# 3. Lifespan Infrastructure Mount
# ----------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Initializing global Spark Session...")
    spark_state.session = get_spark("FastAPILakehouseBackend")

    print("Starting MCP client session...")
    await start_mcp_session()

    print("Starting APScheduler Autonomous Monitoring Framework...")
    scheduler.add_job(check_table_health_job, 'interval', seconds=300, id='iceberg_health_check')
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