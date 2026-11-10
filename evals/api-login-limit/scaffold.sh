#!/usr/bin/env bash
set -e
mkdir -p src/routes
cat > package.json <<'EOF_FILE'
{ "name": "shop-api", "private": true, "type": "commonjs", "scripts": { "test": "node --test" }, "dependencies": { "express": "^4.19.2", "pg": "^8.11.0" } }
EOF_FILE
cat > src/db.js <<'EOF_FILE'
const { Pool } = require("pg");
const pool = new Pool();
// query(text, params) -> { rows, rowCount }
module.exports = { query: (text, params) => pool.query(text, params), pool };
EOF_FILE
cat > src/auth.js <<'EOF_FILE'
// Sets req.user = { id } from the session cookie, or responds 401.
module.exports = function requireUser(req, res, next) {
  if (!req.session || !req.session.userId) return res.status(401).json({ error: "unauthorized" });
  req.user = { id: req.session.userId };
  next();
};
EOF_FILE
cat > src/app.js <<'EOF_FILE'
const express = require("express");
const app = express();
app.use(express.json());
app.use("/orders", require("./routes/orders"));
app.use("/products", require("./routes/products"));
module.exports = app;
EOF_FILE
cat > src/routes/products.js <<'EOF_FILE'
const router = require("express").Router();
const db = require("../db");
router.get("/:id", async (req, res) => {
  const { rows } = await db.query("select id, name, price_cents, stock from products where id = $1", [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: "not found" });
  res.json(rows[0]);
});
module.exports = router;
EOF_FILE
cat > src/routes/orders.js <<'EOF_FILE'
const router = require("express").Router();
const db = require("../db");
const requireUser = require("../auth");
router.use(requireUser);
router.get("/", async (req, res) => {
  const { rows } = await db.query("select id, product_id, quantity, created_at from orders where user_id = $1 order by created_at desc", [req.user.id]);
  res.json(rows);
});
module.exports = router;
EOF_FILE
cat > schema.sql <<'EOF_FILE'
create table users (id serial primary key, email text not null unique, password_hash text not null);
create table products (id serial primary key, name text not null, price_cents int not null, stock int not null check (stock >= 0));
create table orders (id serial primary key, user_id int not null references users(id), product_id int not null references products(id), quantity int not null, created_at timestamptz not null default now());
EOF_FILE
