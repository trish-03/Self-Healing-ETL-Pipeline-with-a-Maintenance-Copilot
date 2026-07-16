"""
One-time setup: creates the bronze/silver/gold Iceberg namespaces and all
tables within them, per the medallion architecture spec.

Idempotent — safe to rerun. Uses CREATE TABLE IF NOT EXISTS throughout.
"""

import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from connection.spark_session import get_spark
from config.config import CATALOG_NAME, BRONZE_NS, SILVER_NS, GOLD_NS

# Shared table properties for MoR tables (bronze + silver facts).
# Bronze is append-only but still gets MoR properties -- matters for
# expire_snapshots cleanup, not for MERGE itself (bronze never does MERGE).
MOR_PROPERTIES = """
TBLPROPERTIES (
    'write.merge.mode' = 'merge-on-read',
    'write.update.mode' = 'merge-on-read',
    'write.delete.mode' = 'merge-on-read',
    'commit.retry.num-retries' = '10',
    'write.delete-after-commit.enabled' = 'true',
    'history.expire.max-snapshot-age-ms' = '432000000',
    'write.metadata.previous-versions-max' = '10'
)
"""


def create_namespaces(spark):
    for ns in (BRONZE_NS, SILVER_NS, GOLD_NS):
        spark.sql(f"CREATE NAMESPACE IF NOT EXISTS {CATALOG_NAME}.{ns}")
        print(f"  Namespace ready: {CATALOG_NAME}.{ns}")


def create_bronze_tables(spark):
    spark.sql(f"""
        CREATE TABLE IF NOT EXISTS {CATALOG_NAME}.{BRONZE_NS}.orders (
            order_id STRING,
            customer_id STRING,
            sku_code STRING,
            date_id STRING,
            quantity INT,
            total_amount DECIMAL(12,2),
            status STRING,
            created_at TIMESTAMP,
            updated_at TIMESTAMP,
            _ingested_at TIMESTAMP,
            _batch_id STRING,
            _source STRING
        ) USING iceberg
        {MOR_PROPERTIES}
    """)
    print(f"  Table ready: {CATALOG_NAME}.{BRONZE_NS}.orders")

    spark.sql(f"""
        CREATE TABLE IF NOT EXISTS {CATALOG_NAME}.{BRONZE_NS}.order_items (
            item_id STRING,
            order_id STRING,
            sku_code STRING,
            quantity INT,
            unit_price DECIMAL(12,2),
            discount DECIMAL(12,2),
            line_total DECIMAL(12,2),
            created_at TIMESTAMP,
            _ingested_at TIMESTAMP,
            _batch_id STRING,
            _source STRING
        ) USING iceberg
        {MOR_PROPERTIES}
    """)
    print(f"  Table ready: {CATALOG_NAME}.{BRONZE_NS}.order_items")

    # NOTE: bronze.inventory is intentionally NOT created here.
    # Inventory skips bronze entirely -- inventory_load.py writes straight
    # to silver.fact_inventory. See spec Section 2 for rationale.


