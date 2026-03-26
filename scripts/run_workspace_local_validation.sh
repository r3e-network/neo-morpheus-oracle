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
Usage: scripts/run_workspace_local_validation.sh [--oracle-only|--aa-only|--miniapps-only]

Runs local validation gates across the MeshMini workspace:
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

if [[ $run_oracle -eq 1 ]]; then
  echo ""
  echo "=== Oracle Local Validation ==="
  (cd "$ORACLE_ROOT" && npm run test:testnet:local-gates)
fi

if [[ $run_aa -eq 1 ]]; then
  echo ""
  echo "=== AA Local Validation ==="
  (cd "$AA_ROOT" && bash scripts/run_local_validation_gates.sh)
fi

if [[ $run_miniapps -eq 1 ]]; then
  echo ""
  echo "=== Miniapps Local Validation ==="
  (cd "$MINIAPPS_ROOT" && npm run test:testnet:local-gates)
fi

echo ""
echo "Workspace local validation completed successfully."
