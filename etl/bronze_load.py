"""
Bronze layer incremental load: Postgres raw.orders / raw.order_items -> bronze.orders / bronze.order_items.

Append-only. Watermark-driven off the 'bronze' stage watermark. Corrupted
line_total values from raw.order_items are preserved as-is in bronze --
correction happens downstream in silver_load.py, not here.
"""

import sys
import uuid
from pathlib import Path
from datetime import datetime, timezone

sys.path.append(str(Path(__file__).resolve().parents[1]))

from pyspark.sql.functions import lit, current_timestamp, max as spark_max

from config.config import CATALOG_NAME, BRONZE_NS, JDBC_URL, JDBC_PROPS
from etl.watermark import get_watermark, update_watermark


def load_bronze_incremental(spark, since_timestamp: str | None = None) -> dict:
    """
    Pulls rows from Postgres raw.orders and raw.order_items where updated_at/created_at
    is > the bronze watermark, appends them to bronze.orders / bronze.order_items with
    ingestion metadata, advances the bronze watermark, and returns the appended
    DataFrames in-memory for downstream silver merge.

    since_timestamp: optional override, otherwise pulled from get_watermark('orders', 'bronze').
                      Both orders and order_items share the same 'orders' source_name /
                      'bronze' stage watermark (single upstream CDC source).
    """
    watermark = since_timestamp or get_watermark("orders", "bronze")
    batch_id = str(uuid.uuid4())

    # --- orders ---
    orders_df = (
        spark.read.jdbc(url=JDBC_URL, table="raw.orders", properties=JDBC_PROPS)
        .filter(f"updated_at >= '{watermark}'")
    )
    order_count = orders_df.count()

    bronze_orders_df = (
        orders_df
        .withColumn("_ingested_at", current_timestamp())
        .withColumn("_batch_id", lit(batch_id))
        .withColumn("_source", lit("postgres_raw"))
    )

    if order_count > 0:
        bronze_orders_df.writeTo(f"{CATALOG_NAME}.{BRONZE_NS}.orders").append()

    # --- order_items ---
    # NOTE: order_items has no updated_at (insert-only per AGENTS.md), so this
    # filters on created_at instead. Uses the same watermark value/stage as
    # orders since they're driven by the same upstream batch.
    items_df = (
        spark.read.jdbc(url=JDBC_URL, table="raw.order_items", properties=JDBC_PROPS)
        .filter(f"created_at >= '{watermark}'")
    )
    item_count = items_df.count()

    bronze_items_df = (
        items_df
        .withColumn("_ingested_at", current_timestamp())
        .withColumn("_batch_id", lit(batch_id))
        .withColumn("_source", lit("postgres_raw"))
    )

    if item_count > 0:
        bronze_items_df.writeTo(f"{CATALOG_NAME}.{BRONZE_NS}.order_items").append()

    # --- watermark: MAX(updated_at) of merged data, not wall-clock time ---
    # Matches the existing principle: prevents silent row drops when
    # simulated/backdated timestamps fall behind a real-clock watermark.
    new_watermark = watermark
    if order_count > 0:
        max_updated = orders_df.agg(spark_max("updated_at")).collect()[0][0]
        if max_updated is not None:
            new_watermark = str(max_updated)

    if order_count > 0 or item_count > 0:
        update_watermark("orders", "bronze", new_watermark)

    return {
        "order_count": order_count,
        "item_count": item_count,
        "bronze_orders_df": bronze_orders_df if order_count > 0 else None,
        "bronze_items_df": bronze_items_df if item_count > 0 else None,
        "new_watermark": new_watermark,
    }