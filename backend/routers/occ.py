from fastapi import APIRouter, HTTPException

from maintenance.occ_service import (
    run_occ_demo,
    get_occ_history,
)

router = APIRouter(
    prefix="/api",
    tags=["occ"],
)


@router.post("/occ/run")
def run_occ():

    try:
        return run_occ_demo()

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=f"OCC demo failed: {str(e)}",
        )


@router.get("/occ/conflicts")
def occ_history(limit: int = 20):

    try:

        history = get_occ_history(limit)

        return {
            "count": len(history),
            "conflicts": history,
        }

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=str(e),
        )