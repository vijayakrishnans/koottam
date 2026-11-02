# Runbook

- **Health:** `GET /health` through a service binding; the edge is the only route in.
- **People cannot join:** invites are single use and only their SHA-256 hash is stored, so a lost code cannot be recovered; have an existing member mint another.
- **Query errors after a deploy:** check that `db-migrate` succeeded on that convergence, then rerun its failed lanes.
