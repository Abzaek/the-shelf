#!/usr/bin/env bash
# Manual deploy from a workstation. CI does the same thing from
# .github/workflows/ci.yml on every push to main.
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
bash deploy/stage.sh "$STAGE"

echo "▶ Uploading release $RELEASE to $HOST…"
ssh "$HOST" "mkdir -p $REMOTE_APP/releases/$RELEASE"
rsync -az --delete "$STAGE/" "$HOST:$REMOTE_APP/releases/$RELEASE/"

echo "▶ Activating…"
ssh "$HOST" "bash $REMOTE_APP/releases/$RELEASE/deploy/activate.sh $RELEASE"
echo "✓ Deployed https://shelf.abzaek.dev"
