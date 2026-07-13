# Self-Healing ETL Pipeline with a Maintenance Copilot

Internal lakehouse maintenance tool for keeping Iceberg tables readable, compact, and explainable.

## Project Overview

This project simulates a small data platform that ingests operational order and inventory data into Postgres, loads it into Apache Iceberg through Spark, and exposes a FastAPI backend plus React dashboard for daily maintenance work.

The business scenario is a data engineering team that needs to keep a retail-style lakehouse healthy without hand-running Spark jobs all day. The copilot helps them answer questions like:

- Is a table fragmented enough to compact?
- Did the last load create delete-file bloat or orphan files?
- What changed after maintenance?
- Why did an OCC write fail?

## Architecture

Image in progress.

PostgreSQL (raw schema, OLTP)
   │
   ├── initial_load.py    ── one-time bulk load, dims get surrogate keys
   ├── incremental_load.py── watermark-driven CDC, MERGE into facts
   └── inventory_load.py  ── snapshot load for OCC demo table
   │
   ▼
Apache Iceberg (warehouse schema, Hadoop catalog)
   dim_customer, dim_product, dim_date
   fact_orders, fact_order_items, fact_inventory
   │
   ▼
maintenance/ ── health monitoring + self-healing operations

```text
Postgres raw schema
	-> Spark JDBC ingest
	-> Apache Iceberg warehouse
	-> FastAPI backend
	-> MCP tools + Groq-hosted agent
	-> React dashboard / Copilot drawer
```

The main runtime path is:

1. Postgres stores the source and operational tables in the `raw` schema.
2. Spark reads those tables over JDBC and writes Iceberg tables into the local warehouse.
3. FastAPI serves health, maintenance, simulation, OCC, chat, and websocket endpoints.
4. The MCP layer exposes read-only and guarded maintenance tools to the agent.
5. The React frontend displays table health, maintenance history, simulation controls, OCC runs, and chat.

## Tech Stack

Backend and data:

- Python 3.13
- FastAPI
- Uvicorn
- APScheduler
- Apache Spark 4.1.x
- Apache Iceberg 1.11.0
- PostgreSQL via `psycopg2`
- MCP server/client tooling
- OpenAI SDK pointed at Groq for the agent runtime
- Pandas, Pydantic, Faker, HTTPX, python-dotenv

Frontend:

- React 19
- Vite
- TypeScript
- Tailwind CSS
- TanStack Query
- Jotai
- Axios
- Recharts
- Lucide React

## Data Model

Image in process

### Operational source tables in `raw`

- `customers` - customer master data
- `products` - product master data
- `dim_date` - calendar dimension
- `orders` - order header fact
- `order_items` - order line fact
- `pipeline_watermark` - incremental load checkpoint
- `table_health_history` - health snapshots captured by the maintenance loop
- `occ_conflict_log` - OCC demo results
- `fact_inventory` - inventory fact used by the simulation and health flows

### Relationships

- `orders.customer_id -> customers.customer_id`
- `orders.sku_code -> products.sku_code`
- `orders.date_id -> dim_date.date_id`
- `order_items.order_id -> orders.order_id`
- `order_items.sku_code -> products.sku_code`

### Iceberg / maintenance facts

- `fact_orders` and `fact_order_items` are the two Iceberg tables the maintenance copilot watches most closely.
- The health layer records live file count, physical file count, delete-file count, snapshot count, manifest count, metadata JSON count, orphan file count, and partition distribution.
- OCC history is tracked separately so the frontend can explain concurrency failures without guessing.

## Setup And Run

These steps are intended to work from a clean clone.

### Prerequisites

- Python 3.13
- Node.js 20+ for the frontend
- A running PostgreSQL instance with the `raw` schema available
- Java installed for Spark
- A Groq API key for the agent runtime
- A shell environment that can run Spark with the warehouse path used by the repo

Important: the current Spark warehouse path is configured as `/tmp/warehouse` in `config/config.py`. On native Windows, run the project in WSL2/Linux or adjust that path before starting Spark.

### 1. Configure environment variables

Create a `.env` file at the repository root with the same keys shown in `.env.example`:

