import os
import sys
from datetime import datetime, timedelta

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from connection.spark_session import get_spark
from config.config import CATALOG_NAME
from maintenance.health_metrics import (
    get_table_health,
    print_report
)


# ----------------------------------------------------------------------
# Maintenance Thresholds
# ----------------------------------------------------------------------

# More than this many live files may indicate fragmentation.
FILE_COUNT_THRESHOLD = 1

# Files smaller than this are considered "small files".
AVG_FILE_SIZE_THRESHOLD = 1024 * 1024      # 1 MB


# ----------------------------------------------------------------------
# Iceberg Maintenance Operations
# ----------------------------------------------------------------------

def compact_table(spark, table):
    """
    Rewrites small data files into larger ones.

    This reduces query overhead but does not delete
    obsolete parquet files, and does not touch delete
    files. Snapshot expiration reclaims disk space for
    obsolete data files; compact_delete_files reclaims
    it for obsolete delete files.
    """

    result = spark.sql(f"""
        CALL {CATALOG_NAME}.system.rewrite_data_files(
            table => '{table}'
        )
    """).collect()[0]

    return result["rewritten_data_files_count"]


def compact_delete_files(spark, table):
    """
    Compacts position delete files and drops dangling deletes.

    Under Merge-on-Read, every MERGE/UPDATE/DELETE can leave
    behind a small delete file. rewrite_data_files does not
    touch these. After a data-file rewrite, delete records that
    pointed at the now-rewritten data files become "dangling" --
    still tracked in manifests, but no longer applicable to
    anything. This procedure compacts remaining delete files and
    filters out the dangling ones.

    Runs unconditionally, independent of the fragmentation
    verdict -- a table can show a low live_file_count (e.g. a
    single data file) while still accumulating delete files,
    the same reason expire_snapshots must run unconditionally.
    """

    result = spark.sql(f"""
        CALL {CATALOG_NAME}.system.rewrite_position_delete_files(
            table => '{table}'
        )
    """).collect()[0]

    return result["rewritten_delete_files_count"]


def expire_snapshots(spark, table):
    """
    Keeps only the latest snapshot.

    Any data files that are no longer referenced by
    retained snapshots become eligible for deletion.
    """

    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")

    result = spark.sql(f"""
        CALL {CATALOG_NAME}.system.expire_snapshots(
            table => '{table}',
            older_than => TIMESTAMP '{now}',
            retain_last => 1
        )
    """).collect()[0]

    return result["deleted_data_files_count"]


def remove_orphan_files(spark, table, older_than_hours=24, confirmed=False):
    """
    Physically deletes orphan files -- files present on disk but not
    referenced by any live snapshot.

    This is destructive and irreversible. Unlike compact_table,
    compact_delete_files, and expire_snapshots, this is NOT called
    automatically inside run_maintenance -- orphan buildup (failed
    writes, aborted compactions) is a separate failure mode from
    fragmentation or snapshot bloat, and shouldn't fire just because
    a table looked unhealthy on the fragmentation check.

    Iceberg hard-enforces a minimum older_than of 24 hours regardless
    of what's passed, to avoid deleting files still mid-write by a
    concurrent job.

    Args:
        confirmed: must be explicitly True to actually delete.
                   Mirrors the guardrail pattern used elsewhere for
                   destructive actions (API layer, MCP tool).
    """

    if not confirmed:
        return {
            "executed": False,
            "message": "Orphan removal requires confirmed=True.",
            "orphan_file_count": None
        }

    cutoff = (
        datetime.now()
        - timedelta(hours=older_than_hours)
    ).strftime("%Y-%m-%d %H:%M:%S")

    result = spark.sql(f"""
        CALL {CATALOG_NAME}.system.remove_orphan_files(
            table => '{table}',
            older_than => TIMESTAMP '{cutoff}',
            dry_run => false
        )
    """)

    deleted_count = result.count()

    return {
        "executed": True,
        "message": f"{deleted_count} orphan file(s) removed.",
        "orphan_file_count": deleted_count
    }


# ----------------------------------------------------------------------
# Maintenance Driver
# ----------------------------------------------------------------------

def run_maintenance(spark, table_name):
    """
    Executes maintenance for one Iceberg table.

    Decision process:

        1. Collect table metrics.
        2. Compact data files only if fragmentation exists.
        3. Always compact/clean delete files.
        4. Always expire snapshots afterwards.
        5. Print before/after reports.

    Orphan removal is deliberately NOT part of this automatic flow --
    see remove_orphan_files for why. Call it separately when needed.
    """

    full_table_name = f"{CATALOG_NAME}.warehouse.{table_name}"

    print("\n")
    print("=" * 70)
    print(f"Maintenance : {table_name}")
    print("=" * 70)

    # ----------------------------------------------------------
    # BEFORE
    # ----------------------------------------------------------

    before = get_table_health(spark, table_name)

    print("\nBefore Maintenance")
    print_report(before)

    # ----------------------------------------------------------
    # Determine fragmentation (data files only)
    # ----------------------------------------------------------

    fragmented = (
        before.live_file_count is not None
        and before.average_file_size_bytes is not None
        and before.live_file_count > FILE_COUNT_THRESHOLD
        and before.average_file_size_bytes < AVG_FILE_SIZE_THRESHOLD
    )

    # ----------------------------------------------------------
    # Data file compaction
    # ----------------------------------------------------------

    rewritten = 0

    if fragmented:

        print("\nCompacting table...")

        rewritten = compact_table(
            spark,
            full_table_name
        )

        print(f"Files rewritten : {rewritten}")

    else:

        print("\nCompaction not required.")

    # ----------------------------------------------------------
    # Delete file compaction (unconditional)
    # ----------------------------------------------------------

    print("\nCompacting delete files...")

    rewritten_deletes = compact_delete_files(
        spark,
        full_table_name
    )

    print(f"Delete files rewritten : {rewritten_deletes}")

    # ----------------------------------------------------------
    # Snapshot cleanup (unconditional)
    # ----------------------------------------------------------

    print("\nExpiring snapshots...")

    deleted = expire_snapshots(
        spark,
        full_table_name
    )

    print(f"Obsolete data files deleted : {deleted}")

    # ----------------------------------------------------------
    # AFTER
    # ----------------------------------------------------------

    after = get_table_health(spark, table_name)

    print("\nAfter Maintenance")
    print_report(after)

    # ----------------------------------------------------------
    # Summary
    # ----------------------------------------------------------

    print("\nMaintenance Summary")
    print("-" * 70)
    print(f"Compaction Performed   : {'Yes' if fragmented else 'No'}")
    print(f"Files Rewritten        : {rewritten}")
    print(f"Delete Files Rewritten : {rewritten_deletes}")
    print(f"Files Deleted          : {deleted}")


# ----------------------------------------------------------------------
# Standalone Execution
# ----------------------------------------------------------------------

def main():

    spark = get_spark("IcebergMaintenance")

    try:

        tables = [
            "fact_orders",
            "fact_order_items"
        ]

        for table in tables:
            run_maintenance(
                spark,
                table
            )

    finally:
        spark.stop()


if __name__ == "__main__":
    main()