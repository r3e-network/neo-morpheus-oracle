#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

npm run check:audit:root
npm run test:scripts
npm run test:control-plane
npm run check:worker
npm run test:worker
npm run check:relayer
npm run test:relayer
npm run check:web-content
npm run build:web
npm run lint -- --max-warnings=0
