#!/usr/bin/env bash
# Provision the merged enclave's COMPUTE configuration (on top of the signer-key
# provisioning that start-nitro-signer.sh already does). The enclave boots with
# only the baked image ENV, and start-nitro-signer.sh injects ONLY the signer
# keys (morpheus-nitro-signer.env). The in-enclave worker compute additionally
# needs: the price provider keys (TWELVEDATA_API_KEY + the feed-pusher's TD_KEY),
# the worker auth token, the chain config, and — for the confidential.decrypt /
# neodid lanes — AWS credentials so it can reach Secrets Manager through the
# allow-listed vsock egress (the enclave has no IMDS).
#
# This runs:
#   - after the signer service starts (PartOf + After), so an enclave restart
#     re-provisions the compute config automatically; and
#   - on a 4h timer, to ROTATE the short-lived AWS instance-role credentials
#     (the price/VRF/feed lanes do not need AWS and stay up regardless; only the
#     decrypt/neodid lanes depend on the rotated creds).
#
# It is idempotent: /provision merges keys into the running enclave's process.env.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
host_port="${MORPHEUS_NITRO_HOST_PORT:-8787}"
signer_env="${MORPHEUS_NITRO_SIGNER_ENV:-/opt/morpheus/nitro/morpheus-nitro-signer.env}"
worker_env="${MORPHEUS_NITRO_WORKER_ENV:-/opt/morpheus/nitro/nitro-worker.env}"
feed_env="${MORPHEUS_NITRO_FEED_ENV:-/opt/morpheus/nitro/feed-pusher.env}"

# Wait for the enclave to answer /health (any HTTP status = the bridge is up).
ready=0
for _ in $(seq 1 60); do
  if curl -sS --max-time 2 -o /dev/null "http://127.0.0.1:${host_port}/health" 2>/dev/null; then
    ready=1
    break
  fi
  sleep 1
done
if [ "$ready" -ne 1 ]; then
  echo "provision-enclave-compute: enclave /health not reachable on 127.0.0.1:${host_port}" >&2
  exit 1
fi

MORPHEUS_NITRO_HOST_PORT="$host_port" \
SIGNER_ENV="$signer_env" WORKER_ENV="$worker_env" FEED_ENV="$feed_env" \
REPO_ROOT="$repo_root" \
node --input-type=module - <<'NODE'
import fs from 'node:fs';
import cp from 'node:child_process';
import { createDecipheriv } from 'node:crypto';

const port = process.env.MORPHEUS_NITRO_HOST_PORT;
const repoRoot = process.env.REPO_ROOT || '.';
function parseEnv(p) {
  const o = {};
  try {
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i <= 0) continue;
      const k = t.slice(0, i).trim();
      const v = t.slice(i + 1).trim();
      if (/^[A-Z0-9_]{1,96}$/.test(k) && v) o[k] = v;
    }
  } catch {}
  return o;
}

const signer = parseEnv(process.env.SIGNER_ENV);
const worker = parseEnv(process.env.WORKER_ENV);
delete worker.PORT; // never override the server's listening port post-startup
const feed = parseEnv(process.env.FEED_ENV);

const env = { ...worker };
if (feed.TD_KEY) env.TD_KEY = feed.TD_KEY; // /feed/sign price key (distinct from TWELVEDATA_API_KEY)

