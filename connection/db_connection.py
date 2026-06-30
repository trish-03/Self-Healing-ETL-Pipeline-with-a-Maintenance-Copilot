import psycopg2
from config.config import DB_CONFIG

def get_connection():
    return psycopg2.connect(**DB_CONFIG)

#testing
if __name__ == "__main__":
    try:
        conn = get_connection()
        print("connection successful")
    except Exception as e:
        print(f"Connection failed: {e}")