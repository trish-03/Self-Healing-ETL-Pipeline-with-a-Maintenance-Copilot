import random
from faker import Faker
import uuid
import sys
import os

# Modify the system path to allow importing modules from the parent directory
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Import the database connection utility and the date module
from etl.db_connection import get_connection
from datetime import date

# Initialize the Faker library to generate realistic mock data
fake = Faker()

# Define global constants for data generation volume and date ranges
NUM_CUSTOMERS = 200
NUM_PRODUCTS = 50
NUM_ORDERS = 1200
DATE_START = "2023-01-01"
DATE_END = "2024-12-31"

def generate_customers(conn):
    """Generates random customer records and inserts them into the raw database."""
    cur = conn.cursor()
    customer_ids = []
    
    for _ in range(NUM_CUSTOMERS):
        # Generate a unique 8-character ID and mock customer details
        customer_id = str(uuid.uuid4())[:8]
        name = fake.name()
        email = fake.email()
        address = fake.street_address()
        city = fake.city()
        tier = random.choice(["bronze", "silver", "gold"])
        phone = fake.phone_number()[:15] # Truncate to ensure it fits in database limits
        
        # Insert the data into the raw.customers table. 
        # If the customer_id already exists, skip it to avoid duplicates.
        cur.execute("""
            INSERT INTO raw.customers (customer_id, name, email, address, city, tier, phone)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (customer_id) DO NOTHING
        """, (customer_id, name, email, address, city, tier, phone))
        
        customer_ids.append(customer_id)
    
    # Save changes to the database and clean up the cursor
    conn.commit()
    cur.close()
    print(f"Inserted {len(customer_ids)} customers.")
    return customer_ids


def generate_products(conn):
    """Generates random product catalog items grouped by categories."""
    cur = conn.cursor()
    sku_codes = []
    
    # Define a dictionary of categories and their corresponding sub-categories
    categories = {
        "Electronics": ["Phones", "Laptops", "Accessories"],
        "Clothing": ["Men", "Women", "Kids"],
        "Home": ["Kitchen", "Furniture", "Decor"],
        "Sports": ["Outdoor", "Fitness", "Team Sports"]
    }
    
    for _ in range(NUM_PRODUCTS):
        # Generate a unique SKU code and random product details
        sku_code = "SKU-" + str(uuid.uuid4())[:6].upper()
        product_name = fake.bs().title()[:50] # Generates a professional-sounding phrase
        category = random.choice(list(categories.keys()))
        sub_category = random.choice(categories[category])
        selling_price = round(random.uniform(5.0, 500.0), 2)
        
        # Weighted selection: gives a 75% chance the product is active ("Y")
        is_active = random.choice(["Y", "Y", "Y", "N"])
        
        # Insert product into raw.products table while handling existing SKUs
        cur.execute("""
            INSERT INTO raw.products (sku_code, product_name, category, sub_category, selling_price, is_active)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (sku_code) DO NOTHING
        """, (sku_code, product_name, category, sub_category, selling_price, is_active))
        
        sku_codes.append(sku_code)
    
    # Save changes to the database and clean up the cursor
    conn.commit()
    cur.close()
    print(f"Inserted {len(sku_codes)} products.")
    return sku_codes


def generate_dim_date(conn):
    """Generates a complete date dimension table for analytical reporting."""
    from datetime import date, timedelta
    cur = conn.cursor()
    
    # Convert string constants to date objects
    start = date.fromisoformat(DATE_START)
    end = date.fromisoformat(DATE_END)
    current = start
    
    # Loop through every single day between the start and end dates
    while current <= end:
        # Extract various date attributes required for data warehousing
        date_id = current.strftime("%Y%m%d") # Format as string representation like YYYYMMDD
        year = current.year
        month = current.month
        month_name = current.strftime("%B")
        day = current.day
        day_name = current.strftime("%A")
        week = current.isocalendar()[1]
        quarter = (month - 1) // 3 + 1
        is_weekend = "Y" if current.weekday() >= 5 else "N" # Saturday (5) and Sunday (6)
        
        # Insert the date properties into the raw.dim_date table
        cur.execute("""
            INSERT INTO raw.dim_date (date_id, full_date, year, month, month_name, day, day_name, week, quarter, is_weekend)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (date_id) DO NOTHING
        """, (date_id, current, year, month, month_name, day, day_name, week, quarter, is_weekend))
        
        # Move forward to the next day
        current += timedelta(days=1)
    
    # Save changes to the database and clean up the cursor
    conn.commit()
    cur.close()
    print(f"Inserted dim_date from {DATE_START} to {DATE_END}.")


