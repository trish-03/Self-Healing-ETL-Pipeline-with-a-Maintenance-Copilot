import os
from dotenv import load_dotenv

load_dotenv()

#connecting to postgres
DB_CONFIG = {
    "host": os.getenv("DB_HOST"),
    "port": os.getenv("DB_PORT"),
    "database": os.getenv("DB_NAME"),
    "user": os.getenv("DB_USER"),
    "password": os.getenv("DB_PASSWORD")
}

WAREHOUSE_PATH = "/tmp/warehouse"
CATALOG_NAME = "local"

# Properties passed to Spark's JDBC reader
# currentSchema tells the JDBC driver to look in the raw schema by default
JDBC_PROPS = {
    "user": DB_CONFIG["user"],
    "password": DB_CONFIG["password"],
    "driver": "org.postgresql.Driver",
    "currentSchema": "raw"
}

# Maven coordinates for Spark packages downloaded at session startup
# iceberg-spark-runtime: adds Iceberg read/write support to Spark
# postgresql: JDBC driver so Spark can talk to Postgres
SPARK_PACKAGES = (
    "org.apache.iceberg:iceberg-spark-runtime-4.1_2.13:1.11.0,"
    "org.postgresql:postgresql:42.7.4"
)