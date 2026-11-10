#!/usr/bin/env bash
cat > search.py <<'PY'
"""Product search endpoint helper. `term` comes straight from the query string."""


def search_products(conn, term):
    cur = conn.cursor()
    cur.execute(f"SELECT id, name FROM products WHERE name LIKE '%{term}%'")
    return cur.fetchall()
PY
