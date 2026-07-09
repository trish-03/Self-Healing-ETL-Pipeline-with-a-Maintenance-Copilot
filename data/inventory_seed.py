import random
from datetime import datetime

from connection.db_connection import get_connection


WAREHOUSES = [
    "WH001",
    "WH002",
    "WH003"
]


def seed_inventory():
    conn = get_connection()
    cur = conn.cursor()

    try:
        # Get all existing products
        cur.execute("""
            SELECT sku_code
            FROM raw.products
            ORDER BY sku_code
        """)

        products = [row[0] for row in cur.fetchall()]

        if not products:
            raise Exception("No products found. Seed products before inventory.")

        # Reset inventory
        cur.execute("TRUNCATE TABLE raw.fact_inventory RESTART IDENTITY;")

        now = datetime.now()

        inventory_rows = []

        inventory_counter = 1

        # Create one inventory record per product
        for sku in products:
            inventory_rows.append(
                (
                    f"INV{inventory_counter:05d}",
                    sku,
                    random.choice(WAREHOUSES),
                    random.randint(20, 100),
                    now
                )
            )
            inventory_counter += 1

        cur.executemany(
            """
            INSERT INTO raw.fact_inventory (
                inventory_id,
                sku_code,
                warehouse_id,
                quantity,
                updated_at
            )
            VALUES (%s, %s, %s, %s, %s)
            """,
            inventory_rows
        )

        conn.commit()

        print(f"Inserted {len(inventory_rows)} inventory records.")

    except Exception as e:
        conn.rollback()
        print(f"Inventory seed failed: {e}")

    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    seed_inventory()