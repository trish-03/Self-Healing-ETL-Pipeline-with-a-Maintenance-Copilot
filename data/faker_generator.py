import random
from faker import Faker
import uuid
import sys
import os

# Modify the system path to allow importing modules from the parent directory
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Import the database connection utility and the date module
from connection.db_connection import get_connection
from datetime import date, datetime

# Initialize the Faker library to generate realistic mock data
fake = Faker()

# Define global constants for data generation volume and date ranges
NUM_CUSTOMERS = 200
NUM_PRODUCTS = 50
NUM_ORDERS = 1200
DATE_START = "2023-01-01"
DATE_END = "2024-12-31"


def generate_one_customer(conn):
    """Generates and inserts a single customer record. Returns the new customer_id.

    Extracted from generate_customers() so this same logic can be reused by
    generate_customers() (bulk, Day 1) and generate_incremental_batch() (Day 3+),
    instead of duplicating the field-generation code in two places.
    """
    cur = conn.cursor()

    customer_id = str(uuid.uuid4())[:8]
    name = fake.name()
    email = fake.email()
    address = fake.street_address()
    city = fake.city()
    tier = random.choice(["bronze", "silver", "gold"])
    phone = fake.phone_number()[:15]

    cur.execute("""
        INSERT INTO raw.customers (customer_id, name, email, address, city, tier, phone)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (customer_id) DO NOTHING
    """, (customer_id, name, email, address, city, tier, phone))

    conn.commit()
    cur.close()
    return customer_id


def generate_customers(conn):
    """Generates NUM_CUSTOMERS random customer records by calling generate_one_customer() in a loop."""
    customer_ids = []

    for _ in range(NUM_CUSTOMERS):
        customer_id = generate_one_customer(conn)
        customer_ids.append(customer_id)

    print(f"Inserted {len(customer_ids)} customers.")
    return customer_ids


def generate_products(conn):
    """Generates random product catalog items with category-appropriate names."""
    cur = conn.cursor()
    sku_codes = []

    # Mapping categories to sub-categories
    categories = {
        "Electronics": ["Phones", "Laptops", "Accessories"],
        "Clothing": ["Men", "Women", "Kids"],
        "Home": ["Kitchen", "Furniture", "Decor"],
        "Sports": ["Outdoor", "Fitness", "Team Sports"]
    }

    # Replaces fake.bs() corporate jargon with realistic item words
    product_vocab = {
        "Phones": ["Pro Smartphone", "Foldable Phone", "5G Ultra Phone", "Max Display Phone"],
        "Laptops": ["Ultrabook 14-inch", "Gaming Laptop Pro", "Workstation Pro", "Slim Notebook"],
        "Accessories": ["Wireless Earbuds", "Fast Charger Type-C", "Leather Phone Case", "Bluetooth Speaker"],
        "Men": ["Slim-Fit Denim Jeans", "Classic Cotton T-Shirt", "Waterproof Bomber Jacket", "Oxford Dress Shirt"],
        "Women": ["Floral Summer Dress", "High-Waist Yoga Pants", "Oversized Knit Sweater", "Classic Trench Coat"],
        "Kids": ["Organic Cotton Onesie", "Cartoon Print Hoodie", "Denim Overalls", "School Uniform Shirt"],
        "Kitchen": ["Stainless Steel Cookware Set", "Digital Air Fryer", "High-Speed Blender", "Ceramic Coffee Mug"],
        "Furniture": ["Ergonomic Office Chair", "Minimalist Oak Coffee Table", "3-Seater Fabric Sofa", "Bedside Nightstand"],
        "Decor": ["Abstract Canvas Wall Art", "Sented Soy Wax Candle", "Boho Indoor Plant Pot", "LED Desk Lamp"],
        "Outdoor": ["Waterproof 4-Person Tent", "Ultralight Sleeping Bag", "Heavy-Duty Hiking Backpack", "Camping Stove Kit"],
        "Fitness": ["Adjustable Dumbbell Set", "Non-Slip Exercise Mat", "Resistance Bands Pack", "Smart Fitness Tracker"],
        "Team Sports": ["Premium Leather Football", "Professional Basketball", "Graphite Tennis Racket", "Leather Baseball Glove"]
    }

    for _ in range(NUM_PRODUCTS):
        sku_code = "SKU-" + str(uuid.uuid4())[:6].upper()
        
        category = random.choice(list(categories.keys()))
        sub_category = random.choice(categories[category])
        
        # Pick a base name fitting the specific sub-category and append a random modifier
        base_name = random.choice(product_vocab[sub_category])
        modifier = random.choice(["v2", "Elite", "Essentials", "Classic", "Premium", "Series X"])
        product_name = f"{modifier} {base_name}"[:50]

        selling_price = round(random.uniform(5.0, 500.0), 2)
        is_active = random.choice(["Y", "Y", "Y", "N"])

        cur.execute("""
            INSERT INTO raw.products (sku_code, product_name, category, sub_category, selling_price, is_active)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (sku_code) DO NOTHING
        """, (sku_code, product_name, category, sub_category, selling_price, is_active))

        sku_codes.append(sku_code)

    conn.commit()
    cur.close()
    print(f"Inserted {len(sku_codes)} products.")
    return sku_codes


