#!/bin/sh
# Migrations first (failure stops the container), then the server as PID 1 for clean SIGTERM.
set -eu
node --disable-warning=ExperimentalWarning scripts/migrate.ts
exec node --disable-warning=ExperimentalWarning server.ts
