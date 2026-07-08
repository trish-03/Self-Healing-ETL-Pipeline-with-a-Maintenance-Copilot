# backend/routers/occ.py

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from datetime import datetime
from typing import Optional

from connection.db_connection import get_connection

router = APIRouter(prefix="/api", tags=["occ"])


class OCCConflictEntry(BaseModel):
    writer_id: int
    attempted_at: datetime
    outcome: str
    error_type: Optional[str]
    error_message: Optional[str]


class OCCConflictResponse(BaseModel):
    table_name: str
    conflicts: list[OCCConflictEntry]


@router.get("/occ/conflicts", response_model=OCCConflictResponse)
def get_occ_conflicts(table: str = "fact_orders", limit: int = 20):
    """
    Returns recent OCC conflict-test outcomes from raw.occ_conflict_log.
    Populated by running `python -m maintenance.occ_conflict_test`, not
    by any live-triggered action from the UI -- this endpoint is read-only
    reporting on a test you run from the command line.
    """
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT writer_id, attempted_at, outcome, error_type, error_message
            FROM raw.occ_conflict_log
            WHERE table_name = %s
            ORDER BY attempted_at DESC
            LIMIT %s
        """, (table, limit))
        rows = cur.fetchall()
        cur.close()

        conflicts = [
            OCCConflictEntry(
                writer_id=row[0], attempted_at=row[1], outcome=row[2],
                error_type=row[3], error_message=row[4]
            )
            for row in rows
        ]

        return OCCConflictResponse(table_name=table, conflicts=conflicts)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to query conflict log: {str(e)}")
    finally:
        conn.close()