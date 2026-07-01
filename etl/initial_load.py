import os
import sys
from pyspark.sql.functions import monotonically_increasing_id, months, col

# connection package — get_spark returns a configured SparkSession
from connection.spark_session import get_spark

# config package — holds JDBC_URL, JDBC_PROPS, and path/catalog constants
from config.config import JDBC_URL, JDBC_PROPS, CATALOG_NAME, SPARK_PACKAGES

# get_spark() checks if a session already exists before creating a new one
spark = get_spark("InitialLoad")

def read_table(table_name):
    # Read a full table from Postgres into a Spark DataFrame over JDBC
    return spark.read.jdbc(
        url=JDBC_URL,
        table=f"raw.{table_name}",
        properties=JDBC_PROPS
    )

# Read all 5 tables from the raw schema in Postgres
customers   = read_table("customers")
products    = read_table("products")
dim_date    = read_table("dim_date")
orders      = read_table("orders")
order_items = read_table("order_items")

# Add surrogate keys to dimension tables only
# monotonically_increasing_id() generates a unique integer per row in this job run
# Safe here because initial_load runs exactly once
dim_customer = customers.withColumn("customer_sk", monotonically_increasing_id())
dim_product  = products.withColumn("product_sk", monotonically_increasing_id())
dim_date     = dim_date.withColumn("date_sk", monotonically_increasing_id())

# Create the Iceberg namespace if it does not exist yet
spark.sql(f"CREATE NAMESPACE IF NOT EXISTS {CATALOG_NAME}.warehouse")

# Write dimension tables to Iceberg
# createOrReplace drops and recreates the table if it already exists
# Safe here since this is a one-time initial load
dim_customer.writeTo(f"{CATALOG_NAME}.warehouse.dim_customer").createOrReplace()
dim_product.writeTo(f"{CATALOG_NAME}.warehouse.dim_product").createOrReplace()
dim_date.writeTo(f"{CATALOG_NAME}.warehouse.dim_date").createOrReplace()

# Write fact_orders, partitioned by month of created_at, configured for Merge-on-Read (MoR)
# months() and col() build a Spark Column expression, not a SQL string
# This is the Iceberg-native way to define a partition transform
orders.writeTo(f"{CATALOG_NAME}.warehouse.fact_orders") \
    .tableProperty("write.merge.mode", "merge-on-read") \
    .tableProperty("write.update.mode", "merge-on-read") \
    .tableProperty("write.delete.mode", "merge-on-read") \
    .createOrReplace()
    #.partitionedBy(months(col("created_at"))) \

# fact_order_items has no partitioning defined, written as-is, configured for Merge-on-Read (MoR)
order_items.writeTo(f"{CATALOG_NAME}.warehouse.fact_order_items") \
    .tableProperty("write.merge.mode", "merge-on-read") \
    .tableProperty("write.update.mode", "merge-on-read") \
    .tableProperty("write.delete.mode", "merge-on-read") \
    .createOrReplace()

# Print row counts to confirm the load completed correctly
print("Initial load complete.")
print(f"   dim_customer     : {dim_customer.count()} rows")
print(f"   dim_product      : {dim_product.count()} rows")
print(f"   dim_date         : {dim_date.count()} rows")
print(f"   fact_orders      : {orders.count()} rows")
print(f"   fact_order_items : {order_items.count()} rows")

spark.stop()

# Reset watermark so the next incremental run starts from DATE_END,
# not from a stale timestamp left over from a previous pipeline run.
# Deleting is cleaner than overwriting -- get_watermark() handles the
# missing-file case by returning DEFAULT_WATERMARK automatically.
if os.path.exists("watermark.txt"):
    os.remove("watermark.txt")
    print("Watermark reset.")