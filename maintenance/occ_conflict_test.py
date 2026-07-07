import subprocess
import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from connection.db_connection import get_connection


def run_writer(writer_id, delay_seconds):
    """Launches one writer as a fully separate OS process (separate JVM)."""
    return subprocess.Popen(
        [sys.executable, "-m", "maintenance.occ_writer", str(writer_id), str(delay_seconds)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )


def print_recent_conflict_log(limit=5):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT writer_id, attempted_at, outcome, error_type
        FROM raw.occ_conflict_log
        ORDER BY attempted_at DESC
        LIMIT %s
    """, (limit,))
    rows = cur.fetchall()
    cur.close()
    conn.close()

    print("\nRecent occ_conflict_log entries:")
    print("-" * 60)
    for row in rows:
        print(f"  writer_id={row[0]}  {row[1]}  outcome={row[2]}  error_type={row[3]}")


def main():
    print("Launching concurrent writers to force an MoR storage leak...")
    
    # Fire both writers concurrently targeting the exact same data row
    p1 = run_writer(writer_id=1, delay_seconds=0)
    p2 = run_writer(writer_id=2, delay_seconds=0.1)

    out1, err1 = p1.communicate()
    out2, err2 = p2.communicate()

    print("=" * 60)
    print("=== Writer 1 ===")
    print(out1)
    if err1:
        print("STDERR (last 2000 chars):", err1[-2000:])

    print("\n=== Writer 2 ===")
    print(out2)
    if err2:
        print("STDERR (last 2000 chars):", err2[-2000:])
    print("=" * 60)

    print_recent_conflict_log()

    print(
        "\nNext step: run maintenance/health_metrics.py against fact_orders "
        "\nYour physical_file_count will now exceed your live_file_count!"
    )


if __name__ == "__main__":
    main()