#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

TESTNET_WIF="${TESTNET_WIF:-${NEO_TESTNET_WIF:-}}"
UPDATER_WIF="${UPDATER_WIF:-${MORPHEUS_RELAYER_NEO_N3_WIF:-$TESTNET_WIF}}"
PHALA_TOKEN="${PHALA_TOKEN:-${PHALA_API_TOKEN:-localtest}}"
ORACLE_HASH="${CONTRACT_MORPHEUS_ORACLE_HASH:-0x4b882e94ed766807c4fd728768f972e13008ad52}"

if [[ -z "${TESTNET_WIF}" ]]; then
  echo "TESTNET_WIF or NEO_TESTNET_WIF is required" >&2
  exit 1
fi

if [[ -z "${UPDATER_WIF}" ]]; then
  echo "UPDATER_WIF or MORPHEUS_RELAYER_NEO_N3_WIF is required" >&2
  exit 1
fi

export MORPHEUS_NETWORK=testnet
export MORPHEUS_ACTIVE_CHAINS=neo_n3
export MORPHEUS_RELAYER_NEO_N3_SCAN_MODE=request_cursor
export MORPHEUS_FEED_SYNC_ENABLED=false
export MORPHEUS_AUTOMATION_ENABLED=false
export NEO_RPC_URL="${NEO_RPC_URL:-https://testnet1.neo.coz.io:443}"
export NEO_NETWORK_MAGIC="${NEO_NETWORK_MAGIC:-894710606}"
export CONTRACT_MORPHEUS_ORACLE_HASH="$ORACLE_HASH"
export PHALA_API_URL="${PHALA_API_URL:-http://127.0.0.1:8787}"
export PHALA_API_TOKEN="$PHALA_TOKEN"
export PHALA_SHARED_SECRET="${PHALA_SHARED_SECRET:-$PHALA_TOKEN}"
export NEO_TESTNET_WIF="$TESTNET_WIF"
export MORPHEUS_RELAYER_NEO_N3_WIF="$UPDATER_WIF"
export MORPHEUS_RELAYER_STATE_FILE="${MORPHEUS_RELAYER_STATE_FILE:-/tmp/morpheus-relayer-testnet-live-isolated.json}"
export PORT="${PORT:-8787}"

npm --prefix workers/phala-worker run start &
WORKER_PID=$!

cleanup() {
  kill "$WORKER_PID" 2>/dev/null || true
}

trap cleanup EXIT INT TERM

sleep 2

npm --prefix workers/morpheus-relayer run start
