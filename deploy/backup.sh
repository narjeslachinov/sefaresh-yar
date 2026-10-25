#!/usr/bin/env bash
set -euo pipefail
DIR=/var/backups/sarfaresh
mkdir -p "$DIR"
STAMP=$(date -u +%Y%m%d-%H%M)
runuser -u postgres -- pg_dump --format=custom sarfaresh > "$DIR/sarfaresh-$STAMP.dump"
find "$DIR" -name 'sarfaresh-*.dump' -mtime +7 -delete