from pydantic import BaseModel, Field
from datetime import datetime

class TableHealthRequest(BaseModel):
    table_name: str = Field(..., example="fact_orders")

class HealthMetrics(BaseModel):
    # Storage
    live_file_count: int
    physical_file_count: int
    average_file_size_bytes: int

    # Delete files (Merge-on-Read)
    delete_file_count: int

    # Metadata
    snapshot_count: int
    manifest_count: int
    metadata_json_count: int

    # Cleanup (read-only dry-run count; actual removal is a separate action)
    orphan_file_count: int

class TableHealthResponse(BaseModel):
    table_name: str
    status: str = Field(description="Will be 'HEALTHY' or 'FRAGMENTED' based on thresholds")
    metrics: HealthMetrics

class MaintenanceRequest(BaseModel):
    table_name: str = Field(..., example="fact_orders")
    confirmed: bool = Field(..., description="Must be explicitly True from the user to execute.")

class MaintenanceResponse(BaseModel):
    maintenance_executed: bool
    message: str
    files_rewritten: int
    deletes_rewritten: int
    files_deleted: int
    before: HealthMetrics
    after: HealthMetrics

class OrphanRemovalRequest(BaseModel):
    table_name: str = Field(..., example="fact_orders")
    confirmed: bool = Field(..., description="Must be explicitly True from the user to execute.")

class OrphanRemovalResponse(BaseModel):
    executed: bool
    message: str
    orphan_file_count: int | None

class HealthHistoryEntry(BaseModel):
    checked_at: datetime
    live_file_count: int | None
    physical_file_count: int | None
    average_file_size_bytes: float | None
    delete_file_count: int | None
    snapshot_count: int | None
    manifest_count: int | None
    metadata_json_count: int | None
    orphan_file_count: int | None
    event_type: str

class HealthHistoryResponse(BaseModel):
    table_name: str
    history: list[HealthHistoryEntry]