def generate_orders(conn, customer_ids, sku_codes):
    """Generates top-level order headers linking customers to historical dates."""
    from datetime import datetime
    cur = conn.cursor()
    order_ids = []
    
    statuses = ["pending", "confirmed", "shipped", "delivered", "returned"]
    
    for _ in range(NUM_ORDERS):
        # Generate a unique order ID and link it to an existing customer and SKU
        order_id = "ORD-" + str(uuid.uuid4())[:8].upper()
        customer_id = random.choice(customer_ids)
        sku_code = random.choice(sku_codes)
        
        # Choose a random date within our defined timeframe
        order_date = fake.date_between(start_date=date(2023, 1, 1), end_date=date(2024, 12, 31))
        date_id = order_date.strftime("%Y%m%d")
        
        quantity = random.randint(1, 10)
        total_amount = round(random.uniform(10.0, 2000.0), 2)
        status = random.choice(statuses)
        created_at = datetime.now()
        updated_at = datetime.now()
        
        # Insert the metadata into the raw.orders table
        cur.execute("""
            INSERT INTO raw.orders (order_id, customer_id, sku_code, date_id, quantity, total_amount, status, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (order_id) DO NOTHING
        """, (order_id, customer_id, sku_code, date_id, quantity, total_amount, status, created_at, updated_at))
        
        order_ids.append(order_id)
    
    # Save changes to the database and clean up the cursor
    conn.commit()
    cur.close()
    print(f"Inserted {len(order_ids)} orders.")
    return order_ids


def generate_order_items(conn, order_ids, sku_codes):
    """Generates specific line items for each order, including simulated data errors."""
    from datetime import datetime
    cur = conn.cursor()
    total_items = 0
    bad_line_total_count = 0
    
    # Process every generated order to add individual items to it
    for order_id in order_ids:
        # Determine how many distinct items are in this specific order
        num_items = random.randint(1, 4)
        
        for _ in range(num_items):
            item_id = "ITEM-" + str(uuid.uuid4())[:8].upper()
            sku_code = random.choice(sku_codes)
            quantity = random.randint(1, 5)
            unit_price = round(random.uniform(5.0, 500.0), 2)
            discount = round(random.uniform(0.0, 20.0), 2)
            
            # Intentional dirty data logic: roughly 10% of the entries will calculate total incorrectly
            if random.random() < 0.1:
                line_total = round(random.uniform(1.0, 100.0), 2)  # Completely random wrong price
                bad_line_total_count += 1
            else:
                line_total = round((unit_price * quantity) - discount, 2)  # Expected mathematical total
            
            created_at = datetime.now()
            
            # Insert item level records into raw.order_items table
            cur.execute("""
                INSERT INTO raw.order_items (item_id, order_id, sku_code, quantity, unit_price, discount, line_total, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (item_id) DO NOTHING
            """, (item_id, order_id, sku_code, quantity, unit_price, discount, line_total, created_at))
            
            total_items += 1
    
    # Save changes to the database and clean up the cursor
    conn.commit()
    cur.close()
    print(f"Inserted {total_items} order items. ({bad_line_total_count} with bad line_total)")


if __name__ == "__main__":
    # Orchestrate the entire mock data generation pipeline sequence
    conn = get_connection()
    print("connection established")
    
    print("Generating customers...")
    customer_ids = generate_customers(conn)
    
    print("Generating products...")
    sku_codes = generate_products(conn)
    
    print("Generating dim_date...")
    generate_dim_date(conn)
    
    print("Generating orders...")
    order_ids = generate_orders(conn, customer_ids, sku_codes)
    
    print("Generating order items...")
    generate_order_items(conn, order_ids, sku_codes)
    
    # Close the database connection when finished
    conn.close()
    print("Done.")