def create_silver_tables(spark):
    spark.sql(f"""
        CREATE TABLE IF NOT EXISTS {CATALOG_NAME}.{SILVER_NS}.dim_customer (
            customer_sk BIGINT,
            customer_id STRING,
            name STRING,
            email STRING,
            address STRING,
            city STRING,
            tier STRING,
            phone STRING
        ) USING iceberg
    """)
    print(f"  Table ready: {CATALOG_NAME}.{SILVER_NS}.dim_customer")

    spark.sql(f"""
        CREATE TABLE IF NOT EXISTS {CATALOG_NAME}.{SILVER_NS}.dim_product (
            product_sk BIGINT,
            sku_code STRING,
            product_name STRING,
            category STRING,
            sub_category STRING,
            selling_price DECIMAL(12,2),
            is_active BOOLEAN
        ) USING iceberg
    """)
    print(f"  Table ready: {CATALOG_NAME}.{SILVER_NS}.dim_product")

    spark.sql(f"""
        CREATE TABLE IF NOT EXISTS {CATALOG_NAME}.{SILVER_NS}.dim_date (
            date_sk BIGINT,
            date_id STRING,
            full_date DATE,
            year INT,
            month INT,
            month_name STRING,
            day INT,
            day_name STRING,
            week INT,
            quarter INT,
            is_weekend BOOLEAN
        ) USING iceberg
    """)
    print(f"  Table ready: {CATALOG_NAME}.{SILVER_NS}.dim_date")

    spark.sql(f"""
        CREATE TABLE IF NOT EXISTS {CATALOG_NAME}.{SILVER_NS}.fact_orders (
            order_id STRING,
            customer_id STRING,
            sku_code STRING,
            date_id STRING,
            quantity INT,
            total_amount DECIMAL(12,2),
            status STRING,
            created_at TIMESTAMP,
            updated_at TIMESTAMP
        ) USING iceberg
        {MOR_PROPERTIES}
    """)
    print(f"  Table ready: {CATALOG_NAME}.{SILVER_NS}.fact_orders")

    spark.sql(f"""
        CREATE TABLE IF NOT EXISTS {CATALOG_NAME}.{SILVER_NS}.fact_order_items (
            item_id STRING,
            order_id STRING,
            sku_code STRING,
            quantity INT,
            unit_price DECIMAL(12,2),
            discount DECIMAL(12,2),
            line_total DECIMAL(12,2),
            created_at TIMESTAMP
        ) USING iceberg
        {MOR_PROPERTIES}
    """)
    print(f"  Table ready: {CATALOG_NAME}.{SILVER_NS}.fact_order_items")

    spark.sql(f"""
        CREATE TABLE IF NOT EXISTS {CATALOG_NAME}.{SILVER_NS}.fact_inventory (
            inventory_id STRING,
            sku_code STRING,
            warehouse_id STRING,
            quantity INT,
            updated_at TIMESTAMP
        ) USING iceberg
        {MOR_PROPERTIES}
    """)
    print(f"  Table ready: {CATALOG_NAME}.{SILVER_NS}.fact_inventory")


def create_gold_tables(spark):
    spark.sql(f"""
        CREATE TABLE IF NOT EXISTS {CATALOG_NAME}.{GOLD_NS}.sales_summary (
            date_id STRING,
            order_count BIGINT,
            total_revenue DECIMAL(14,2),
            avg_order_value DECIMAL(12,2),
            returned_order_count BIGINT,
            refreshed_at TIMESTAMP
        ) USING iceberg
    """)
    print(f"  Table ready: {CATALOG_NAME}.{GOLD_NS}.sales_summary")

    spark.sql(f"""
        CREATE TABLE IF NOT EXISTS {CATALOG_NAME}.{GOLD_NS}.inventory_summary (
            sku_code STRING,
            warehouse_id STRING,
            current_quantity INT,
            days_since_updated INT,
            refreshed_at TIMESTAMP
        ) USING iceberg
    """)
    print(f"  Table ready: {CATALOG_NAME}.{GOLD_NS}.inventory_summary")

    spark.sql(f"""
        CREATE TABLE IF NOT EXISTS {CATALOG_NAME}.{GOLD_NS}.customer_metrics (
            customer_id STRING,
            tier STRING,
            lifetime_orders BIGINT,
            lifetime_spend DECIMAL(14,2),
            first_order_date STRING,
            last_order_date STRING,
            refreshed_at TIMESTAMP
        ) USING iceberg
    """)
    print(f"  Table ready: {CATALOG_NAME}.{GOLD_NS}.customer_metrics")


def main():
    spark = get_spark("create_medallion_schema")

    print("Creating namespaces...")
    create_namespaces(spark)

    print("Creating bronze tables...")
    create_bronze_tables(spark)

    print("Creating silver tables...")
    create_silver_tables(spark)

    print("Creating gold tables...")
    create_gold_tables(spark)

    print("Medallion schema setup complete.")


if __name__ == "__main__":
    main()