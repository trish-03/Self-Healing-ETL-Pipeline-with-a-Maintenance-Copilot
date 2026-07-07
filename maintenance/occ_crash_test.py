# maintenance/occ_crash_test.py
import subprocess
import sys
import os
import signal
import time

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from connection.db_connection import get_connection


def run_writer_and_kill(writer_id, kill_after_seconds):
    """
    Launches occ_writer.py as a real OS process, waits kill_after_seconds,
    then sends SIGKILL. This has to be an OS-level kill, not a Python
    exception or a .terminate() (SIGTERM) -- SIGTERM can still be caught
    or trigger cleanup in some JVM configurations. SIGKILL cannot be
    caught, so whatever Iceberg abort/cleanup code would normally run
    on a graceful failure never gets the chance to execute.

    kill_after_seconds needs calibration: too early and Spark hasn't
    written any files yet (nothing to orphan), too late and the commit
    has already succeeded or failed cleanly on its own. Start high and
    binary-search downward while watching physical_file_count.
    """
    proc = subprocess.Popen(
        [sys.executable, "-m", "maintenance.occ_writer", str(writer_id), "0"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )

    time.sleep(kill_after_seconds)

    if proc.poll() is None:
        # Still running -- kill it mid-flight.
        proc.kill()  # sends SIGKILL on POSIX
        proc.wait()
        print(f"Writer {writer_id}: KILLED after {kill_after_seconds}s (pid {proc.pid})")
        return "killed", None, None
    else:
        out, err = proc.communicate()
        print(f"Writer {writer_id}: finished on its own before kill window -- adjust timing")
        return "finished_early", out, err


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
    kill_after = float(sys.argv[1]) if len(sys.argv) > 1 else 3.0

    print(f"Launching writer and killing it after {kill_after}s (SIGKILL)...")
    status, out, err = run_writer_and_kill(writer_id=99, kill_after_seconds=kill_after)

    if status == "finished_early" and out:
        print(out)

    # Note: a killed writer never reaches _log_conflict_result, since the
    # whole process died -- so occ_conflict_log will NOT show an entry for
    # this run. That's expected and correct: the log records commit
    # outcomes, and a SIGKILL'd process never reached a commit outcome
    # at all. The evidence of what happened lives on disk, not in the log.
    print_recent_conflict_log()

    print(
        "\nNext step: run health_metrics.py against fact_orders now.\n"
        "If timing was right, physical_file_count > live_file_count,\n"
        "and orphan_file_count (dry-run) should be > 0."
    )


if __name__ == "__main__":
    main()