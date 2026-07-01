from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from backend.dependencies import lifespan, get_spark_session
from backend.schemas import (
    TableHealthRequest, TableHealthResponse, HealthMetrics,
    MaintenanceRequest, MaintenanceResponse
)

# Import your existing functional Data Engineering logic
from maintenance.health_metrics import get_table_health
from maintenance.compaction_script import compact_table, expire_snapshots, CATALOG_NAME

app = FastAPI(
    title="Lakehouse Maintenance Copilot Backend",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS so your React frontend can reach the endpoints seamlessly
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/api/health", response_model=TableHealthResponse)
def check_table_health(payload: TableHealthRequest, spark=Depends(get_spark_session)):
    """API endpoint backing the get_lakehouse_health MCP tool."""
    try:
        # 1. Fetch raw table health via your DE script
        raw_health = get_table_health(spark, payload.table_name)
        
        # 2. Re-apply your structural thresholds
        is_fragmented = (
            raw_health.live_file_count is not None 
            and raw_health.live_file_count > 1
            and raw_health.average_file_size_bytes < (256 * 1024)
        )
        status = "FRAGMENTED" if is_fragmented else "HEALTHY"
        
        return TableHealthResponse(
            table_name=payload.table_name,
            status=status,
            metrics=HealthMetrics(
                snapshot_count=raw_health.snapshot_count,
                live_file_count=raw_health.live_file_count,
                average_file_size_bytes=raw_health.average_file_size_bytes
            )
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to query metadata: {str(e)}")


@app.post("/api/maintenance", response_model=MaintenanceResponse)
def execute_table_maintenance(payload: MaintenanceRequest, spark=Depends(get_spark_session)):
    """API endpoint backing the execute_table_maintenance MCP tool with a built-in guardrail."""
    #  Strict Confirmation Gate Check
    if not payload.confirmed:
        raise HTTPException(
            status_code=400, 
            detail="Maintenance aborted. Explicit human confirmation is required."
        )
        
    full_table_name = f"{CATALOG_NAME}.warehouse.{payload.table_name}"
    
    try:
        # 1. Capture 'Before' Metrics
        before_raw = get_table_health(spark, payload.table_name)
        before_metrics = HealthMetrics(
            snapshot_count=before_raw.snapshot_count,
            live_file_count=before_raw.live_file_count,
            average_file_size_bytes=before_raw.average_file_size_bytes
        )
        
        # 2. Run Spark Mutations
        rewritten_count = compact_table(spark, full_table_name)
        deleted_count = expire_snapshots(spark, full_table_name)
        
        # 3. Capture 'After' Metrics
        after_raw = get_table_health(spark, payload.table_name)
        after_metrics = HealthMetrics(
            snapshot_count=after_raw.snapshot_count,
            live_file_count=after_raw.live_file_count,
            average_file_size_bytes=after_raw.average_file_size_bytes
        )
        
        return MaintenanceResponse(
            maintenance_executed=True,
            message="Table optimization completed successfully.",
            files_rewritten=rewritten_count,
            files_deleted=deleted_count,
            before=before_metrics,
            after=after_metrics
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Spark maintenance job failed: {str(e)}")