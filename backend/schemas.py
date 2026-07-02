from pydantic import BaseModel, Field

class TableHealthRequest(BaseModel):
    table_name: str = Field(..., example="fact_orders")

class HealthMetrics(BaseModel):
    snapshot_count: int
    live_file_count: int
    average_file_size_bytes: int
    delete_file_count: int

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