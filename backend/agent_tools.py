import httpx
from mcp.server import FastMCP
from pydantic import BaseModel, Field

# Initialize FastMCP Server Context
mcp_server = FastMCP("Lakehouse_Maintenance_Copilot")

FASTAPI_URL = "http://127.0.0.1:8000/api"

# ----------------------------------------------------------------------
# Tool 1: Lakehouse Health Checker
# ----------------------------------------------------------------------

@mcp_server.tool()
async def check_lakehouse_health(table_name: str) -> str:
    """
    Queries an Iceberg table's structural health to detect file fragmentation.
    Use this when a user asks if a table is slow, degraded, or needs optimization.

    Args:
        table_name (str): Name of the target table (e.g., 'fact_orders', 'fact_order_items').
    """
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.get(
                f"{FASTAPI_URL}/health",
                params={"table": table_name}
            )
            if response.status_code != 200:
                return f"Backend Error: {response.json().get('detail', 'Unknown error occurred.')}"

            data = response.json()
            metrics = data["metrics"]

            return (
                f"Table: {data['table_name']}\n"
                f"Status: {data['status']}\n"
                f"----------------------------------------\n"
                f"• Active Snapshots: {metrics['snapshot_count']}\n"
                f"• Live File Count: {metrics['live_file_count']}\n"
                f"• Delete File Count: {metrics['delete_file_count']}\n"
                f"• Avg File Size   : {metrics['average_file_size_bytes'] / 1024:.2f} KB\n"
            )
        except Exception as e:
            import traceback
            traceback.print_exc()  # prints to your uvicorn console
            return f"Failed to reach backend API layer: {str(e)}"


# ----------------------------------------------------------------------
# Tool 2: Maintenance Execution Driver
# ----------------------------------------------------------------------

@mcp_server.tool()
async def optimize_lakehouse_table(table_name: str, confirmed: bool) -> str:
    """
    Triggers data compaction (rewriting small parquet files), delete file
    compaction, and snapshot expiration.

    CRITICAL GUARDRAIL: This changes state and deletes historical snapshots.
    You MUST explicitly ask the user for confirmation before executing this tool.
    Set confirmed=True ONLY if the human explicitly authorized the action.

    Args:
        table_name (str): Name of the target table.
        confirmed (bool): Explicit user confirmation flag.
    """
    if not confirmed:
        return (
            "Action Blocked: This tool requires explicit confirmation from the user. "
            "Please explicitly ask the user to confirm the maintenance action before retrying."
        )

    async with httpx.AsyncClient(timeout=300.0) as client:  # High timeout for heavy Spark executions
        try:
            response = await client.post(
                f"{FASTAPI_URL}/maintenance",
                json={"table_name": table_name, "confirmed": confirmed}
            )
            if response.status_code != 200:
                return f"Maintenance Failed: {response.json().get('detail', 'Reason unmapped.')}"

            data = response.json()
            before = data["before"]
            after = data["after"]

            return (
                f"Optimization Completed Successfully for '{data['table_name']}'!\n\n"
                f"Execution Breakdown:\n"
                f"Files Rewritten (Compacted)     : {data['files_rewritten']}\n"
                f"Delete Files Rewritten          : {data['deletes_rewritten']}\n"
                f"Obsolete Data Files Purged      : {data['files_deleted']}\n\n"
                f"Health Matrix Comparison:\n"
                f"  Metric              | Before         | After\n"
                f"  -----------------------------------------------------\n"
                f"  Snapshots Count     | {before['snapshot_count']:<14} | {after['snapshot_count']}\n"
                f"  Live File Count     | {before['live_file_count']:<14} | {after['live_file_count']}\n"
                f"  Delete File Count   | {before['delete_file_count']:<14} | {after['delete_file_count']}\n"
                f"  Avg File Size (KB)  | {before['average_file_size_bytes']/1024:<14.2f} | {after['average_file_size_bytes']/1024:.2f}\n"
            )
        except Exception as e:
            return f"Spark Execution Pipeline Error: {str(e)}"


# ----------------------------------------------------------------------
# Tool 3: Orphan File Removal
# ----------------------------------------------------------------------

@mcp_server.tool()
async def remove_orphan_lakehouse_files(table_name: str, confirmed: bool) -> str:
    """
    Permanently deletes orphan files -- files present on disk but not
    referenced by any live Iceberg snapshot for this table. This is a
    separate failure mode from fragmentation: orphans typically come
    from failed writes or aborted compactions, not normal table growth.

    CRITICAL GUARDRAIL: This permanently deletes files from disk and
    cannot be undone. You MUST explicitly ask the user for confirmation
    before executing this tool. Set confirmed=True ONLY if the human
    explicitly authorized the action.

    Args:
        table_name (str): Name of the target table.
        confirmed (bool): Explicit user confirmation flag.
    """
    if not confirmed:
        return (
            "Action Blocked: This tool requires explicit confirmation from the user. "
            "Please explicitly ask the user to confirm orphan file removal before retrying."
        )

    async with httpx.AsyncClient(timeout=300.0) as client:
        try:
            response = await client.post(
                f"{FASTAPI_URL}/orphans",
                json={"table_name": table_name, "confirmed": confirmed}
            )
            if response.status_code != 200:
                return f"Orphan Removal Failed: {response.json().get('detail', 'Reason unmapped.')}"

            data = response.json()

            return (
                f"Orphan Removal for '{table_name}':\n"
                f"{data['message']}"
            )
        except Exception as e:
            return f"Spark Execution Pipeline Error: {str(e)}"


if __name__ == "__main__":
    # This instructs the FastMCP instance to begin listening on standard input/output
    mcp_server.run(transport="stdio")