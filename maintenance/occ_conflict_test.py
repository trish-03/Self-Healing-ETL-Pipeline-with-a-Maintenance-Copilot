import os
import sys
import shutil
import subprocess
from pathlib import Path

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from connection.db_connection import get_connection

BARRIER_DIR = Path("/tmp/occ_barrier")


def run_writer(writer_id, delay_seconds):
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


def print_recent_conflict_log(limit=5):
    conn = get_connection()
    cur = conn.cursor()

    cur.execute(
        """
        SELECT writer_id,
               attempted_at,
               outcome,
               error_type
        FROM raw.occ_conflict_log
        ORDER BY attempted_at DESC
        LIMIT %s
        """,
        (limit,),
    )

    rows = cur.fetchall()

    cur.close()
    conn.close()

    print("\nRecent occ_conflict_log entries")
    print("-" * 70)

    for row in rows:
        print(
            f"writer={row[0]} | "
            f"time={row[1]} | "
            f"outcome={row[2]} | "
            f"error={row[3]}"
        )


def main():

    # Clean barrier from previous run
    if BARRIER_DIR.exists():
        shutil.rmtree(BARRIER_DIR)

    print("Launching concurrent inventory writers...\n")

    writer1 = run_writer(1, 0)
    writer2 = run_writer(2, 0)

    out1, err1 = writer1.communicate()
    out2, err2 = writer2.communicate()

    print("=" * 70)
    print("Writer 1")
    print("=" * 70)
    print(out1)

    if err1:
        print(err1)

    print("=" * 70)
    print("Writer 2")
    print("=" * 70)
    print(out2)

    if err2:
        print(err2)

    print_recent_conflict_log()

    print(
        "\nIf OCC worked correctly, one writer should commit and "
        "the other should fail with a CommitFailedException "
        "(or similar Iceberg commit conflict)."
    )


if __name__ == "__main__":
    main()