import os
import psycopg2

database_url = os.environ['DATABASE_URL']

try:
    # Use sslmode=require for secure connections
    conn = psycopg2.connect(database_url + " sslmode=require")
    cur = conn.cursor()
    cur.execute("SELECT * FROM users WHERE active = true")
    results = cur.fetchall()
finally:
    cur.close()
    conn.close()
