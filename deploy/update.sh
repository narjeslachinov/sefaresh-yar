#!/usr/bin/env bash
# On the server, as root:  bash /opt/sarfaresh/deploy/update.sh /tmp/sarfaresh.tar.gz
set -euo pipefail

APP_DIR=/opt/sarfaresh
ARCHIVE="${1:?usage: update.sh path/to/sarfaresh.tar.gz}"

systemctl stop sarfaresh 2>/dev/null || true
tar -xzf "$ARCHIVE" -C "$APP_DIR" --no-same-owner
chown -R sarfaresh:sarfaresh "$APP_DIR"
cd "$APP_DIR"

# The build checks the environment too (production refuses example secrets), so load it.
runuser -u sarfaresh -- bash -c '
  set -euo pipefail
  export HOME=/opt/sarfaresh
  cd /opt/sarfaresh
  npm ci
  set -a; . /etc/sarfaresh/app.env; set +a
  npm run build
'

node --env-file=/etc/sarfaresh/admin.env scripts/migrate.mjs

systemctl start sarfaresh
sleep 4
curl -fsS http://127.0.0.1:3000/api/health && echo " <- app is up"