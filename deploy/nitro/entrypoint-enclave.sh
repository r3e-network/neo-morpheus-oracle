#!/bin/sh
# Morpheus Oracle merged compute+sign enclave entrypoint.
#
# Supersedes entrypoint-signer.sh's one-shot stdio model. The merged server
# (deploy/nitro/enclave-server.mjs) is a LONG-LIVED http.createServer (it reuses
# the worker's persistent listener model), so we run it once bound to a localhost
# TCP port and front it with a vsock-LISTEN socat fork that forwards each enclave
# connection to that local server. This matches the design (§4): the relayer /
# feed-pusher reach the enclave over vsock:8787; inside, traffic is forwarded to
# the Node server on 127.0.0.1.
#
# Contrast with entrypoint-signer.sh, which did
#   socat VSOCK-LISTEN ... EXEC:node nitro-signer-server.mjs --stdio
# spawning a fresh one-shot stdio handler per connection. The worker `handler`
# the merged server reuses keeps in-process state (overload guard, feed cache,
# circuit breakers, provider config), so it MUST be a single persistent process,
# not respawned per request.
set -eu

# Public vsock port the host's socat TCP-LISTEN:8787 -> VSOCK-CONNECT bridges to.
VSOCK_PORT="${NITRO_SIGNER_VSOCK_PORT:-8787}"
# Internal localhost port the Node server binds to (never exposed over vsock).
INTERNAL_PORT="${ENCLAVE_INTERNAL_PORT:-8081}"
INTERNAL_HOST="127.0.0.1"

# Reap children on signals so the enclave shuts down cleanly.
node_pid=""
socat_pid=""
shutdown() {
  [ -n "$socat_pid" ] && kill "$socat_pid" 2>/dev/null || true
  [ -n "$node_pid" ] && kill "$node_pid" 2>/dev/null || true
}
trap shutdown TERM INT

# Start the merged compute+sign server (long-lived) bound to localhost only.
ENCLAVE_HOST="$INTERNAL_HOST" \
PORT="$INTERNAL_PORT" \
ENCLAVE_PORT="$INTERNAL_PORT" \
  node /app/deploy/nitro/enclave-server.mjs &
node_pid=$!

# Wait for the local server to accept connections before exposing it over vsock,
# so the first inbound request never races the listener coming up.
ready=0
i=0
while [ "$i" -lt 60 ]; do
  if [ ! -d "/proc/$node_pid" ]; then
    echo "enclave-server exited before becoming ready" >&2
    exit 1
  fi
  if node -e "const s=require('node:net').connect({host:'$INTERNAL_HOST',port:$INTERNAL_PORT},()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1));s.setTimeout(800,()=>{s.destroy();process.exit(1)})" 2>/dev/null; then
    ready=1
    break
  fi
  i=$((i + 1))
  sleep 0.5
done
if [ "$ready" -ne 1 ]; then
  echo "enclave-server did not become ready on ${INTERNAL_HOST}:${INTERNAL_PORT}" >&2
  shutdown
  exit 1
fi

# Bridge vsock -> the local Node server. fork+reuseaddr handles concurrent reqs.
socat \
  "VSOCK-LISTEN:${VSOCK_PORT},fork,reuseaddr" \
  "TCP-CONNECT:${INTERNAL_HOST}:${INTERNAL_PORT}" &
socat_pid=$!

# Fail-stop: if either process dies, tear the whole enclave down. POSIX `sh`
# (dash) has no `wait -n`, so poll both pids and exit when the first one drops.
while [ -d "/proc/$node_pid" ] && [ -d "/proc/$socat_pid" ]; do
  sleep 1
done
echo "enclave-server or vsock bridge exited; shutting down" >&2
shutdown
wait 2>/dev/null || true
exit 1
