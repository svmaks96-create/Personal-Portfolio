# Deferred Work

## Deferred from: code review of 1-1-project-setup-with-database-and-seed-data (2026-04-06)

- No unique constraint on `market_data (symbol, type, date)` — non-unique index allows duplicate rows; queries need ORDER BY + LIMIT 1 for correctness
- No WAL mode or `busy_timeout` configured on SQLite connection — concurrent writes will throw SQLITE_BUSY under load
- DB connection singleton has no graceful shutdown hook — SIGTERM may not flush WAL/journal
- `quantity`/`price`/`fees` columns accept negative values with no CHECK constraint — downstream code must validate
- `date` TEXT column has no ISO 8601 format enforcement at DB level — relies on application convention
- `fee` rows have `quantity: 0, price: 0` — computation engine (Story 1.2) must guard against division by zero
