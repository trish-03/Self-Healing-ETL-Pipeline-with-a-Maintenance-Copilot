import os
import sys
from pathlib import Path
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Optional

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from connection.spark_session import get_spark
from config.config import CATALOG_NAME, WAREHOUSE_PATH


# ----------------------------------------------------------------------
# Health Report
# ----------------------------------------------------------------------

@dataclass
class TableHealthReport:
    """
    Represents the current state of an Iceberg table.

    This class intentionally stores only facts about the table.
    It does NOT decide whether maintenance should be performed.
    """

    table: str
    checked_at: str

    # Storage metrics
    live_file_count: Optional[int] = None
    physical_file_count: Optional[int] = None
    average_file_size_bytes: Optional[float] = None

    # Delete file metrics (relevant under Merge-on-Read)
    delete_file_count: Optional[int] = None

    # Metadata metrics
    snapshot_count: Optional[int] = None
    manifest_count: Optional[int] = None

    # Cleanup metric
    orphan_file_count: Optional[int] = None

    # Layout metric
    partition_file_counts: list = field(default_factory=list)

    # Metric collection failures
    errors: dict = field(default_factory=dict)


# ----------------------------------------------------------------------
# Utility
# ----------------------------------------------------------------------

def _safe_metric(errors, metric_name, fn):
    """
    Executes a metric collection function.

    If one metric fails we continue collecting the remaining
    metrics instead of aborting the whole report.
    """

    try:
        return fn()

    except Exception as e:
        errors[metric_name] = str(e)
        return None


# ----------------------------------------------------------------------
# Metric Collectors
# ----------------------------------------------------------------------

def live_file_count(spark, table):
    """
    Number of data files referenced by the latest Iceberg snapshot.

    NOTE: {table}.files includes ALL content types (data, position
    deletes, equality deletes). Under Merge-on-Read this number can
    stay flat even after compaction if delete files are the leftover,
    since rewrite_data_files does not touch them. See delete_file_count
    for the split-out view.
    """

    return spark.sql(f"""
        SELECT COUNT(*) AS cnt
        FROM {table}.files
    """).collect()[0]["cnt"]


def delete_file_count(spark, table):
    """
    Number of live delete files (position or equality deletes).

    content = 0 -> data file
    content = 1 -> position delete file
    content = 2 -> equality delete file

    These are invisible to rewrite_data_files. Under Merge-on-Read,
    every MERGE/UPDATE/DELETE can leave one behind. They only get
    cleaned up by rewrite_position_delete_files, and until then they
    also keep their own manifests alive, which is why manifest_count
    can stay high even after data files are compacted down to one.
    """

    return spark.sql(f"""
        SELECT COUNT(*) AS cnt
        FROM {table}.files
        WHERE content != 0
    """).collect()[0]["cnt"]


def physical_file_count(table):
    """
    Counts parquet files physically present on disk.

    Unlike Iceberg metadata tables, this scans the warehouse
    directory directly. Includes both data and delete-file
    parquet files, since both live under the table's data/
    directory on disk.

    Comparing this value with live_file_count shows whether
    obsolete parquet files still exist on disk.
    """

    table_name = table.split(".")[-1]

    data_path = (
        Path(WAREHOUSE_PATH)
        / "warehouse"
        / table_name
        / "data"
    )

    if not data_path.exists():
        return 0

    return len(list(data_path.rglob("*.parquet")))


def snapshot_count(spark, table):
    """
    Number of snapshots currently retained by Iceberg.

    Every successful MERGE creates a new snapshot.
    """

    return spark.sql(f"""
        SELECT COUNT(*) AS cnt
        FROM {table}.snapshots
    """).collect()[0]["cnt"]


def average_file_size(spark, table):
    """
    Average size of live parquet files.

    Small average file sizes usually indicate fragmentation.
    """

    result = spark.sql(f"""
        SELECT AVG(file_size_in_bytes) AS avg_size
        FROM {table}.files
    """).collect()[0]["avg_size"]

    if result is None:
        return 0.0

    return float(result)


def manifest_count(spark, table):
    """
    Number of manifest files currently tracked by Iceberg.
    """

    return spark.sql(f"""
        SELECT COUNT(*) AS cnt
        FROM {table}.manifests
    """).collect()[0]["cnt"]


def orphan_file_count(
    spark,
    table,
    older_than_hours=24
):
    """
    Counts orphan files using Iceberg's dry-run mode.

    No files are deleted.

    Iceberg requires older_than to be at least 24 hours
    to avoid deleting files still in use.
    """

    cutoff = (
        datetime.now()
        - timedelta(hours=older_than_hours)
    ).strftime("%Y-%m-%d %H:%M:%S")

    return spark.sql(f"""
        CALL {CATALOG_NAME}.system.remove_orphan_files(
            table => '{table}',
            older_than => TIMESTAMP '{cutoff}',
            dry_run => true
        )
    """).count()


