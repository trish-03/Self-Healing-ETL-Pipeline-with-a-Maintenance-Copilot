"""
Silver layer merge: bronze.orders / bronze.order_items -> silver.fact_orders / silver.fact_order_items.

Dedups bronze's append-only history down to current state via MERGE on natural
keys (order_id, item_id). line_total correction happens here -- bronze
preserves the corrupted value as-is (audit trail), silver is the corrected,
trustworthy layer.
"""

import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from pyspark.sql import Window
from pyspark.sql.functions import round as spark_round, row_number, col, desc

from config.config import CATALOG_NAME, BRONZE_NS, SILVER_NS
from etl.watermark import get_watermark, update_watermark


def merge_silver_from_bronze(spark, bronze_orders_df=None, bronze_items_df=None) -> dict:
    """
    Merges bronze order/item DataFrames into silver.fact_orders / silver.fact_order_items.

    If bronze_orders_df / bronze_items_df are None (standalone mode), re-reads
    bronze filtered by the 'silver' stage watermark instead of taking in-memory
    DataFrames from bronze_load.py.

    Advances the 'silver' stage watermark on success. Watermark is MAX(updated_at)
    of the merged orders DataFrame.
    """
    standalone = bronze_orders_df is None and bronze_items_df is None

    if standalone:
        silver_watermark = get_watermark("orders", "silver")
        bronze_orders_df = (
            spark.table(f"{CATALOG_NAME}.{BRONZE_NS}.orders")
            .filter(f"updated_at >= '{silver_watermark}'")
        )
        bronze_items_df = (
            spark.table(f"{CATALOG_NAME}.{BRONZE_NS}.order_items")
            .filter(f"created_at >= '{silver_watermark}'")
        )

    orders_merged = 0
    items_merged = 0
    orders_source = None

    # --- silver.fact_orders ---
    if bronze_orders_df is not None:
        # A single order_id can appear multiple times across bronze batches
        # (e.g. shipment status progression re-appends the row on change).
        # Bronze is an append-only audit log by design, so "current state"
        # means: take the row with the MAX(updated_at) per order_id, not an
        # arbitrary one. row_number() over a window, not dropDuplicates(),
        # because dropDuplicates() picks an unspecified row when there are ties.
        order_window = Window.partitionBy("order_id").orderBy(desc("updated_at"))

        orders_source = (
            bronze_orders_df
            .withColumn("_rn", row_number().over(order_window))
            .filter(col("_rn") == 1)
            .drop("_rn")
            .select(
                "order_id", "customer_id", "sku_code", "date_id",
                "quantity", "total_amount", "status", "created_at", "updated_at",
            )
        )

        orders_merged = orders_source.count()

        if orders_merged > 0:
            orders_source.createOrReplaceTempView("bronze_orders_batch")
            spark.sql(f"""
                MERGE INTO {CATALOG_NAME}.{SILVER_NS}.fact_orders AS target
                USING bronze_orders_batch AS source
                ON target.order_id = source.order_id
                WHEN MATCHED THEN UPDATE SET *
                WHEN NOT MATCHED THEN INSERT *
            """)

    # --- silver.fact_order_items ---
    if bronze_items_df is not None:
        # order_items is insert-only, never mutated after creation (per your
        # confirmation), so a given item_id has identical content in every
        # bronze row it appears in. Duplicates here only arise from watermark
        # boundary overlap (>=), not from real business changes -- so an
        # arbitrary pick via dropDuplicates(item_id) is safe. No ordering
        # needed, unlike orders.
        items_source = (
            bronze_items_df
            .dropDuplicates(["item_id"])
            .select(
                "item_id", "order_id", "sku_code", "quantity",
                "unit_price", "discount", "created_at",
            )
            # line_total corrected here -- bronze's corrupted value is
            # discarded, not read at all.
            .withColumn(
                "line_total",
                spark_round((col("unit_price") * col("quantity")) - col("discount"), 2),
            )
            .select(
                "item_id", "order_id", "sku_code", "quantity",
                "unit_price", "discount", "line_total", "created_at",
            )
        )

        items_merged = items_source.count()

        if items_merged > 0:
            items_source.createOrReplaceTempView("bronze_items_batch")
            spark.sql(f"""
                MERGE INTO {CATALOG_NAME}.{SILVER_NS}.fact_order_items AS target
                USING bronze_items_batch AS source
                ON target.item_id = source.item_id
                WHEN MATCHED THEN UPDATE SET *
                WHEN NOT MATCHED THEN INSERT *
            """)

    # --- advance silver watermark ---
    if orders_merged > 0:
        max_updated = orders_source.agg({"updated_at": "max"}).collect()[0][0]
        if max_updated is not None:
            update_watermark("orders", "silver", str(max_updated))

    return {
        "orders_merged": orders_merged,
        "items_merged": items_merged,
    }