def build_date_record(target_date):
    """Computes all derived date fields for a single date object.
    
    Provides a single source of truth for date calculations across both 
    historical generation and incremental updates.
    """
    date_id = target_date.strftime("%Y%m%d")
    year = target_date.year
    month = target_date.month
    month_name = target_date.strftime("%B")
    day = target_date.day
    day_name = target_date.strftime("%A")
    week = target_date.isocalendar()[1]
    quarter = (month - 1) // 3 + 1
    is_weekend = "Y" if target_date.weekday() >= 5 else "N"
    
    return (date_id, target_date, year, month, month_name, day, day_name, week, quarter, is_weekend)


def ensure_date_exists(conn, target_date):
    """Checks if a date exists in raw.dim_date; if not, builds and inserts it.
    
    This allows the date dimension to grow safely just-in-time when incremental
    batches cross into new dates, preventing foreign key violations.
    """
    cur = conn.cursor()
    date_id = target_date.strftime("%Y%m%d")
    
    # Check if it exists
    cur.execute("SELECT 1 FROM raw.dim_date WHERE date_id = %s", (date_id,))
    exists = cur.fetchone()
    
    if not exists:
        # Build using our single source of truth helper
        record = build_date_record(target_date)
        
        cur.execute("""
            INSERT INTO raw.dim_date (date_id, full_date, year, month, month_name, day, day_name, week, quarter, is_weekend)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (date_id) DO NOTHING
        """, record)
        conn.commit()
        
    cur.close()


def generate_dim_date(conn):
    """Generates a complete date dimension table for analytical reporting."""
    from datetime import timedelta

    start = date.fromisoformat(DATE_START)
    end = date.fromisoformat(DATE_END)
    current = start

    while current <= end:
        # Pass the connection and current date down to the dynamic handler
        ensure_date_exists(conn, current)
        current += timedelta(days=1)

    print(f"Inserted/Verified dim_date from {DATE_START} to {DATE_END}.")


