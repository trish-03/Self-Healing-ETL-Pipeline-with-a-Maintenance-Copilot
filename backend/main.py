from fastapi import FastAPI

from backend.dependencies import lifespan
from backend.config.cors import setup_cors
from backend.routers import health, maintenance, orphans, simulation, chat, occ

app = FastAPI(
    title="Lakehouse Maintenance Copilot Backend",
    version="1.0.0",
    lifespan=lifespan
)

setup_cors(app)

app.include_router(health.router)
app.include_router(maintenance.router)
app.include_router(orphans.router)
app.include_router(simulation.router)
app.include_router(chat.router)
app.include_router(occ.router)