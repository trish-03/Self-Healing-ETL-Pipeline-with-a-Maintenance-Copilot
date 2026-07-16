"""
Watermark management for the medallion pipeline.

Replaces the old single-row-per-source watermark model with a composite
(source_name, stage) key so bronze and silver can advance independently.
See raw.pipeline_watermark DDL in etl/schema.sql.
"""

import sys
from pathlib import Path
from datetime import datetime, timezone

sys.path.append(str(Path(__file__).resolve().parents[1]))

from connection.db_connection import get_connection

VALID_STAGES = ("bronze", "silver", "gold")

# Used when no watermark row exists yet for a (source, stage) pair.
# Deliberately epoch-old so the first incremental run picks up everything.
DEFAULT_WATERMARK = "1970-01-01 00:00:00"


def _validate_stage(stage: str) -> None:
    if stage not in VALID_STAGES:
        raise ValueError(f"Invalid stage '{stage}'. Must be one of {VALID_STAGES}.")


def get_watermark(source_name: str, stage: str) -> str:
    """
    Returns the last_loaded_at watermark for (source_name, stage) as a string
    timestamp. Returns DEFAULT_WATERMARK if no row exists yet.
    """
    _validate_stage(stage)

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT last_loaded_at
                FROM raw.pipeline_watermark
                WHERE source_name = %s AND stage = %s
                """,
                (source_name, stage),
            )
            row = cur.fetchone()
            if row is None:
                return DEFAULT_WATERMARK
            return str(row[0])
    finally:
        conn.close()


def update_watermark(source_name: str, stage: str, new_timestamp) -> None:
    """
    Upserts the watermark for (source_name, stage) to new_timestamp.
    Idempotent via ON CONFLICT on the composite primary key.

    new_timestamp accepts either a datetime or a string parseable by Postgres.
    """
    _validate_stage(stage)

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO raw.pipeline_watermark (source_name, stage, last_loaded_at, updated_at)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (source_name, stage)
                DO UPDATE SET
                    last_loaded_at = EXCLUDED.last_loaded_at,
                    updated_at = EXCLUDED.updated_at
                """,
                (source_name, stage, new_timestamp, datetime.now(timezone.utc)),
            )
        conn.commit()
    finally:
        conn.close()


def reset_watermark(source_name: str, stage: str | None = None) -> None:
    """
    Resets watermark(s) back to DEFAULT_WATERMARK.

    If stage is None, resets all stages for source_name (used by initial_load.py
    to force a full replay). If stage is given, resets only that (source, stage) row.
    """
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            if stage is None:
                cur.execute(
                    """
                    DELETE FROM raw.pipeline_watermark
                    WHERE source_name = %s
                    """,
                    (source_name,),
                )
            else:
                _validate_stage(stage)
                cur.execute(
                    """
                    DELETE FROM raw.pipeline_watermark
                    WHERE source_name = %s AND stage = %s
                    """,
                    (source_name, stage),
                )
        conn.commit()
    finally:
        conn.close()