import os
import sys
from contextlib import asynccontextmanager
from fastapi import FastAPI

# Ensure your backend can look up into your existing connection/config modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from connection.spark_session import get_spark

# Global holder for our persistent Spark session
class SparkState:
    session = None

spark_state = SparkState()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manages Spark session lifecycle alongside the FastAPI server."""
    print("Initializing global Spark Session for API Layer...")
    spark_state.session = get_spark("FastAPILakehouseBackend")
    
    yield  # The FastAPI application runs while this block stays suspended
    
    print("Shutting down global Spark Session...")
    if spark_state.session:
        spark_state.session.stop()

def get_spark_session():
    """Dependency provider to inject the Spark session into tools or endpoints."""
    if not spark_state.session:
        raise RuntimeError("Spark session has not been initialized.")
    return spark_state.session