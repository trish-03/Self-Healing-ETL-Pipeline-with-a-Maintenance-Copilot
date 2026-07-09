from connection.spark_session import get_spark
from config.config import JDBC_URL, JDBC_PROPS, CATALOG_NAME

spark = get_spark("InventoryLoad")


def read_table(table_name):
    return spark.read.jdbc(
        url=JDBC_URL,
        table=f"raw.{table_name}",
        properties=JDBC_PROPS
    )


inventory = read_table("fact_inventory")

spark.sql(f"CREATE NAMESPACE IF NOT EXISTS {CATALOG_NAME}.warehouse")

inventory.writeTo(f"{CATALOG_NAME}.warehouse.fact_inventory") \
    .tableProperty("write.merge.mode", "merge-on-read") \
    .tableProperty("write.update.mode", "merge-on-read") \
    .tableProperty("write.delete.mode", "merge-on-read") \
    .tableProperty("write.metadata.delete-after-commit.enabled", "true") \
    .tableProperty("write.metadata.previous-versions-max", "10") \
    .createOrReplace()

print("Inventory load complete.")
print(f"   fact_inventory : {inventory.count()} rows")

spark.stop()