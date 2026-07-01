import random
import sys
import os
from datetime import timedelta

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from connection.db_connection import get_connection
# Imported ensure_date_exists from faker_generator alongside the other helpers
from data.faker_generator import generate_one_customer, fake, ensure_date_exists

# Status progression chain -- each status can only move forward to the next one
STATUS_PROGRESSION = {
    "pending": "confirmed",
    "confirmed": "shipped",
    "shipped": "delivered",
    "delivered": "returned",
}

# Chance that a delivered order becomes returned, applied only within the return window
RETURN_CHANCE = 0.08  # 8%, within the 5-10% range agreed on
RETURN_WINDOW_DAYS = 3


def get_eligible_orders(conn, batch_date):
    """Finds orders that can still be advanced.

    Excludes orders already 'returned' (terminal state), and excludes 'delivered'
    orders where more than RETURN_WINDOW_DAYS have passed since updated_at,
    since the return window has closed for those.
    """
    cur = conn.cursor()
    cur.execute("""
        SELECT order_id, status, updated_at FROM raw.orders
        WHERE status != 'returned'
          AND NOT (
              status = 'delivered'
              AND updated_at < %s
          )
    """, (batch_date - timedelta(days=RETURN_WINDOW_DAYS),))
    rows = cur.fetchall()
    cur.close()
    return rows


def advance_order_status(conn, order_id, current_status, batch_date):
    """Moves a single order one step forward in the status chain.

    For 'delivered' orders, only actually advances to 'returned' RETURN_CHANCE
    of the time -- most delivered orders just stay delivered, matching real
    return rates instead of forcing every order to eventually return.
    """
    if current_status == "delivered":
        if random.random() >= RETURN_CHANCE:
            return False  # stays delivered, no change made
        new_status = "returned"
    else:
        new_status = STATUS_PROGRESSION[current_status]

    cur = conn.cursor()
    cur.execute("""
        UPDATE raw.orders
        SET status = %s, updated_at = %s
        WHERE order_id = %s
    """, (new_status, batch_date, order_id))
    conn.commit()
    cur.close()
    return True


def generate_incremental_batch(conn, customer_ids, sku_codes, batch_date, num_updates=10, num_new_orders=5):
    """Simulates one round of real-world activity happening after the initial load.

    Two things happen in one call:
    1. A handful of existing eligible orders advance one step in their status.
    2. A handful of brand-new orders get inserted, dated at batch_date.

    customer_ids is the existing pool from faker_generator.py. 90% of new orders
    reuse an existing customer; 10% of the time a brand-new customer is created
    via generate_one_customer(), reusing the same logic as the Day 1 bulk generator
    instead of duplicating customer-creation code here.

    Returns a dict summary so callers like simulate_batches.py can log progress.
    """
    updated_count = 0
    new_orders_count = 0
    new_customers_count = 0

    # dim_date must already contain batch_date before any order references it
    ensure_date_exists(conn, batch_date.date())

    # --- Part 1: advance existing eligible orders ---
    eligible = get_eligible_orders(conn, batch_date)
    sample_size = min(num_updates, len(eligible))
    sample = random.sample(eligible, sample_size) if sample_size > 0 else []

    for order_id, current_status, _ in sample:
        if advance_order_status(conn, order_id, current_status, batch_date):
            updated_count += 1

    # --- Part 2: insert new orders ---
    cur = conn.cursor()
    for _ in range(num_new_orders):
        # 90% reuse an existing customer, 10% create a brand-new one
        if random.random() < 0.10:
            customer_id = generate_one_customer(conn)
            new_customers_count += 1
        else:
            customer_id = random.choice(customer_ids)

        sku_code = random.choice(sku_codes)  # products always reused, never created here

        order_id = "ORD-" + os.urandom(4).hex().upper()
        date_id = batch_date.strftime("%Y%m%d")
        quantity = random.randint(1, 10)
        total_amount = round(random.uniform(10.0, 2000.0), 2)
        status = "pending"  # all new orders start at the beginning of the chain
        created_at = batch_date
        updated_at = batch_date

        cur.execute("""
            INSERT INTO raw.orders (order_id, customer_id, sku_code, date_id, quantity, total_amount, status, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (order_id) DO NOTHING
        """, (order_id, customer_id, sku_code, date_id, quantity, total_amount, status, created_at, updated_at))

        new_orders_count += 1

    conn.commit()
    cur.close()

    summary = {
        "updated_orders": updated_count,
        "new_orders": new_orders_count,
        "new_customers": new_customers_count,
        "batch_date": batch_date,
    }
    print(f"Batch at {batch_date.date()}: {updated_count} orders advanced, "
          f"{new_orders_count} new orders, {new_customers_count} new customers.")
    return summary


if __name__ == "__main__":
    from datetime import datetime
    from connection.db_connection import get_connection

    conn = get_connection()

    # Fetch existing customer_ids and sku_codes from Postgres to reuse
    cur = conn.cursor()
    cur.execute("SELECT customer_id FROM raw.customers")
    customer_ids = [row[0] for row in cur.fetchall()]
    cur.execute("SELECT sku_code FROM raw.products")
    sku_codes = [row[0] for row in cur.fetchall()]
    cur.close()

    # Fixture's "today" -- the day right after your historical dataset ends
    batch_date = datetime(2025, 1, 1)

    generate_incremental_batch(conn, customer_ids, sku_codes, batch_date)

    conn.close()