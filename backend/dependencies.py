import os
import sys
from contextlib import asynccontextmanager
from fastapi import FastAPI

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from connection.spark_session import get_spark
from backend.mcp_client import start_mcp_session, stop_mcp_session

class SparkState:
    session = None

spark_state = SparkState()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manages Spark and MCP client lifecycle alongside the FastAPI server."""
    print("Initializing global Spark Session for API Layer...")
    spark_state.session = get_spark("FastAPILakehouseBackend")

    print("Starting MCP client session...")
    await start_mcp_session()

    yield

    print("Shutting down MCP client session...")
    await stop_mcp_session()

    print("Shutting down global Spark Session...")
    if spark_state.session:
        spark_state.session.stop()

def get_spark_session():
    if not spark_state.session:
        raise RuntimeError("Spark session has not been initialized.")
    return spark_state.session