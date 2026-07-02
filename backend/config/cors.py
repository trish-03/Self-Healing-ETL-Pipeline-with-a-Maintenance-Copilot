from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Define the authorized client applications allowed to connect to this API
ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

def setup_cors(app: FastAPI) -> None:
    """
    Configures and applies the Cross-Origin Resource Sharing (CORS) rules 
    to the provided FastAPI application instance.
    """
    app.add_middleware(
        CORSMiddleware,
        allow_origins=ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],  # Allows standard GET, POST, PUT, DELETE, OPTIONS
        allow_headers=["*"],  # Allows all security and application tokens
    )