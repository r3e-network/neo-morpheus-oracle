#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

run_control_plane=1
run_oracle=1
run_verify=1

usage() {
  cat <<'EOF'
Usage: scripts/run_live_testnet_validation.sh [--smoke-only|--verify-only|--control-plane-only|--oracle-only]

Runs live testnet validation for neo-morpheus-oracle:
- control-plane smoke
- oracle smoke
- verify:n3
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --smoke-only)
      run_control_plane=1
      run_oracle=1
      run_verify=0
      shift
      ;;
    --verify-only)
      run_control_plane=0
      run_oracle=0
      run_verify=1
      shift
      ;;
    --control-plane-only)
      run_control_plane=1
      run_oracle=0
      run_verify=0
      shift
      ;;
    --oracle-only)
      run_control_plane=0
      run_oracle=1
      run_verify=0
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

cd "$REPO_ROOT"

if [[ $run_control_plane -eq 1 ]]; then
  echo ""
  echo "=== Control Plane Testnet Smoke ==="
  npm run smoke:control-plane
fi

if [[ $run_oracle -eq 1 ]]; then
  echo ""
  echo "=== Oracle Testnet Smoke ==="
  npm run smoke:n3
fi

if [[ $run_verify -eq 1 ]]; then
  echo ""
  echo "=== Testnet Contract Verification ==="
  MORPHEUS_NETWORK=testnet npm run verify:n3
fi

echo ""
echo "Live testnet validation completed successfully."
