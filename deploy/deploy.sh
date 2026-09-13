#!/usr/bin/env bash
# Build The Shelf locally as a standalone Next.js server and ship it to the
# server with rsync. Builds locally on purpose: the server is small and a
# Next build there competes with the other apps for memory.
#
# Usage: ./deploy/deploy.sh [ssh-host]   (default: hermes-server-2)
set -euo pipefail

HOST="${1:-hermes-server-2}"
REMOTE_APP="/home/opc/apps/the-shelf"
RELEASE="$(date +%Y%m%d-%H%M%S)"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cd "$ROOT"
echo "▶ Building…"
pnpm install --frozen-lockfile
pnpm build

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
cp -R .next/standalone/. "$STAGE/"
mkdir -p "$STAGE/.next/static" "$STAGE/public"
cp -R .next/static/. "$STAGE/.next/static/"
cp -R public/. "$STAGE/public/"
cp deploy/ecosystem.config.cjs "$STAGE/ecosystem.config.cjs"

echo "▶ Uploading release $RELEASE to $HOST…"
ssh "$HOST" "mkdir -p $REMOTE_APP/releases/$RELEASE"
rsync -az --delete "$STAGE/" "$HOST:$REMOTE_APP/releases/$RELEASE/"

echo "▶ Switching release and restarting…"
ssh "$HOST" bash -s <<REMOTE
set -e
ln -sfn "$REMOTE_APP/releases/$RELEASE" "$REMOTE_APP/current"
cd "$REMOTE_APP/current"
pm2 startOrReload ecosystem.config.cjs --update-env >/dev/null
pm2 save >/dev/null
# keep the last 3 releases
ls -dt $REMOTE_APP/releases/*/ | tail -n +4 | xargs -r rm -rf
sleep 2
curl -s -o /dev/null -w "local :3002 → %{http_code}\n" http://127.0.0.1:3002/
REMOTE
echo "✓ Deployed https://shelf.abzaek.dev"