```env
DB_HOST=yourhostname
DB_PORT=yourport
DB_NAME=yourdatabasename
DB_USER=yourusername
DB_PASSWORD=yourpassword

GEMINI_API_KEY=yourgeminiapikey
GROQ_API_KEY=yourgroqapikey
```

### 2. Install backend dependencies

From the repository root:

```bash
uv sync
```

### 3. Start the backend

```bash
uv run uvicorn backend.main:app --reload --port 8000
```

The backend exposes routes under `/api`, including:

- `/api/health`
- `/api/health/history`
- `/api/maintenance`
- `/api/orphans`
- `/api/simulate`
- `/api/watermark`
- `/api/reset`
- `/api/chat`
- `/api/occ/run`
- `/api/occ/conflicts`
- `/api/ws/alerts`

### 4. Start the frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

### 5. Seed or refresh data

The repo includes scripts under `data/` and `etl/` for building the source tables and loading Iceberg. The most important ones are:

- `etl/initial_load.py` for the initial Spark-to-Iceberg load
- `etl/incremental_load.py` for checkpointed incremental updates
- `etl/simulate_batches.py` for generating repeatable load activity

Run them only after the database and environment variables are in place.

## Key Forensic Findings

These are the kinds of concrete outputs the project uses to prove the system is doing real work.

### Snapshot and manifest evidence

From the notebook, the Iceberg snapshot summary showed the commit actually rewrote data and metadata instead of just pretending to:

```text
|committed_at           |operation|files_added|
|2026-07-01 06:35:43.634|overwrite|25         |
|2026-07-01 06:36:37.348|overwrite|1          |
|2026-07-01 06:36:41.55 |overwrite|2          |
```

The same snapshot history also exposed Iceberg’s commit-level metadata:

```text
|manifests-created -> 2|
|manifests-replaced -> 1|
|added-data-files -> 1|
|deleted-data-files -> 1|
|total-data-files -> 1|
|total-delete-files -> 0|
|format-version -> 2|
|write.merge.mode -> merge-on-read|
```

The `fact_orders.manifests` table returned a manifest count of 6 in the notebook run, which is the clearest proof that the table had accumulated multiple manifest entries over time.

### Before / after storage evidence

The warehouse scan showed a fragmented physical layout before cleanup:

```text
Scanning: D:\tmp\warehouse\warehouse\fact_orders\data
Total physical parquet files on disk: 41
Total size: 1259.6 KB
```

After a later maintenance pass, the Iceberg table state showed a single live data file and a long tail of delete files still present in the warehouse:

```text
|file_path                                                                                               |file_size_in_bytes|
|/tmp/warehouse/warehouse/fact_orders/data/00000-806-78810081-f0c9-4350-9455-1b75905b2c9e-0-00001.parquet|32828             |
```

And the delete-file listing made the Merge-on-Read behavior obvious:

```text
|/tmp/warehouse/warehouse/fact_orders/data/00000-1052-6f910fcb-4995-4d01-9019-6f6d42c08b1a-00001-deletes.parquet|1513|
|/tmp/warehouse/warehouse/fact_orders/data/00000-700-d306f726-e0d9-49a6-b18d-ad992e9382d9-00004-deletes.parquet |1508|
|/tmp/warehouse/warehouse/fact_orders/data/00000-638-...-deletes.parquet                                        |... |
```

### Table-property evidence

The table properties confirmed the Iceberg write mode in use:

```text
|key                            |value              |
|current-snapshot-id            |3191331259433771885|
|format                         |iceberg/parquet    |
|format-version                 |2                  |
|write.delete.mode              |merge-on-read      |
|write.merge.mode               |merge-on-read      |
|write.update.mode              |merge-on-read      |
```

## Demo Script

Use these prompts or actions during a demo:

1. Ask the copilot to explain why `fact_orders` is fragmented and whether maintenance is needed.
2. Run the OCC demo and ask it to explain the failed writer versus the committed writer.
3. Trigger an optimization for `fact_orders` and compare the before/after health history.
4. Ask for orphan-file risk after a failed write or interrupted compaction.
5. Switch to the chart view and inspect the maintenance trend over time.

Sample user questions:

- “Why did the health check mark this table as fragmented?”
- “What changed after compaction?”
- “Explain the OCC conflict in plain English.”
- “Can I trust this file-count number?”
- “What should I do if delete files keep growing?”

