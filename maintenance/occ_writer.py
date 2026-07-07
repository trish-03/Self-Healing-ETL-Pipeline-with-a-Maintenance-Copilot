import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import time
from connection.spark_session import get_spark
from connection.db_connection import get_connection
from config.config import CATALOG_NAME


def _log_conflict_result(table_name, writer_id, outcome, error_type=None, error_message=None):
    """
    Records one commit attempt's outcome to raw.occ_conflict_log.
    """
    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO raw.occ_conflict_log (table_name, writer_id, outcome, error_type, error_message)
            VALUES (%s, %s, %s, %s, %s)
        """, (table_name, writer_id, outcome, error_type, error_message))
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"  [WARN] Failed to log conflict result: {e}")


def main(writer_id: int, delay_seconds: float):
    time.sleep(delay_seconds)

    spark = get_spark(f"OCCWriter{writer_id}")
    table_name = "fact_orders"
    full_table_name = f"{CATALOG_NAME}.warehouse.{table_name}"

    try:
        # CORRECTED: Disable retries safely at the isolated Spark Session level.
        # This prevents the writers from colliding on metadata ALTER TABLE locks.
        spark.conf.set(f"spark.sql.catalog.{CATALOG_NAME}.commit.retry.num-retries", "0")

        # ON CONFLICT-safe insert first, so the row exists regardless of order.
        spark.sql(f"""
            MERGE INTO {full_table_name} t
            USING (SELECT 'ORD-TESTCONFLICT' AS order_id) s
            ON t.order_id = s.order_id
            WHEN NOT MATCHED THEN INSERT (order_id, status)
                VALUES (s.order_id, 'pending')
        """)

        # STRATEGY: Swell the dataset size using a UNION ALL with a range generator.
        # Even under Merge-on-Read, this forces Spark to generate and flush physical 
        # Parquet files to disk before the final catalog metadata commit is attempted.
        spark.sql(f"""
            MERGE INTO {full_table_name} t
            USING (
                SELECT 'ORD-TESTCONFLICT' AS order_id, 'confirmed' AS status
                UNION ALL
                SELECT CONCAT('DUMMY-', CAST(id AS STRING)) AS order_id, 'pending' AS status
                FROM range(1, 100000)
            ) s
            ON t.order_id = s.order_id
            WHEN MATCHED THEN UPDATE SET t.status = s.status
            WHEN NOT MATCHED THEN INSERT (order_id, status) VALUES (s.order_id, s.status)
        """)

        print(f"Writer {writer_id}: COMMIT SUCCEEDED")
        _log_conflict_result(table_name, writer_id, "committed")

    except Exception as e:
        error_type = type(e).__name__
        error_message = str(e)[:1000]
        print(f"Writer {writer_id}: COMMIT FAILED -- {error_type}: {error_message[:300]}")
        _log_conflict_result(table_name, writer_id, "conflict_failed", error_type, error_message)

    finally:
        spark.stop()


if __name__ == "__main__":
    # Robustly fetch arguments passed by the test harness
    main(int(sys.argv[1]), float(sys.argv[2]))