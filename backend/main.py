from fastapi import FastAPI, Depends, HTTPException
from backend.agent import run_agent_turn
from pydantic import BaseModel

from backend.dependencies import lifespan, get_spark_session
from backend.schemas import (
    TableHealthRequest, TableHealthResponse, HealthMetrics,
    MaintenanceRequest, MaintenanceResponse,
    OrphanRemovalRequest, OrphanRemovalResponse
)

# Import the isolated CORS setup from your top-level config package
from backend.config.cors import setup_cors

# Import your existing functional Data Engineering logic
from maintenance.health_metrics import get_table_health
from maintenance.compaction import (
    compact_table,
    compact_delete_files,
    expire_snapshots,
    remove_orphan_files,
    CATALOG_NAME,
    FILE_COUNT_THRESHOLD,
    AVG_FILE_SIZE_THRESHOLD,
)

app = FastAPI(
    title="Lakehouse Maintenance Copilot Backend",
    version="1.0.0",
    lifespan=lifespan
)

# Initialize the network bridge from your custom config layer
setup_cors(app)

class ChatRequest(BaseModel):
    table_name: str
    message: str
    history: list

@app.post("/api/chat")
def handle_copilot_chat(payload: ChatRequest):
    """Router endpoint providing full Gemini processing loops to the Copilot Chat panel."""
    try:
        response_data = run_agent_turn(
            message_history=payload.history,
            active_table=payload.table_name,
            current_user_input=payload.message
        )
        return response_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gemini Engine Error: {str(e)}")

def _to_health_metrics(raw_health) -> HealthMetrics:
    """
    Converts a maintenance.health_metrics.TableHealthReport into the
    API's HealthMetrics schema, filling in safe defaults for any
    metric that failed to collect (see _safe_metric in health_metrics.py).
    """
    return HealthMetrics(
        snapshot_count=raw_health.snapshot_count if raw_health.snapshot_count is not None else 0,
        live_file_count=raw_health.live_file_count if raw_health.live_file_count is not None else 0,
        average_file_size_bytes=int(raw_health.average_file_size_bytes) if raw_health.average_file_size_bytes is not None else 0,
        delete_file_count=raw_health.delete_file_count if raw_health.delete_file_count is not None else 0,
    )


def _is_fragmented(metrics: HealthMetrics) -> bool:
    """
    Single source of truth for the fragmentation verdict, reusing the
    exact thresholds compaction.py uses for the standalone script.
    Do not redeclare these thresholds elsewhere.
    """
    return (
        metrics.live_file_count > FILE_COUNT_THRESHOLD
        and metrics.average_file_size_bytes < AVG_FILE_SIZE_THRESHOLD
    )


@app.post("/api/health", response_model=TableHealthResponse)
def check_table_health(payload: TableHealthRequest, spark=Depends(get_spark_session)):
    """API endpoint backing the check_lakehouse_health MCP tool."""
    try:
        raw_health = get_table_health(spark, payload.table_name)
        metrics = _to_health_metrics(raw_health)
        status = "FRAGMENTED" if _is_fragmented(metrics) else "HEALTHY"

        return TableHealthResponse(
            table_name=payload.table_name,
            status=status,
            metrics=metrics
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to query metadata: {str(e)}")


@app.post("/api/maintenance", response_model=MaintenanceResponse)
def execute_table_maintenance(payload: MaintenanceRequest, spark=Depends(get_spark_session)):
    """API endpoint backing the optimize_lakehouse_table MCP tool with a built-in guardrail."""
    # Strict Confirmation Gate Check
    if not payload.confirmed:
        raise HTTPException(
            status_code=400,
            detail="Maintenance aborted. Explicit human confirmation is required."
        )

    full_table_name = f"{CATALOG_NAME}.warehouse.{payload.table_name}"

    try:
        # 1. Capture 'Before' Metrics
        before_raw = get_table_health(spark, payload.table_name)
        before_metrics = _to_health_metrics(before_raw)
        fragmented = _is_fragmented(before_metrics)

        # 2. Run Spark Mutations
        rewritten_count = compact_table(spark, full_table_name) if fragmented else 0
        deletes_rewritten_count = compact_delete_files(spark, full_table_name)
        deleted_count = expire_snapshots(spark, full_table_name)

        # 3. Capture 'After' Metrics
        after_raw = get_table_health(spark, payload.table_name)
        after_metrics = _to_health_metrics(after_raw)

        return MaintenanceResponse(
            maintenance_executed=True,
            message="Table optimization completed successfully.",
            files_rewritten=rewritten_count,
            deletes_rewritten=deletes_rewritten_count,
            files_deleted=deleted_count,
            before=before_metrics,
            after=after_metrics
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Spark maintenance job failed: {str(e)}")
    

@app.post("/api/orphans", response_model=OrphanRemovalResponse)
def remove_orphan_files_endpoint(payload: OrphanRemovalRequest, spark=Depends(get_spark_session)):
    """API endpoint backing the remove_orphan_lakehouse_files MCP tool with a built-in guardrail."""
    if not payload.confirmed:
        raise HTTPException(
            status_code=400,
            detail="Orphan removal aborted. Explicit human confirmation is required."
        )

    full_table_name = f"{CATALOG_NAME}.warehouse.{payload.table_name}"

    try:
        result = remove_orphan_files(spark, full_table_name, confirmed=True)

        return OrphanRemovalResponse(
            executed=result["executed"],
            message=result["message"],
            orphan_file_count=result["orphan_file_count"]
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Orphan removal job failed: {str(e)}")