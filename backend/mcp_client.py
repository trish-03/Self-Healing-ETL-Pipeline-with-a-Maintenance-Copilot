import sys
from contextlib import AsyncExitStack
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


class MCPClientState:
    """
    Holds the live MCP session for the whole FastAPI process lifetime.
    Mirrors the SparkState pattern in dependencies.py -- one persistent
    connection, not one per request.
    """
    session: ClientSession | None = None
    _exit_stack: AsyncExitStack | None = None


mcp_state = MCPClientState()


async def start_mcp_session():
    """
    Spawns backend/agent_tools.py as a subprocess and opens a real MCP
    client session against it over stdio. This is the actual protocol
    handshake -- list_tools(), call_tool() -- rather than importing the
    decorated functions and calling them as plain Python coroutines.
    """
    server_params = StdioServerParameters(
        command=sys.executable,
        args=["-m", "backend.agent_tools"],
    )

    mcp_state._exit_stack = AsyncExitStack()
    read, write = await mcp_state._exit_stack.enter_async_context(stdio_client(server_params))
    session = await mcp_state._exit_stack.enter_async_context(ClientSession(read, write))
    await session.initialize()

    mcp_state.session = session
    return session


async def stop_mcp_session():
    if mcp_state._exit_stack:
        await mcp_state._exit_stack.aclose()
    mcp_state.session = None


def get_mcp_session() -> ClientSession:
    if mcp_state.session is None:
        raise RuntimeError("MCP session has not been initialized.")
    return mcp_state.session