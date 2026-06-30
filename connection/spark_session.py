import os
import sys

# Force Spark to use the current virtual environment's Python
os.environ["PYSPARK_PYTHON"] = sys.executable
os.environ["PYSPARK_DRIVER_PYTHON"] = sys.executable

from pyspark.sql import SparkSession
from config.config import SPARK_PACKAGES, WAREHOUSE_PATH, CATALOG_NAME

def get_spark(app_name="LakehouseETL"):
    # Return an existing Spark session if one is already running
    # SparkSession.builder.getOrCreate() reuses the active session automatically
    return (
        SparkSession.builder
        .appName(app_name)
        .config("spark.jars.packages", SPARK_PACKAGES)
        .config(
            "spark.sql.extensions",
            "org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions"
        )
        # Register the Iceberg catalog named "local"
        .config("spark.sql.catalog.local", "org.apache.iceberg.spark.SparkCatalog")
        # Hadoop catalog stores metadata as files on disk, no Hive metastore needed
        .config("spark.sql.catalog.local.type", "hadoop")
        .config("spark.sql.catalog.local.warehouse", WAREHOUSE_PATH)
        .getOrCreate()
    )