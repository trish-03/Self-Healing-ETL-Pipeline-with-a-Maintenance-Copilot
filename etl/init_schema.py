import os
from connection.db_connection import get_connection

def init_schema():
    conn = get_connection()
    cur = conn.cursor()
    
    schema_path = os.path.join(os.path.dirname(__file__), "schema.sql")
    
    with open(schema_path, "r") as f:
        sql = f.read()
    
    cur.execute(sql)
    conn.commit()
    
    cur.close()
    conn.close()
    print("Schema initialized successfully.")

if __name__ == "__main__":
    init_schema()