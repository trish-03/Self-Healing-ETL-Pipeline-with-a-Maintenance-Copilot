CREATE SCHEMA IF NOT EXISTS raw;

CREATE TABLE IF NOT EXISTS raw.customers (
    customer_id TEXT PRIMARY KEY,
    name TEXT,
    email TEXT,
    address TEXT,
    city TEXT,
    tier TEXT,
    phone TEXT
);

CREATE TABLE IF NOT EXISTS raw.products (
    sku_code TEXT PRIMARY KEY,
    product_name TEXT,
    category TEXT,
    sub_category TEXT,
    selling_price FLOAT,
    is_active CHAR(1)
);

CREATE TABLE IF NOT EXISTS raw.dim_date (
    date_id TEXT PRIMARY KEY,
    full_date DATE,
    year INT,
    month INT,
    month_name TEXT,
    day INT,
    day_name TEXT,
    week INT,
    quarter INT,
    is_weekend CHAR(1)
);

CREATE TABLE IF NOT EXISTS raw.orders (
    order_id TEXT PRIMARY KEY,
    customer_id TEXT REFERENCES raw.customers(customer_id),
    sku_code TEXT REFERENCES raw.products(sku_code),
    date_id TEXT REFERENCES raw.dim_date(date_id),
    quantity INT,
    total_amount FLOAT,
    status TEXT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS raw.order_items (
    item_id TEXT PRIMARY KEY,
    order_id TEXT REFERENCES raw.orders(order_id),
    sku_code TEXT REFERENCES raw.products(sku_code),
    quantity INT,
    unit_price FLOAT,
    discount FLOAT,
    line_total FLOAT,
    created_at TIMESTAMP
);

DROP TABLE IF EXISTS raw.pipeline_watermark;

CREATE TABLE IF NOT EXISTS raw.pipeline_watermark (
    source_name     TEXT NOT NULL,
    stage           TEXT NOT NULL CHECK (stage IN ('bronze', 'silver', 'gold')),
    last_loaded_at  TIMESTAMP NOT NULL,
    updated_at      TIMESTAMP NOT NULL DEFAULT now(),
    PRIMARY KEY (source_name, stage)
);

CREATE TABLE IF NOT EXISTS raw.table_health_history (
    id                      SERIAL PRIMARY KEY,
    table_name              TEXT NOT NULL,
    checked_at              TIMESTAMP NOT NULL,

    -- Storage metrics
    live_file_count         INTEGER,
    physical_file_count     INTEGER,
    average_file_size_bytes DOUBLE PRECISION,

    -- Delete file metrics (MoR)
    delete_file_count       INTEGER,

    -- Metadata metrics
    snapshot_count          INTEGER,
    manifest_count          INTEGER,
    metadata_json_count     INTEGER,

    -- Cleanup metric
    orphan_file_count       INTEGER,

    -- Context: was this a plain health check, or a maintenance before/after snapshot?
    event_type              TEXT NOT NULL DEFAULT 'health_check'
                             CHECK (event_type IN ('health_check', 'maintenance_before', 'maintenance_after', 'orphan_removal'))
);

CREATE INDEX IF NOT EXISTS idx_health_history_table_time
    ON raw.table_health_history (table_name, checked_at);


CREATE TABLE IF NOT EXISTS raw.occ_conflict_log (
    id                SERIAL PRIMARY KEY,
    table_name        TEXT NOT NULL,
    writer_id         INTEGER NOT NULL,
    attempted_at      TIMESTAMP NOT NULL DEFAULT now(),
    outcome           TEXT NOT NULL CHECK (outcome IN ('committed', 'conflict_failed')),
    error_type        TEXT,
    error_message     TEXT
);

CREATE INDEX IF NOT EXISTS idx_occ_conflict_log_table_time
    ON raw.occ_conflict_log (table_name, attempted_at);


CREATE TABLE IF NOT EXISTS raw.fact_inventory (
    inventory_id      TEXT PRIMARY KEY,
    sku_code         TEXT,
    warehouse_id       TEXT,
    quantity     INT,
    updated_at   TIMESTAMP NOT NULL
);