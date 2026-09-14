#!/usr/bin/env bash
# Runs ON THE SERVER after a release directory has been uploaded.
# Usage: bash <release>/deploy/activate.sh <release-name>
# - swaps in the Linux build of better-sqlite3 (server has no compiler)
# - flips the `current` symlink, reloads pm2, prunes old releases
# - health-checks the app on its local port
set -euo pipefail

APP_ROOT="/home/opc/apps/the-shelf"
RELEASE="${1:?release name required}"
RELEASE_DIR="$APP_ROOT/releases/$RELEASE"
[ -d "$RELEASE_DIR" ] || { echo "Release dir $RELEASE_DIR not found"; exit 1; }
[ -f "$APP_ROOT/shelf.env" ] || { echo "Missing $APP_ROOT/shelf.env (SHELF_SESSION_SECRET etc). Aborting."; exit 1; }

NATIVE="$APP_ROOT/native/node_modules/better-sqlite3"
if [ -d "$NATIVE" ]; then
  TARGET=$(find "$RELEASE_DIR/node_modules" -maxdepth 6 -type d -name better-sqlite3 | head -1 || true)
  if [ -n "$TARGET" ]; then rm -rf "$TARGET" && cp -R "$NATIVE" "$TARGET"; fi
fi

PREVIOUS=$(readlink "$APP_ROOT/current" || true)
ln -sfn "$RELEASE_DIR" "$APP_ROOT/current"
cd "$APP_ROOT/current"
pm2 startOrReload ecosystem.config.cjs --update-env >/dev/null
pm2 save >/dev/null

# Health check; roll back the symlink if the new release doesn't answer.
for i in 1 2 3 4 5 6 7 8 9 10; do
  CODE=$(curl -s -o /dev/null -m 5 -w "%{http_code}" http://127.0.0.1:3002/login || true)
  if [ "$CODE" = "200" ]; then break; fi
  sleep 2
done
if [ "$CODE" != "200" ]; then
  echo "Health check failed (got '$CODE')."
  if [ -n "$PREVIOUS" ] && [ -d "$PREVIOUS" ]; then
    echo "Rolling back to $PREVIOUS"
    ln -sfn "$PREVIOUS" "$APP_ROOT/current"
    (cd "$APP_ROOT/current" && pm2 startOrReload ecosystem.config.cjs --update-env >/dev/null)
  fi
  exit 1
fi

# keep the last 3 releases
ls -dt "$APP_ROOT"/releases/*/ | tail -n +4 | xargs -r rm -rf
echo "Activated $RELEASE (login → $CODE)"
