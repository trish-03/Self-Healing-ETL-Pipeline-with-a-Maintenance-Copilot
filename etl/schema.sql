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