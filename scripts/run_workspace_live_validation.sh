#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ORACLE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKSPACE_ROOT="$(cd "$ORACLE_ROOT/.." && pwd)"
AA_ROOT="${AA_ROOT:-$WORKSPACE_ROOT/neo-abstract-account}"
MINIAPPS_ROOT="${MINIAPPS_ROOT:-$WORKSPACE_ROOT/neo-miniapps-platform}"

run_oracle=1
run_aa=1
run_miniapps=1

usage() {
  cat <<'EOF'
Usage: scripts/run_workspace_live_validation.sh [--oracle-only|--aa-only|--miniapps-only]

Runs live testnet validation across the MeshMini workspace:
- neo-morpheus-oracle
- neo-abstract-account
- neo-miniapps-platform
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --oracle-only)
      run_oracle=1
      run_aa=0
      run_miniapps=0
      shift
      ;;
    --aa-only)
      run_oracle=0
      run_aa=1
      run_miniapps=0
      shift
      ;;
    --miniapps-only)
      run_oracle=0
      run_aa=0
      run_miniapps=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

WORKSPACE_CONTEXT_JSON="$(
  node "$ORACLE_ROOT/scripts/resolve-workspace-validation-context.mjs" testnet
)"
WORKSPACE_REQUEST_WIF="$(printf '%s' "$WORKSPACE_CONTEXT_JSON" | jq -r '.actors.oracle_test_wif')"
WORKSPACE_REQUEST_PRIVATE_KEY="$(printf '%s' "$WORKSPACE_CONTEXT_JSON" | jq -r '.actors.oracle_test_private_key')"
WORKSPACE_RELAYER_WIF="$(printf '%s' "$WORKSPACE_CONTEXT_JSON" | jq -r '.actors.oracle_runtime_relayer_wif')"
WORKSPACE_RELAYER_PRIVATE_KEY="$(printf '%s' "$WORKSPACE_CONTEXT_JSON" | jq -r '.actors.oracle_runtime_relayer_private_key')"
WORKSPACE_UPDATER_WIF="$(printf '%s' "$WORKSPACE_CONTEXT_JSON" | jq -r '.actors.oracle_runtime_updater_wif')"
WORKSPACE_UPDATER_PRIVATE_KEY="$(printf '%s' "$WORKSPACE_CONTEXT_JSON" | jq -r '.actors.oracle_runtime_updater_private_key')"
WORKSPACE_VERIFIER_WIF="$(printf '%s' "$WORKSPACE_CONTEXT_JSON" | jq -r '.actors.oracle_runtime_verifier_wif')"
WORKSPACE_VERIFIER_PRIVATE_KEY="$(printf '%s' "$WORKSPACE_CONTEXT_JSON" | jq -r '.actors.oracle_runtime_verifier_private_key')"

if [[ $run_oracle -eq 1 ]]; then
  echo ""
  echo "=== Oracle Live Validation ==="
  oracle_args=(--smoke-only)
  if [[ $run_miniapps -eq 1 ]]; then
    oracle_args=(--control-plane-only)
  fi
  if [[ -n "$WORKSPACE_REQUEST_WIF" && "$WORKSPACE_REQUEST_WIF" != "null" ]]; then
    (
      cd "$ORACLE_ROOT" && \
      MORPHEUS_SMOKE_REQUEST_WIF="$WORKSPACE_REQUEST_WIF" \
      NEO_TESTNET_WIF="$WORKSPACE_REQUEST_WIF" \
      NEO_N3_WIF="$WORKSPACE_REQUEST_WIF" \
      MORPHEUS_RELAYER_NEO_N3_WIF_TESTNET="$WORKSPACE_RELAYER_WIF" \
      MORPHEUS_RELAYER_NEO_N3_PRIVATE_KEY_TESTNET="$WORKSPACE_RELAYER_PRIVATE_KEY" \
      MORPHEUS_UPDATER_NEO_N3_WIF_TESTNET="$WORKSPACE_UPDATER_WIF" \
      MORPHEUS_UPDATER_NEO_N3_PRIVATE_KEY_TESTNET="$WORKSPACE_UPDATER_PRIVATE_KEY" \
      MORPHEUS_ORACLE_VERIFIER_WIF_TESTNET="$WORKSPACE_VERIFIER_WIF" \
      MORPHEUS_ORACLE_VERIFIER_PRIVATE_KEY_TESTNET="$WORKSPACE_VERIFIER_PRIVATE_KEY" \
      PHALA_ORACLE_VERIFIER_WIF_TESTNET="$WORKSPACE_VERIFIER_WIF" \
      PHALA_ORACLE_VERIFIER_PRIVATE_KEY_TESTNET="$WORKSPACE_VERIFIER_PRIVATE_KEY" \
      bash scripts/run_live_testnet_validation.sh "${oracle_args[@]}"
    )
  else
    (cd "$ORACLE_ROOT" && bash scripts/run_live_testnet_validation.sh "${oracle_args[@]}")
  fi
fi

if [[ $run_aa -eq 1 ]]; then
  if [[ $run_miniapps -eq 1 ]]; then
    echo ""
    echo "=== AA Live Validation ==="
    echo "[aa-live] skipped because miniapps direct testnet validation already covers the AA paymaster relay path." >&2
  else
    echo ""
    echo "=== AA Live Validation ==="
    (cd "$AA_ROOT" && bash scripts/run_live_testnet_validation.sh --smoke-only)
  fi
fi

if [[ $run_miniapps -eq 1 ]]; then
  echo ""
  echo "=== Miniapps Live Validation ==="
  (cd "$MINIAPPS_ROOT" && npm run test:testnet:live:direct-only)
fi

echo ""
echo "Workspace live validation completed successfully."
