#!/usr/bin/env bash
# Assembles the standalone build into a deployable directory.
# Usage: bash deploy/stage.sh <target-dir>   (run after `pnpm build`)
set -euo pipefail
STAGE="${1:?target dir required}"
mkdir -p "$STAGE"
cp -R .next/standalone/. "$STAGE/"
mkdir -p "$STAGE/.next/static" "$STAGE/public" "$STAGE/deploy"
cp -R .next/static/. "$STAGE/.next/static/"
cp -R public/. "$STAGE/public/"
cp deploy/ecosystem.config.cjs "$STAGE/ecosystem.config.cjs"
cp deploy/activate.sh "$STAGE/deploy/activate.sh"
echo "staged → $STAGE"
