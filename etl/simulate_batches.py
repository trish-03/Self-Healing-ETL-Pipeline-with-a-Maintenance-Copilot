import os
import sys
import random
from datetime import datetime, timedelta

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from connection.db_connection import get_connection
from connection.spark_session import get_spark
from data.incremental_fixture import generate_incremental_batch
from etl.incremental_load import run_incremental_load

# --- Simulation constants -- adjust these to tune the run ---
NUM_BATCHES = 50
NUM_UPDATES_PER_BATCH = 6   # existing orders advanced per batch
NUM_NEW_ORDERS_PER_BATCH = 3  # new orders inserted per batch

# Probability that the batch_date advances by one day vs staying the same.
# 80% of the time a day passes; 20% of the time two batches land on the same day,
# simulating multiple loads within a single calendar day.
DAY_ADVANCE_PROBABILITY = 0.80

# Starting date for the simulation -- one day after the historical dataset ends
SIMULATION_START_DATE = datetime(2025, 1, 1)


def main():
    # Open a single Postgres connection reused across all batches
    conn = get_connection()

    # Fetch existing customer_ids and sku_codes once -- reused by every batch
    # rather than querying Postgres 50 times for the same data
    cur = conn.cursor()
    cur.execute("SELECT customer_id FROM raw.customers")
    customer_ids = [row[0] for row in cur.fetchall()]
    cur.execute("SELECT sku_code FROM raw.products")
    sku_codes = [row[0] for row in cur.fetchall()]
    cur.close()

    # Open a single Spark session reused across all 50 batches
    # This avoids 50x Spark startup overhead (~10-30s each)
    spark = get_spark("SimulateBatches")

    batch_date = SIMULATION_START_DATE
    total_orders_merged = 0
    total_items_merged = 0
    failed_batches = []

    print(f"Starting simulation: {NUM_BATCHES} batches, "
          f"{NUM_UPDATES_PER_BATCH} updates + {NUM_NEW_ORDERS_PER_BATCH} new orders per batch")
    print(f"Starting from {batch_date.date()}")
    print("-" * 60)

    for batch_num in range(1, NUM_BATCHES + 1):
        print(f"\nBatch {batch_num}/{NUM_BATCHES} -- {batch_date.date()}")

        try:
            # Step 1: Generate incremental changes in Postgres
            generate_incremental_batch(
                conn,
                customer_ids,
                sku_codes,
                batch_date,
                num_updates=NUM_UPDATES_PER_BATCH,
                num_new_orders=NUM_NEW_ORDERS_PER_BATCH
            )

            # Step 2: Load those changes into Iceberg via MERGE
            # Each call creates a new small Parquet file -- this is intentional,
            # the accumulation of 50 small files is what the maintenance agent detects
            summary = run_incremental_load(spark)
            total_orders_merged += summary["orders_merged"]
            total_items_merged += summary["items_merged"]

        except Exception as e:
            # Log the failure but continue -- goal is 50 batches of files,
            # not perfect consistency on every single batch
            print(f"  [ERROR] Batch {batch_num} failed: {e}")
            failed_batches.append(batch_num)

        # Advance batch_date based on 80/20 day-advance probability
        if random.random() < DAY_ADVANCE_PROBABILITY:
            batch_date += timedelta(days=1)
        # else: same date, next batch simulates a second load on the same day

    print("\n" + "=" * 60)
    print("Simulation complete.")
    print(f"  Total orders merged : {total_orders_merged}")
    print(f"  Total items merged  : {total_items_merged}")
    print(f"  Failed batches      : {failed_batches if failed_batches else 'none'}")
    print("=" * 60)

    conn.close()
    spark.stop()


if __name__ == "__main__":
    main()