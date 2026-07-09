import os
import sys
import shutil
import subprocess
from pathlib import Path

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from connection.db_connection import get_connection

BARRIER_DIR = Path("/tmp/occ_barrier")


def run_writer(writer_id: int, delay_seconds: float):
    """
    Launch one OCC writer in its own Python process (and Spark JVM).
    """
    return subprocess.Popen(
        [
            sys.executable,
            "-m",
            "maintenance.occ_writer",
            str(writer_id),
            str(delay_seconds),
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )


def get_occ_history(limit: int = 5):
    """
    Returns recent OCC conflict history from Postgres.
    """

    conn = get_connection()

    try:
        cur = conn.cursor()

        cur.execute(
            """
            SELECT
                writer_id,
                attempted_at,
                outcome,
                error_type,
                error_message
            FROM raw.occ_conflict_log
            ORDER BY attempted_at DESC
            LIMIT %s
            """,
            (limit,),
        )

        rows = cur.fetchall()

        return [
            {
                "writer_id": row[0],
                "attempted_at": row[1],
                "outcome": row[2],
                "error_type": row[3],
                "error_message": row[4],
            }
            for row in rows
        ]

    finally:
        conn.close()


def run_occ_demo():
    """
    Runs the complete OCC demonstration.
    """

    if BARRIER_DIR.exists():
        shutil.rmtree(BARRIER_DIR)

    writer1 = run_writer(1, 0)
    writer2 = run_writer(2, 0)

    out1, err1 = writer1.communicate()
    out2, err2 = writer2.communicate()

    history = get_occ_history(limit=2)

    committed = sum(
        h["outcome"] == "committed"
        for h in history
    )

    failed = sum(
        h["outcome"] == "conflict_failed"
        for h in history
    )

    return {
        "status": "completed",

        "summary": {
            "writers_launched": 2,
            "successful_commits": committed,
            "failed_commits": failed,
            "occ_detected": failed > 0,
        },

        "writers": [
            {
                "writer_id": 1,
                "stdout": out1,
                "stderr": err1,
                "exit_code": writer1.returncode,
            },
            {
                "writer_id": 2,
                "stdout": out2,
                "stderr": err2,
                "exit_code": writer2.returncode,
            },
        ],

        "conflicts": history,
    }