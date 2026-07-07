from fastapi import APIRouter, Depends, HTTPException

from backend.dependencies import get_spark_session
from backend.schemas import OrphanRemovalRequest, OrphanRemovalResponse
from maintenance.compaction import remove_orphan_files, CATALOG_NAME

router = APIRouter(prefix="/api", tags=["orphans"])


@router.post("/orphans", response_model=OrphanRemovalResponse)
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