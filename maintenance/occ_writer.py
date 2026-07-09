import os
import sys
import time
from pathlib import Path

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from connection.spark_session import get_spark
from connection.db_connection import get_connection
from config.config import CATALOG_NAME

TABLE_NAME = "fact_inventory"
ICEBERG_TABLE = f"{CATALOG_NAME}.warehouse.{TABLE_NAME}"
TARGET_INVENTORY_ID = "INV00001"

BARRIER_DIR = Path("/tmp/occ_barrier")


def log_result(writer_id, outcome, error_type=None, error_message=None):
    conn = get_connection()
    cur = conn.cursor()

    cur.execute(
        """
        INSERT INTO raw.occ_conflict_log
        (table_name, writer_id, outcome, error_type, error_message)
        VALUES (%s, %s, %s, %s, %s)
        """,
        (
            TABLE_NAME,
            writer_id,
            outcome,
            error_type,
            error_message,
        ),
    )

    conn.commit()
    cur.close()
    conn.close()


def wait_for_other_writer(writer_id):
    BARRIER_DIR.mkdir(exist_ok=True)

    my_file = BARRIER_DIR / f"writer_{writer_id}.ready"
    my_file.touch()

    other_writer = 2 if writer_id == 1 else 1
    other_file = BARRIER_DIR / f"writer_{other_writer}.ready"

    print(f"Writer {writer_id}: waiting for Writer {other_writer}...")

    while not other_file.exists():
        time.sleep(0.1)

    print(f"Writer {writer_id}: both writers ready.")


def main(writer_id: int, delay_seconds: float):

    time.sleep(delay_seconds)

    spark = get_spark(f"OCCWriter{writer_id}")

    try:
        # Read current snapshot
        df = spark.table(ICEBERG_TABLE)

        # Force Spark to materialize the snapshot now
        df.cache()
        df.count()

        df.createOrReplaceTempView("inventory_snapshot")

        # Wait until both writers have read the same snapshot
        wait_for_other_writer(writer_id)

        spark.sql(
            f"""
            MERGE INTO {ICEBERG_TABLE} t
            USING (
                SELECT
                    inventory_id,
                    sku_code,
                    warehouse_id,
                    quantity + 10 AS quantity,
                    current_timestamp() AS updated_at
                FROM inventory_snapshot
                WHERE inventory_id = '{TARGET_INVENTORY_ID}'
            ) s
            ON t.inventory_id = s.inventory_id

            WHEN MATCHED THEN
                UPDATE SET
                    quantity = s.quantity,
                    updated_at = s.updated_at
            """
        )

        print(f"Writer {writer_id}: COMMIT SUCCEEDED")

        log_result(writer_id, "committed")

    except Exception as e:

        print(f"\nWriter {writer_id}: COMMIT FAILED")
        print(type(e).__name__)
        print(str(e))

        log_result(
            writer_id,
            "conflict_failed",
            type(e).__name__,
            str(e)[:1000],
        )

    finally:

        spark.stop()


if __name__ == "__main__":
    main(int(sys.argv[1]), float(sys.argv[2]))