#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ORACLE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ORACLE_CANONICAL_ROOT="$ORACLE_ROOT"
WORKTREE_NAME=""
if [[ "$ORACLE_ROOT" == */.worktrees/* ]]; then
  ORACLE_CANONICAL_ROOT="${ORACLE_ROOT%/.worktrees/*}"
  WORKTREE_NAME="${ORACLE_ROOT#"$ORACLE_CANONICAL_ROOT"/.worktrees/}"
fi
WORKSPACE_ROOT="$(cd "$ORACLE_CANONICAL_ROOT/.." && pwd)"

resolve_sibling_repo_root() {
  local repo_name="$1"
  local canonical_root="$WORKSPACE_ROOT/$repo_name"
  local worktree_root="$canonical_root/.worktrees/$WORKTREE_NAME"
  if [[ -n "$WORKTREE_NAME" && -d "$worktree_root" ]]; then
    printf "%s\n" "$worktree_root"
    return
  fi
  printf "%s\n" "$canonical_root"
}

AA_ROOT="${AA_ROOT:-$(resolve_sibling_repo_root neo-abstract-account)}"
MINIAPPS_ROOT="${MINIAPPS_ROOT:-$(resolve_sibling_repo_root neo-miniapps-platform)}"

run_oracle=1
run_aa=1
run_miniapps=1

verify_runtime_catalog_contract() {
  local runtime_catalog_file="$1"
  local checked_catalog="$ORACLE_ROOT/apps/web/public/morpheus-runtime-catalog.json"
  local platform_catalog="$MINIAPPS_ROOT/apps/shared/constants/generated-morpheus-runtime-catalog.ts"
  local aa_catalog="$AA_ROOT/frontend/src/config/generatedMorpheusRuntimeCatalog.js"

  echo ""
  echo "=== Runtime Catalog Contract Validation ==="

  node "$ORACLE_ROOT/scripts/export-public-runtime-catalog.mjs" --output "$runtime_catalog_file" >/dev/null

  if ! cmp -s "$runtime_catalog_file" "$checked_catalog"; then
    echo "Checked-in Morpheus runtime catalog is stale: $checked_catalog" >&2
    exit 1
  fi

  local envelope_version
  envelope_version="$(jq -r '.envelope.version' "$runtime_catalog_file")"
  workflow_ids=()
  while IFS= read -r workflow_id; do
    workflow_ids+=("$workflow_id")
  done < <(jq -r '.workflows[].id' "$runtime_catalog_file")

  for consumer_catalog in "$platform_catalog" "$aa_catalog"; do
    if [[ ! -s "$consumer_catalog" ]]; then
      echo "Missing runtime catalog consumer artifact: $consumer_catalog" >&2
      exit 1
    fi
    if ! grep -q "$envelope_version" "$consumer_catalog"; then
      echo "Runtime catalog consumer is missing envelope version $envelope_version: $consumer_catalog" >&2
      exit 1
    fi
    for workflow_id in "${workflow_ids[@]}"; do
      if ! grep -q "\"$workflow_id\"" "$consumer_catalog"; then
        echo "Runtime catalog consumer is missing workflow $workflow_id: $consumer_catalog" >&2
        exit 1
      fi
    done
  done

  (cd "$ORACLE_ROOT" && node scripts/check-web-consistency.mjs)
}

usage() {
  cat <<'USAGE'
Usage: scripts/run_workspace_live_validation.sh [--oracle-only|--aa-only|--miniapps-only]

Runs live testnet validation across the MeshMini workspace:
- neo-morpheus-oracle
- neo-abstract-account
- neo-miniapps-platform
USAGE
}

load_env_defaults() {
  local env_file="$1"
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" || "$line" == \#* || "$line" != *=* ]] && continue
    local key="${line%%=*}"
    local value="${line#*=}"
    if [[ -n "${!key:-}" ]]; then
      continue
    fi
    export "$key=$value"
  done < "$env_file"
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

WORKSPACE_SECRETS_ENV_FILE="$(mktemp "${TMPDIR:-/tmp}/morpheus-workspace-secrets.XXXXXX.env")"
WORKSPACE_RUNTIME_CATALOG_FILE="$(mktemp "${TMPDIR:-/tmp}/morpheus-runtime-catalog.XXXXXX.json")"
cleanup() {
  rm -f "$WORKSPACE_SECRETS_ENV_FILE" "$WORKSPACE_RUNTIME_CATALOG_FILE"
}
trap cleanup EXIT

WORKSPACE_CONTEXT_JSON="$({
  node "$ORACLE_ROOT/scripts/resolve-workspace-validation-context.mjs" \
    testnet \
    --write-secret-env-file "$WORKSPACE_SECRETS_ENV_FILE"
})"

if [[ ! -s "$WORKSPACE_SECRETS_ENV_FILE" ]]; then
  echo "Workspace validation secrets env file was not created." >&2
  exit 1
fi

load_env_defaults "$WORKSPACE_SECRETS_ENV_FILE"
verify_runtime_catalog_contract "$WORKSPACE_RUNTIME_CATALOG_FILE"

WORKSPACE_REQUEST_WIF="${ORACLE_TEST_WIF:-}"
WORKSPACE_RELAYER_WIF="${ORACLE_RUNTIME_RELAYER_WIF:-}"
WORKSPACE_RELAYER_PRIVATE_KEY="${ORACLE_RUNTIME_RELAYER_PRIVATE_KEY:-}"
WORKSPACE_UPDATER_WIF="${ORACLE_RUNTIME_UPDATER_WIF:-}"
WORKSPACE_UPDATER_PRIVATE_KEY="${ORACLE_RUNTIME_UPDATER_PRIVATE_KEY:-}"
WORKSPACE_VERIFIER_WIF="${ORACLE_RUNTIME_VERIFIER_WIF:-}"
WORKSPACE_VERIFIER_PRIVATE_KEY="${ORACLE_RUNTIME_VERIFIER_PRIVATE_KEY:-}"

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
