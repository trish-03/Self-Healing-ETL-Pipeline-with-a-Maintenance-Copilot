from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.dependencies import get_spark_session
from connection.db_connection import get_connection
from etl.incremental_load import get_watermark, DEFAULT_WATERMARK
from etl.simulate_batches import run_simulation_batches

router = APIRouter(prefix="/api", tags=["simulation"])


from backend.schemas import (
    SimulationRequest, SimulationResponse,
    WatermarkResponse, ResetResponse
)



@router.post("/simulate", response_model=SimulationResponse)
def run_simulation(payload: SimulationRequest, spark=Depends(get_spark_session)):
    try:
        result = run_simulation_batches(
            spark,
            num_batches=payload.num_batches,
            num_updates_per_batch=payload.num_updates_per_batch,
            num_new_orders_per_batch=payload.num_new_orders_per_batch
        )
        return SimulationResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Simulation failed: {str(e)}")


@router.get("/watermark", response_model=WatermarkResponse)
def get_current_watermark(source: str = "fact_orders"):
    """
    Reads raw.pipeline_watermark directly, so the Simulation Control
    page can show where the next batch run will actually start from.
    """
    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            "SELECT updated_at FROM raw.pipeline_watermark WHERE source_name = %s",
            (source,)
        )
        row = cur.fetchone()
        cur.close()
        conn.close()
        return WatermarkResponse(
            source_name=source,
            last_loaded_at=str(row[0]) if row else None
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read watermark: {str(e)}")


@router.post("/reset", response_model=ResetResponse)
def reset_pipeline(spark=Depends(get_spark_session)):
    """
    Deletes the watermark row and health history for a clean slate,
    matching what you currently do manually via SQL before a full reset.
    Does NOT re-run init_schema/faker_generator/initial_load -- those
    still need to be run separately, since they're one-time setup
    scripts, not something to trigger repeatedly from the UI.
    """
    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("DELETE FROM raw.pipeline_watermark WHERE source_name = 'fact_orders'")
        cur.execute("DELETE FROM raw.table_health_history")
        conn.commit()
        cur.close()
        conn.close()
        return ResetResponse(message="Watermark and health history cleared. Run initial_load.py to complete the reset.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Reset failed: {str(e)}")