## Challenges Attempted And What I Learned

- The agent must be grounded in live tool output. If a tool returns stale or incomplete data, the answer becomes stale or incomplete too, so the prompts explicitly forbid inventing metrics.
- The first assumption I had to correct was the partitioning story: `fact_orders` was intended to be partitioned by month in `etl/initial_load.py`, but the partition transform is currently commented out, so there is no verified partition-pruning win to claim in this build.
- Merge-on-Read keeps delete files around even when data files have been compacted, so a low live-file count is not the same thing as a fully cleaned table.
- The warehouse history tables are what make the demo trustworthy: `raw.table_health_history` and `raw.occ_conflict_log` let the frontend show real history instead of fabricated charts.

## Answers To The Required Reflection Questions

### 4.1 Data And Iceberg Understanding

**What did the Metadata File, Manifest List, and Manifest File contain, and how was it verified?**

- The metadata file held table-level state: current schema, table properties, format version, snapshot pointer, and the current Iceberg catalog state. I verified this through the table properties and snapshot metadata shown in Spark, including `format-version`, `write.merge.mode`, and the current snapshot id.
- The manifest list held the snapshot-level list of manifests for a commit, plus summary counters such as data files added, delete files added, and manifest replacement counts. I verified this through the snapshot summary output in the notebook, where the commit details included `manifests-created`, `manifests-replaced`, `added-data-files`, and `deleted-data-files`.
- The manifest file held the file-level entries: actual data files and delete files referenced by the snapshot. I verified this by querying Iceberg metadata tables such as `fact_orders.files` and `fact_orders.manifests`, and by comparing live file counts with the physical parquet files in the warehouse.

**Where exactly did partition pruning save work, and what evidence was used?**

- In this exact build, I do not have a verified partition-pruning win to claim. The source shows the intended month partition transform on `fact_orders`, but that line is currently commented out in `etl/initial_load.py`.
- Because of that, I would not present pruning as a proven result here. The honest evidence is the code itself plus the absence of a scan plan showing a real partition filter benefit.

**What would go wrong if a schema change used rename instead of evolution?**

- A rename would break historical readers that still expect the old column identity, because Iceberg tracks field identity with field IDs, not just names.
- If you renamed a column instead of evolving it carefully, older snapshots and downstream jobs could interpret the column as missing or as a different field entirely.
- Field IDs avoid that pitfall by preserving the logical identity of the column across schema changes even when the human-readable name changes.

### 4.2 AI Agent And Engineering Understanding

**Which parts of the MCP tool output does the agent actually rely on?**

- It relies on the actual tool payload returned by the backend for health, maintenance, orphan removal, OCC demo, and OCC history.
- The agent is explicitly instructed not to invent numbers. If the tool output is wrong, stale, or missing fields, the answer will reflect that bad input.
- That means the trust boundary is the tool output, not the model’s prose.

**Where did I have to override, correct, or sanity-check something the AI assistant generated?**

- I had to sanity-check the partition-pruning story against the source code, because the first pass looked like the table was partitioned when it is not currently written that way.
- I also checked the notebook outputs before writing any forensic claims so the README only includes values that were actually observed.

**If a stakeholder asked “can I trust this number?”, what would I point to?**

- `raw.table_health_history`
- `raw.occ_conflict_log`
- Iceberg snapshot summaries and metadata tables
- The maintenance before/after rows written by the backend

Those sources are the audit trail for the dashboard and the copilot.

### 4.3 Business Understanding

**Who would actually use this, and what decision would they make differently?**

- Data engineers, platform engineers, and on-call analytics owners would use it.
- They would use it to decide whether to compact a table, clean orphan files, trust a health warning, or investigate an OCC failure before a downstream consumer complains.

**What is the biggest risk if the pipeline silently broke for a week, and would the system catch it?**

- The biggest risk is that the lakehouse could keep serving stale order or inventory state while everyone assumes the pipeline is healthy.
- The scheduler and history tables help catch degradation, but a source-ingestion failure could still be missed if the health-check path itself remains up while upstream data stops changing.

## Notes

- The frontend is a single-shell dashboard with view switching rather than router-based navigation.
- The OCC demo is wired for `fact_inventory`.
- The backend uses a shared Spark session and a shared MCP client session during the FastAPI lifespan.