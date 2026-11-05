#!/usr/bin/env bash
set -e
mkdir -p migrations
cat > migrations/0001_create_customers.sql <<'EOF_FILE'
CREATE TABLE customers (id serial PRIMARY KEY, name text NOT NULL);
EOF_FILE
mkdir -p migrations
cat > migrations/0002_create_invoices.sql <<'EOF_FILE'
CREATE TABLE invoices (id serial PRIMARY KEY, customer_id int REFERENCES customers(id));
EOF_FILE
mkdir -p migrations
cat > migrations/0003_invoice_status.sql <<'EOF_FILE'
ALTER TABLE invoices ADD COLUMN status text NOT NULL DEFAULT 'open';
EOF_FILE
mkdir -p app
cat > app/__init__.py <<'EOF_FILE'
EOF_FILE
mkdir -p app/models
cat > app/models/__init__.py <<'EOF_FILE'
EOF_FILE
mkdir -p app/models
cat > app/models/invoice.py <<'EOF_FILE'
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Invoice(Base):
    __tablename__ = "invoices"

    id: Mapped[int] = mapped_column(primary_key=True)
    customer_id: Mapped[int]
    status: Mapped[str] = mapped_column(default="open")
EOF_FILE
cat > Makefile <<'EOF_FILE'
test:
	pytest -q

lint:
	ruff check . && mypy app
EOF_FILE
cat > CLAUDE.md <<'EOF_FILE'
# billing-service

Billing API for the shop. Python 3.12, FastAPI, SQLAlchemy 2, Postgres 16.

## Layout
- `app/api/` HTTP routes
- `app/models/` SQLAlchemy models
- `app/services/` business logic
- `migrations/` raw SQL migrations, applied in file-name order
- `tests/` pytest suites

## Commands
- `make test` runs pytest
- `make lint` runs ruff and mypy

<important if="you are adding or changing HTTP routes">
## Routes

- Every route has a response model.
- Return 404 with `{"error": "not_found"}`, never an empty 200.
- Version routes under `/v1/`.
</important>

<important if="you are writing or changing tests">
## Tests

- One test file per service module.
- Use the `db_session` fixture, never a real connection.
- Name tests `test_<behaviour>_when_<condition>`.
</important>

<important if="you are adding or changing a database migration">
## Migrations

- Name the file `NNNN_<slug>.sql`, where NNNN is the next number after the highest existing one, zero-padded to 4 digits.
- Every migration has two parts, marked `-- up` and `-- down`. The down part undoes the up part.
- Never edit a migration that is already in `migrations/`; add a new one.
</important>

<important if="you are handling money amounts">
## Money

- Store amounts as integer cents in a column named `<name>_cents`.
- Never use float for money.
- Round half to even.
</important>

<important if="you are adding logging">
## Logging

- Use `structlog`, never `print`.
- Never log card numbers or emails.
</important>

<important if="you are adding a dependency">
## Dependencies

- Pin exact versions in `requirements.txt`.
- Ask before adding anything over 1 MB.
</important>

<important if="you are changing configuration or environment variables">
## Configuration

- All settings come from `app/config.py`.
- New env vars get a default and a line in `.env.example`.
</important>

<important if="you are writing or changing service functions">
## Services

- Services take a session as the first argument.
- Services never commit; the route commits.
</important>
EOF_FILE
