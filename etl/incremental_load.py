import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from connection.spark_session import get_spark
from connection.db_connection import get_connection
from config.config import JDBC_URL, JDBC_PROPS, CATALOG_NAME
from maintenance.health_metrics import get_table_health

# Watermark file lives at project root
WATERMARK_FILE = "watermark.txt"

# First-run default: initial_load.py already loaded everything through DATE_END,
# so the first incremental run should only pull rows changed after that point
DEFAULT_WATERMARK = "2024-12-31 00:00:00"

#replacing the watermark.txt file with postgres table to store the watermark value
WATERMARK_SOURCE = "fact_orders"

"""old txt file watermark approach"""
# def get_watermark():
#     """Reads last successful run time from watermark from postgres table.

#     Returns DEFAULT_WATERMARK if the file doesn't exist -- meaning this is
#     the first incremental run after initial_load.py, or the file was reset.
#     """
#     if os.path.exists(WATERMARK_FILE):
#         with open(WATERMARK_FILE, "r") as f:
#             value = f.read().strip()
#             if value:
#                 return value
#     return DEFAULT_WATERMARK


# def update_watermark(new_timestamp):
#     """Overwrites watermark.txt with the current run's timestamp.

#     Called only after a successful MERGE so a failed run doesn't falsely
#     advance the watermark and silently skip rows on the next run.
#     """
#     with open(WATERMARK_FILE, "w") as f:
#         f.write(str(new_timestamp))


def get_watermark():
    """Reads the last successful run's watermark from Postgres.

    Returns DEFAULT_WATERMARK if no row exists yet for this source --
    meaning this is the first incremental run after initial_load.py,
    or the watermark table was reset.
    """
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT last_loaded_at FROM raw.pipeline_watermark WHERE source_name = %s",
            (WATERMARK_SOURCE,)
        )
        row = cur.fetchone()
        cur.close()
        if row:
            return str(row[0])
        return DEFAULT_WATERMARK
    finally:
        conn.close()


def update_watermark(new_timestamp):
    """Upserts the current run's watermark into Postgres.

    Called only after a successful MERGE so a failed run doesn't falsely
    advance the watermark and silently skip rows on the next run.
    """
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO raw.pipeline_watermark (source_name, last_loaded_at, updated_at)
            VALUES (%s, %s, now())
            ON CONFLICT (source_name)
            DO UPDATE SET last_loaded_at = EXCLUDED.last_loaded_at, updated_at = now()
        """, (WATERMARK_SOURCE, new_timestamp))
        conn.commit()
        cur.close()
    finally:
        conn.close()


def run_incremental_load(spark):
    """Core incremental load logic -- reusable by simulate_batches.py.

    Accepts an already-running Spark session instead of creating its own,
    so simulate_batches.py can call this 50 times without the startup
    overhead of creating and stopping a new Spark session each iteration.

    Returns a dict summary of what was processed, so callers can log progress.
    """
    last_loaded_at = get_watermark()

    print(f"  [Iceberg] Loading changes since {last_loaded_at}")

    # Push WHERE clause down to Postgres -- only changed rows cross the network
    orders_query = f"""
        (SELECT * FROM raw.orders
         WHERE updated_at > '{last_loaded_at}') AS inc_orders
    """
    items_query = f"""
        (SELECT oi.* FROM raw.order_items oi
         JOIN raw.orders o ON oi.order_id = o.order_id
         WHERE o.updated_at > '{last_loaded_at}') AS inc_items
    """

    df_orders = spark.read.jdbc(url=JDBC_URL, table=orders_query, properties=JDBC_PROPS)
    df_items = spark.read.jdbc(url=JDBC_URL, table=items_query, properties=JDBC_PROPS)

    order_count = df_orders.count()
    item_count = df_items.count()

    if order_count == 0:
        print("  [Iceberg] No new data found. Watermark unchanged.")
        return {"orders_merged": 0, "items_merged": 0}

    # Register as temp views for use in MERGE SQL statements
    df_orders.createOrReplaceTempView("src_orders")
    df_items.createOrReplaceTempView("src_items")

    # Merge orders -- update existing rows, insert new ones
    spark.sql(f"""
        MERGE INTO {CATALOG_NAME}.warehouse.fact_orders t
        USING src_orders s
        ON t.order_id = s.order_id
        WHEN MATCHED THEN UPDATE SET
            t.status = s.status,
            t.updated_at = s.updated_at,
            t.total_amount = s.total_amount,
            t.quantity = s.quantity
        WHEN NOT MATCHED THEN INSERT *
    """)

    # Merge items -- items are immutable once created, so only insert new ones
    # WHEN NOT MATCHED handles the existence check automatically
    spark.sql(f"""
        MERGE INTO {CATALOG_NAME}.warehouse.fact_order_items t
        USING src_items s
        ON t.item_id = s.item_id
        WHEN NOT MATCHED THEN INSERT *
    """)

    # Watermark must come from the data itself, not wall-clock time --
    # simulated batches backdate updated_at, so datetime.now() would race
    # ahead of the data and cause the next run to skip rows silently.
    max_updated_at = df_orders.agg({"updated_at": "max"}).collect()[0][0]
    new_watermark = str(max_updated_at)

    update_watermark(new_watermark)
    print(f"  [Iceberg] Merged {order_count} orders, {item_count} items. Watermark -> {new_watermark}")

    for table_name in ("fact_orders", "fact_order_items"):
        try:
            get_table_health(spark, table_name, record_history=True)
        except Exception as e:
            print(f"  [WARN] Failed to record health snapshot for {table_name}: {e}")

    return {"orders_merged": order_count, "items_merged": item_count}


def main():
    """Standalone entry point for running one incremental load manually."""
    spark = get_spark("IncrementalLoad")
    try:
        run_incremental_load(spark)
    finally:
        # Always stop Spark cleanly, even if an exception occurs
        spark.stop()


if __name__ == "__main__":
    main()