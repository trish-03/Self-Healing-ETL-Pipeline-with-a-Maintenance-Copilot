import os
import sys
import random
from datetime import datetime, timedelta

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from connection.db_connection import get_connection
from connection.spark_session import get_spark
from data.incremental_fixture import generate_incremental_batch
from etl.incremental_load import run_incremental_load, get_watermark

# --- Simulation constants -- adjust these to tune the run ---
NUM_BATCHES = 70
NUM_UPDATES_PER_BATCH = 10   # existing orders advanced per batch
NUM_NEW_ORDERS_PER_BATCH = 5  # new orders inserted per batch

# Probability that the batch_date advances by one day vs staying the same.
# 80% of the time a day passes; 20% of the time two batches land on the same day,
# simulating multiple loads within a single calendar day.
DAY_ADVANCE_PROBABILITY = 0.80

# Starting date for the simulation -- one day after the historical dataset ends
SIMULATION_START_DATE = datetime(2025, 1, 1)


def run_simulation_batches(spark, num_batches=NUM_BATCHES, num_updates_per_batch=NUM_UPDATES_PER_BATCH, num_new_orders_per_batch=NUM_NEW_ORDERS_PER_BATCH):
    """
    Core simulation loop, reusable by both the standalone script and the
    /api/simulate endpoint. Accepts an already-running Spark session,
    same pattern as run_incremental_load.
    """
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT customer_id FROM raw.customers")
    customer_ids = [row[0] for row in cur.fetchall()]
    cur.execute("SELECT sku_code FROM raw.products")
    sku_codes = [row[0] for row in cur.fetchall()]
    cur.close()

    batch_date = datetime.strptime(get_watermark(), "%Y-%m-%d %H:%M:%S")
    total_orders_merged = 0
    total_items_merged = 0
    failed_batches = []

    for batch_num in range(1, num_batches + 1):
        try:
            generate_incremental_batch(
                conn, customer_ids, sku_codes, batch_date,
                num_updates=num_updates_per_batch,
                num_new_orders=num_new_orders_per_batch
            )
            summary = run_incremental_load(spark)
            total_orders_merged += summary["orders_merged"]
            total_items_merged += summary["items_merged"]
        except Exception as e:
            failed_batches.append(batch_num)

        if random.random() < DAY_ADVANCE_PROBABILITY:
            batch_date += timedelta(hours=random.randint(1, 23), minutes=random.randint(0, 59))
        else:
            batch_date += timedelta(minutes=random.randint(5, 90))

    conn.close()

    return {
        "batches_run": num_batches - len(failed_batches),
        "total_orders_merged": total_orders_merged,
        "total_items_merged": total_items_merged,
        "failed_batches": failed_batches
    }


def main():
    spark = get_spark("SimulateBatches")
    try:
        result = run_simulation_batches(spark)
        print("\n" + "=" * 60)
        print("Simulation complete.")
        print(f"  Total orders merged : {result['total_orders_merged']}")
        print(f"  Total items merged  : {result['total_items_merged']}")
        print(f"  Failed batches      : {result['failed_batches'] if result['failed_batches'] else 'none'}")
        print("=" * 60)
    finally:
        spark.stop()


if __name__ == "__main__":
    main()