def partition_file_counts(spark, table):
    """
    Returns the number of files per partition.

    Unpartitioned tables do not expose a partition column,
    so we return one synthetic partition instead.
    """

    try:

        df = spark.sql(f"""
            SELECT
                partition,
                COUNT(*) AS file_count
            FROM {table}.files
            GROUP BY partition
            ORDER BY file_count DESC
        """)

        return [row.asDict() for row in df.collect()]

    except Exception:

        return [
            {
                "partition": "unpartitioned",
                "file_count": live_file_count(spark, table)
            }
        ]

# ----------------------------------------------------------------------
# Health Report Builder
# ----------------------------------------------------------------------

def get_table_health(spark, table_name: str) -> TableHealthReport:
    """
    Collects all available metrics for an Iceberg table.

    This function DOES NOT decide whether the table is healthy.
    It simply gathers facts and returns them in a TableHealthReport.
    Any maintenance decisions are left to compaction.py.
    """

    full_table_name = f"{CATALOG_NAME}.warehouse.{table_name}"

    errors = {}

    report = TableHealthReport(
        table=table_name,
        checked_at=datetime.now().isoformat(),
        errors=errors
    )

    # ---------------- Storage ----------------

    report.live_file_count = _safe_metric(
        errors,
        "live_file_count",
        lambda: live_file_count(spark, full_table_name)
    )

    report.physical_file_count = _safe_metric(
        errors,
        "physical_file_count",
        lambda: physical_file_count(full_table_name)
    )

    report.average_file_size_bytes = _safe_metric(
        errors,
        "average_file_size_bytes",
        lambda: average_file_size(spark, full_table_name)
    )

    # ---------------- Deletes (Merge-on-Read) ----------------

    report.delete_file_count = _safe_metric(
        errors,
        "delete_file_count",
        lambda: delete_file_count(spark, full_table_name)
    )

    # ---------------- Metadata ----------------

    report.snapshot_count = _safe_metric(
        errors,
        "snapshot_count",
        lambda: snapshot_count(spark, full_table_name)
    )

    report.manifest_count = _safe_metric(
        errors,
        "manifest_count",
        lambda: manifest_count(spark, full_table_name)
    )

    # ---------------- Cleanup ----------------

    report.orphan_file_count = _safe_metric(
        errors,
        "orphan_file_count",
        lambda: orphan_file_count(spark, full_table_name)
    )

    # ---------------- Layout ----------------

    report.partition_file_counts = (
        _safe_metric(
            errors,
            "partition_file_counts",
            lambda: partition_file_counts(spark, full_table_name)
        )
        or []
    )

    return report


# ----------------------------------------------------------------------
# Report Printer
# ----------------------------------------------------------------------

def print_report(report: TableHealthReport):
    """
    Prints the collected metrics in a readable format.

    This function only displays information and performs
    no maintenance.
    """

    print("\n" + "=" * 65)
    print(f"Health Report : {report.table}")
    print("=" * 65)

    print(f"Checked At : {report.checked_at}")

    print("\nStorage Metrics")
    print("-" * 65)
    print(f"Live Files           : {report.live_file_count}")
    print(f"Physical Files       : {report.physical_file_count}")

    if report.average_file_size_bytes is not None:
        print(
            f"Average File Size    : "
            f"{report.average_file_size_bytes / 1024:.2f} KB"
        )

    print("\nDelete File Metrics")
    print("-" * 65)
    print(f"Delete Files         : {report.delete_file_count}")

    print("\nMetadata Metrics")
    print("-" * 65)
    print(f"Snapshots            : {report.snapshot_count}")
    print(f"Manifest Files       : {report.manifest_count}")

    print("\nCleanup Metrics")
    print("-" * 65)
    print(f"Orphan Files         : {report.orphan_file_count}")

    print("\nPartition Distribution")
    print("-" * 65)

    for partition in report.partition_file_counts:
        print(
            f"{partition['partition']} -> "
            f"{partition['file_count']} files"
        )

    if report.errors:

        print("\nFailed Metrics")
        print("-" * 65)

        for metric, message in report.errors.items():
            print(f"{metric}")
            print(message)
            print()

    print("=" * 65)


# ----------------------------------------------------------------------
# Standalone Execution
# ----------------------------------------------------------------------

def main():
    """
    Allows the health report to be run independently.

    Example:
        python maintenance/health_metrics.py
    """

    spark = get_spark("HealthMetrics")

    try:

        tables = [
            "fact_orders",
            "fact_order_items"
        ]

        for table in tables:

            report = get_table_health(
                spark,
                table
            )

            print_report(report)

    finally:
        spark.stop()


if __name__ == "__main__":
    main()