#!/usr/bin/env bash
set -euo pipefail

env_file="${MORPHEUS_NITRO_ENV:-/opt/morpheus/nitro/morpheus-nitro.env}"
if [[ -f "$env_file" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$env_file"
  set +a
fi

eif="${MORPHEUS_NITRO_EIF:-/opt/morpheus/nitro/morpheus-nitro-signer.eif}"
signer_env="${MORPHEUS_NITRO_SIGNER_ENV:-/opt/morpheus/nitro/morpheus-nitro-signer.env}"
cid="${MORPHEUS_NITRO_CID:-16}"
cpu_count="${MORPHEUS_NITRO_CPU_COUNT:-2}"
memory_mib="${MORPHEUS_NITRO_MEMORY_MIB:-1024}"
host_port="${MORPHEUS_NITRO_HOST_PORT:-8787}"
vsock_port="${MORPHEUS_NITRO_VSOCK_PORT:-8787}"

if [[ ! -r "$eif" ]]; then
  echo "missing EIF: $eif" >&2
  exit 1
fi
if nitro-cli describe-enclaves | jq -e ".[] | select(.EnclaveCID == ${cid})" >/dev/null; then
  enclave_id="$(nitro-cli describe-enclaves | jq -r ".[] | select(.EnclaveCID == ${cid}) | .EnclaveID" | head -1)"
  nitro-cli terminate-enclave --enclave-id "$enclave_id" >/dev/null || true
fi

nitro-cli run-enclave \
  --cpu-count "$cpu_count" \
  --memory "$memory_mib" \
  --enclave-cid "$cid" \
  --eif-path "$eif" >/opt/morpheus/nitro/morpheus-nitro-run.json

socat "TCP-LISTEN:${host_port},fork,reuseaddr,bind=127.0.0.1" "VSOCK-CONNECT:${cid}:${vsock_port}" &
socat_pid="$!"

cleanup() {
  kill "$socat_pid" >/dev/null 2>&1 || true
}
trap cleanup EXIT

for _ in $(seq 1 30); do
  if curl -sS --max-time 2 "http://127.0.0.1:${host_port}/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if [[ -r "$signer_env" ]]; then
  MORPHEUS_NITRO_SIGNER_ENV="$signer_env" \
  MORPHEUS_NITRO_HOST_PORT="$host_port" \
  node --input-type=module - <<'NODE'
import fs from 'node:fs';

const envPath = process.env.MORPHEUS_NITRO_SIGNER_ENV;
const port = process.env.MORPHEUS_NITRO_HOST_PORT || '8787';
const env = {};
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const separator = trimmed.indexOf('=');
  if (separator <= 0) continue;
  const key = trimmed.slice(0, separator).trim();
  const value = trimmed.slice(separator + 1).trim();
  if (/^[A-Z0-9_]{1,96}$/.test(key) && value) env[key] = value;
}
const response = await fetch(`http://127.0.0.1:${port}/provision`, {
  method: 'POST',
  headers: {'content-type': 'application/json'},
  body: JSON.stringify({env}),
});
if (!response.ok) {
  throw new Error(`Nitro signer provision failed: HTTP ${response.status}`);
}
const body = await response.json();
console.log(JSON.stringify({
  status: body.status,
  runtime: body.runtime,
  network: body.network,
  provisioned: body.provisioned,
  env_keys: body.env_keys,
  roles: (body.roles || []).map((entry) => ({
    role: entry.role,
    ok: entry.ok,
    identity: entry.identity,
    issues: entry.issues,
  })),
}));
NODE
fi

wait "$socat_pid"