def generate_orders(conn, customer_ids, sku_codes):
    """Generates top-level order headers linking customers to historical dates.

    Status and updated_at are assigned based on how old order_date is relative
    to DATE_END (treated as the historical dataset's "today"):
    - Orders older than 21 days before DATE_END have had time to resolve --
      90% delivered, 10% returned, with updated_at set to a realistic shipping
      delay (2-10 days after created_at; returned orders get a few extra days
      on top, since a return happens after delivery).
    - Orders within the last 21 days before DATE_END are still "in motion" --
      randomly pending, confirmed, or shipped, with updated_at = created_at
      since nothing has happened to them yet.
    """
    from datetime import timedelta

    cur = conn.cursor()
    order_ids = []
    order_dates = {}

    RESOLVED_CUTOFF_DAYS = 21
    date_end = date.fromisoformat(DATE_END)

    for _ in range(NUM_ORDERS):
        order_id = "ORD-" + str(uuid.uuid4())[:8].upper()
        customer_id = random.choice(customer_ids)
        sku_code = random.choice(sku_codes)

        order_date = fake.date_between(start_date=date(2023, 1, 1), end_date=date(2024, 12, 31))
        date_id = order_date.strftime("%Y%m%d")

        quantity = random.randint(1, 10)
        total_amount = round(random.uniform(10.0, 2000.0), 2)

        created_at = datetime.combine(order_date, datetime.min.time())

        # Determine which bucket this order falls into based on its age relative to DATE_END
        days_before_end = (date_end - order_date).days

        if days_before_end > RESOLVED_CUTOFF_DAYS:
            # Resolved order -- assign delivered or returned with a realistic shipping delay
            shipping_delay = random.randint(2, 10)

            if random.random() < 0.10:
                status = "returned"
                # Returned orders get extra days on top of the shipping delay,
                # since a return only happens after delivery already occurred
                return_delay = random.randint(2, 7)
                updated_at = created_at + timedelta(days=shipping_delay + return_delay)
            else:
                status = "delivered"
                updated_at = created_at + timedelta(days=shipping_delay)
        else:
            # Still in motion -- not enough time has passed to resolve
            status = random.choice(["pending", "confirmed", "shipped"])
            updated_at = created_at

        cur.execute("""
            INSERT INTO raw.orders (order_id, customer_id, sku_code, date_id, quantity, total_amount, status, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (order_id) DO NOTHING
        """, (order_id, customer_id, sku_code, date_id, quantity, total_amount, status, created_at, updated_at))

        order_ids.append(order_id)
        order_dates[order_id] = created_at

    conn.commit()
    cur.close()
    print(f"Inserted {len(order_ids)} orders.")
    return order_ids, order_dates


def generate_order_items(conn, order_ids, sku_codes, order_dates):
    """Generates specific line items for each order, including simulated data errors."""
    cur = conn.cursor()
    total_items = 0
    bad_line_total_count = 0

    for order_id in order_ids:
        num_items = random.randint(1, 4)

        for _ in range(num_items):
            item_id = "ITEM-" + str(uuid.uuid4())[:8].upper()
            sku_code = random.choice(sku_codes)
            quantity = random.randint(1, 5)
            unit_price = round(random.uniform(5.0, 500.0), 2)
            discount = round(random.uniform(0.0, 20.0), 2)

            if random.random() < 0.1:
                line_total = round(random.uniform(1.0, 100.0), 2)
                bad_line_total_count += 1
            else:
                line_total = round((unit_price * quantity) - discount, 2)

            created_at = order_dates[order_id]

            cur.execute("""
                INSERT INTO raw.order_items (item_id, order_id, sku_code, quantity, unit_price, discount, line_total, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (item_id) DO NOTHING
            """, (item_id, order_id, sku_code, quantity, unit_price, discount, line_total, created_at))

            total_items += 1

    conn.commit()
    cur.close()
    print(f"Inserted {total_items} order items. ({bad_line_total_count} with bad line_total)")


if __name__ == "__main__":
    conn = get_connection()
    print("connection established")

    print("Generating customers...")
    customer_ids = generate_customers(conn)

    print("Generating products...")
    sku_codes = generate_products(conn)

    print("Generating dim_date...")
    generate_dim_date(conn)

    print("Generating orders...")
    order_ids, order_dates = generate_orders(conn, customer_ids, sku_codes)

    print("Generating order items...")
    generate_order_items(conn, order_ids, sku_codes, order_dates)

    conn.close()
    print("Done.")