// The confidential.decrypt + neodid lanes resolve their key material from AWS
// Secrets Manager, but the AWS SDK uses node:https (NOT global fetch), so it does
// NOT honor the enclave's HTTPS_PROXY — the in-enclave Secrets Manager call has no
// route and fails. The decrypt key ALSO lives in a host keystore FILE the enclave
// can't read. So we resolve BOTH on the host (which has IMDS + the keystore + the
// SAME deriveKeyBytes) and provision the DIRECT values:
//   - MORPHEUS_ORACLE_KEY_MATERIAL_BASE64: the unsealed X25519 oracle key (so
//     confidential.decrypt works in-enclave without the keystore or Secrets Manager).
//   - NEODID_SECRET_SALT: the nullifier salt (so neodid stops failing on the salt;
//     web3auth verification additionally needs WEB3AUTH_CLIENT_ID, an operator config).
// Best-effort: if these can't be resolved, the price/VRF/feed lanes are unaffected.
try {
  // deriveKeyBytes reads AWS_REGION + the secret IDs from process.env; seed them
  // from the worker config (IMDS supplies the creds via the default chain).
  for (const [k, v] of Object.entries(worker)) if (process.env[k] === undefined) process.env[k] = v;
  const { deriveKeyBytes } = await import(`${repoRoot}/workers/nitro-worker/src/platform/nitro-signer.js`);
  const ksPath = (worker.PHALA_ORACLE_KEYSTORE_PATH || worker.NITRO_ORACLE_KEYSTORE_PATH || '/data/morpheus/oracle-key.json').trim();
  // RC2 (KMS attestation): if the CMK ciphertext file is present, inject ONLY the
  // ciphertext — it is useless without the enclave's attestation, so the host
  // never holds the plaintext key. The enclave kms-decrypts it in-TEE via
  // nsm-attest kms-decrypt (materializeOracleKeyFromKms). Otherwise fall back to
  // the legacy host unseal+inject of the plaintext key. The switch is REVERSIBLE:
  // remove the ciphertext file to return to the plaintext path (rollback).
  const kmsCtPath = (worker.MORPHEUS_ORACLE_KMS_CIPHERTEXT_PATH || '/var/lib/morpheus/oracle-key-kms.b64').trim();
  if (fs.existsSync(kmsCtPath)) {
    try {
      env.MORPHEUS_ORACLE_KMS_CIPHERTEXT_BASE64 = fs.readFileSync(kmsCtPath, 'utf8').trim();
    } catch (e) {
      console.error('provision-enclave-compute: KMS ciphertext read failed (decrypt lane stays degraded):', e.message);
    }
  } else {
    try {
      const wrap = Buffer.from(await deriveKeyBytes('morpheus/oracle/encryption/wrap/v1', 'oracle-encryption-wrap')).subarray(0, 32);
      const ks = JSON.parse(fs.readFileSync(ksPath, 'utf8'));
      const s = ks.sealed_private_key;
      const dec = createDecipheriv('aes-256-gcm', wrap, Buffer.from(s.iv, 'base64'));
      dec.setAuthTag(Buffer.from(s.tag, 'base64'));
      const pkcs8 = Buffer.concat([dec.update(Buffer.from(s.ciphertext, 'base64')), dec.final()]);
      env.MORPHEUS_ORACLE_KEY_MATERIAL_BASE64 = Buffer.from(
        JSON.stringify({ public_key_raw: ks.public_key_raw, private_key_pkcs8: pkcs8.toString('base64') })
      ).toString('base64');
    } catch (e) {
      console.error('provision-enclave-compute: oracle decrypt key unseal failed (decrypt lane stays degraded):', e.message);
    }
  }
  // Phase D: same KMS-attested ciphertext path for the Neo X (EVM) verifier key.
  // Inject ONLY the ciphertext when present; the enclave kms-decrypts it in-TEE
  // (materializeNeoXVerifierKeyFromKms). Never inject the plaintext EVM key. No-op
  // when EVM signing is not enabled on this host.
  const neoxKmsCtPath = (worker.MORPHEUS_NEOX_VERIFIER_KMS_CIPHERTEXT_PATH || '/var/lib/morpheus/neox-verifier-kms.b64').trim();
  if (fs.existsSync(neoxKmsCtPath)) {
    try {
      env.MORPHEUS_NEOX_VERIFIER_KMS_CIPHERTEXT_BASE64 = fs.readFileSync(neoxKmsCtPath, 'utf8').trim();
    } catch (e) {
      console.error('provision-enclave-compute: NeoX verifier KMS ciphertext read failed (EVM fulfill lane stays degraded):', e.message);
    }
  }
  // Phase D: same KMS-attested ciphertext path for the Neo X (EVM) FEED-updater key
  // (a distinct, lower-privilege key from the verifier). Inject ONLY the ciphertext;
  // the enclave kms-decrypts it in-TEE (materializeNeoXFeedKeyFromKms). No-op when EVM
  // feed signing is not enabled on this host.
  const neoxFeedKmsCtPath = (worker.MORPHEUS_NEOX_FEED_KMS_CIPHERTEXT_PATH || '/var/lib/morpheus/neox-feed-kms.b64').trim();
  if (fs.existsSync(neoxFeedKmsCtPath)) {
    try {
      env.MORPHEUS_NEOX_FEED_KMS_CIPHERTEXT_BASE64 = fs.readFileSync(neoxFeedKmsCtPath, 'utf8').trim();
    } catch (e) {
      console.error('provision-enclave-compute: NeoX feed KMS ciphertext read failed (EVM feed-sign lane stays degraded):', e.message);
    }
  }
  try {
    const salt = Buffer.from(await deriveKeyBytes('morpheus/neodid/nullifier/v1', 'neodid-nullifier-salt'));
    env.NEODID_SECRET_SALT = salt.toString('hex');
  } catch (e) {
    console.error('provision-enclave-compute: neodid salt derive failed (neodid lane stays degraded):', e.message);
  }
} catch (e) {
  console.error('provision-enclave-compute: key-material resolution skipped:', e.message);
}

// Fresh instance-role credentials from IMDSv2 so the in-enclave decrypt/neodid
// lanes can reach Secrets Manager through the allow-listed egress. Best-effort:
// if IMDS is unavailable the price/VRF/feed lanes still work.
try {
  const tok = cp
    .execSync('curl -sS -X PUT http://169.254.169.254/latest/api/token -H "X-aws-ec2-metadata-token-ttl-seconds: 600"', { timeout: 5000 })
    .toString();
  const role = cp
    .execSync(`curl -sS -H "X-aws-ec2-metadata-token: ${tok}" http://169.254.169.254/latest/meta-data/iam/security-credentials/`, { timeout: 5000 })
    .toString()
    .trim();
  const c = JSON.parse(
    cp
      .execSync(`curl -sS -H "X-aws-ec2-metadata-token: ${tok}" http://169.254.169.254/latest/meta-data/iam/security-credentials/${role}`, { timeout: 5000 })
      .toString()
  );
  env.AWS_ACCESS_KEY_ID = c.AccessKeyId;
  env.AWS_SECRET_ACCESS_KEY = c.SecretAccessKey;
  env.AWS_SESSION_TOKEN = c.Token;
} catch (e) {
  console.error('provision-enclave-compute: IMDS cred fetch failed (decrypt/neodid lanes may degrade):', e.message);
}

const token = signer.MORPHEUS_RUNTIME_TOKEN || signer.NITRO_SIGNER_TOKEN || '';
const res = await fetch(`http://127.0.0.1:${port}/provision`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
  body: JSON.stringify({ env }),
});
const body = await res.json().catch(() => ({}));
console.log(
  JSON.stringify({
    status: body.status,
    n_keys: (body.env_keys || []).length,
    roles: (body.roles || []).map((r) => r.role + ':' + r.ok).join(','),
    aws: Boolean(env.AWS_ACCESS_KEY_ID),
  })
);
if (!res.ok) process.exit(1);
NODE
