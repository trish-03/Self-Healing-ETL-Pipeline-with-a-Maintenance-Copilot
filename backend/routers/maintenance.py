from fastapi import APIRouter, Depends, HTTPException

from backend.dependencies import get_spark_session
from backend.schemas import MaintenanceRequest, MaintenanceResponse
from backend.routers.health import _to_health_metrics, _is_fragmented
from maintenance.health_metrics import get_table_health
from maintenance.compaction import (
    compact_table,
    compact_delete_files,
    expire_snapshots,
    CATALOG_NAME,
)

router = APIRouter(prefix="/api", tags=["maintenance"])


@router.post("/maintenance", response_model=MaintenanceResponse)
def execute_table_maintenance(payload: MaintenanceRequest, spark=Depends(get_spark_session)):
    """API endpoint backing the optimize_lakehouse_table MCP tool with a built-in guardrail."""
    if not payload.confirmed:
        raise HTTPException(
            status_code=400,
            detail="Maintenance aborted. Explicit human confirmation is required."
        )

    full_table_name = f"{CATALOG_NAME}.warehouse.{payload.table_name}"

    try:
        before_raw = get_table_health(
            spark,
            payload.table_name,
            event_type="maintenance_before",
            record_history=True,
        )
        before_metrics = _to_health_metrics(before_raw)
        fragmented = _is_fragmented(before_metrics)

        rewritten_count = compact_table(spark, full_table_name) if fragmented else 0
        deletes_rewritten_count = compact_delete_files(spark, full_table_name)
        deleted_count = expire_snapshots(spark, full_table_name)

        after_raw = get_table_health(
            spark,
            payload.table_name,
            event_type="maintenance_after",
            record_history=True,
        )
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