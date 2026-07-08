from fastapi import APIRouter, Depends, HTTPException

from backend.dependencies import get_spark_session
from backend.schemas import (
    TableHealthResponse, HealthMetrics,
    HealthHistoryEntry, HealthHistoryResponse
)
from maintenance.health_metrics import get_table_health
from maintenance.compaction import FILE_COUNT_THRESHOLD, AVG_FILE_SIZE_THRESHOLD
from connection.db_connection import get_connection

router = APIRouter(prefix="/api", tags=["health"])


def _to_health_metrics(raw_health) -> HealthMetrics:
    """
    Converts a maintenance.health_metrics.TableHealthReport into the
    API's HealthMetrics schema, filling in safe defaults for any metric
    that failed to collect (see _safe_metric in health_metrics.py).
    """
    return HealthMetrics(
        live_file_count=raw_health.live_file_count if raw_health.live_file_count is not None else 0,
        physical_file_count=raw_health.physical_file_count if raw_health.physical_file_count is not None else 0,
        average_file_size_bytes=int(raw_health.average_file_size_bytes) if raw_health.average_file_size_bytes is not None else 0,
        delete_file_count=raw_health.delete_file_count if raw_health.delete_file_count is not None else 0,
        snapshot_count=raw_health.snapshot_count if raw_health.snapshot_count is not None else 0,
        manifest_count=raw_health.manifest_count if raw_health.manifest_count is not None else 0,
        metadata_json_count=raw_health.metadata_json_count if raw_health.metadata_json_count is not None else 0,
        orphan_file_count=raw_health.orphan_file_count if raw_health.orphan_file_count is not None else 0,
    )


def _collection_failed(raw_health) -> bool:
    """
    True if the core metrics needed for a fragmentation verdict never
    actually collected -- distinct from a genuinely healthy table with
    zero files. A None here means "unknown," and must never be silently
    coerced into "healthy" by any caller.
    """
    return raw_health.live_file_count is None or raw_health.average_file_size_bytes is None


def _is_fragmented(metrics: HealthMetrics) -> bool:
    """
    Single source of truth for the fragmentation verdict, reusing the
    exact thresholds compaction.py uses for the standalone script.
    Do not redeclare these thresholds elsewhere. Callers MUST check
    _collection_failed() on the raw report before trusting this --
    it operates on already-coerced-to-zero metrics and cannot itself
    distinguish "zero files" from "unknown."
    """
    return (
        metrics.live_file_count > FILE_COUNT_THRESHOLD
        and metrics.average_file_size_bytes < AVG_FILE_SIZE_THRESHOLD
    )


@router.get("/health", response_model=TableHealthResponse)
def check_table_health(table: str, spark=Depends(get_spark_session)):
    """API endpoint backing the check_lakehouse_health MCP tool."""
    try:
        raw_health = get_table_health(spark, table)
        metrics = _to_health_metrics(raw_health)

        if _collection_failed(raw_health):
            status = "UNKNOWN"
        else:
            status = "FRAGMENTED" if _is_fragmented(metrics) else "HEALTHY"

        return TableHealthResponse(
            table_name=table,
            status=status,
            metrics=metrics
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to query metadata: {str(e)}")


@router.get("/health/history", response_model=HealthHistoryResponse)
def get_health_history(table: str, limit: int = 100):
    """
    Returns the chronological metric history for a table, driven by
    raw.table_health_history. Powers the dashboard's trend chart --
    real data captured by every get_table_health() call, not mocked
    or reconstructed client-side.
    """
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT checked_at, live_file_count, physical_file_count,
                   average_file_size_bytes, delete_file_count,
                   snapshot_count, manifest_count, metadata_json_count,
                   orphan_file_count, event_type
            FROM raw.table_health_history
            WHERE table_name = %s
            ORDER BY checked_at ASC
            LIMIT %s
        """, (table, limit))
        rows = cur.fetchall()
        cur.close()

        history = [
            HealthHistoryEntry(
                checked_at=row[0], live_file_count=row[1], physical_file_count=row[2],
                average_file_size_bytes=row[3], delete_file_count=row[4],
                snapshot_count=row[5], manifest_count=row[6], metadata_json_count=row[7],
                orphan_file_count=row[8], event_type=row[9]
            )
            for row in rows
        ]

        return HealthHistoryResponse(table_name=table, history=history)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to query health history: {str(e)}")
    finally:
        conn.close()