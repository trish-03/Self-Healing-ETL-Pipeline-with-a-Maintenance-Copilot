import os
import sys
from datetime import datetime

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
AVG_FILE_SIZE_THRESHOLD = 256 * 1024      # 256 KB


# ----------------------------------------------------------------------
# Iceberg Maintenance Operations
# ----------------------------------------------------------------------

def compact_table(spark, table):
    """
    Rewrites small data files into larger ones.

    This reduces query overhead but does not delete
    obsolete parquet files. Snapshot expiration is
    responsible for reclaiming disk space.
    """

    result = spark.sql(f"""
        CALL {CATALOG_NAME}.system.rewrite_data_files(
            table => '{table}'
        )
    """).collect()[0]

    return result["rewritten_data_files_count"]


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


# ----------------------------------------------------------------------
# Maintenance Driver
# ----------------------------------------------------------------------

def run_maintenance(spark, table_name):
    """
    Executes maintenance for one Iceberg table.

    Decision process:

        1. Collect table metrics.
        2. Compact only if fragmentation exists.
        3. Always expire snapshots afterwards.
        4. Print before/after reports.
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
    # Determine fragmentation
    # ----------------------------------------------------------

    fragmented = (
        before.live_file_count is not None
        and before.average_file_size_bytes is not None
        and before.live_file_count > FILE_COUNT_THRESHOLD
        and before.average_file_size_bytes < AVG_FILE_SIZE_THRESHOLD
    )

    # ----------------------------------------------------------
    # Compaction
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
    # Snapshot cleanup
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
    print(f"Compaction Performed : {'Yes' if fragmented else 'No'}")
    print(f"Files Rewritten      : {rewritten}")
    print(f"Files Deleted        : {deleted}")


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