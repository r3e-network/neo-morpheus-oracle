# TEE confidentiality — gap map + remediation roadmap

**Goal (invariant):** all confidential computation and all signing run INSIDE the Nitro
enclave; no private key or confidential plaintext ever exists on the host or the edge.

**Source:** adversarial map 2026-06-15 (workflow wg25kfuea, 40 agents) →
28 confirmed gaps. Status: the confidential *compute* is in-TEE; several *keys* and the
whole *EVM path* and two control-plane lanes are not.

## ✅ Already in-TEE (verified clean)
- Oracle price aggregation, VRF, smart-fetch, `compute/execute` — run in the enclave worker bundle.
- X25519 decrypt **logic**, neodid nullifiers/tickets — run in the enclave.
- Encrypted-ref ciphertext fetch from Supabase — in-enclave over the egress proxy.
- Neo N3 signing — happens in-TEE in the recommended derived-keys topology.
- An in-enclave X25519 generate+seal path EXISTS (`crypto.js` `nitro-sealed`) — but is not used in prod.

## ✗ Gaps, by root cause

### RC1 — No in-TEE EVM (secp256k1) signing → entire Neo X path is host-side (CRITICAL/HIGH)
The enclave `/sign/payload` signs secp256r1 (Neo N3) only. Every EVM key + signature is host-side:
relayer fulfillment (`neox.js signNeoXFulfillment`, `source:'relayer_local_evm'`), relayer tx
submission (`updaterSigner`), feed-pusher `pushNeoX` (`NEOX_FEED_PK` raw on host), the standalone
`deploy/evm/neox-fulfiller.mjs`, and `config.js:567-571` reading both EVM keys from host env. The
flag-gated in-enclave `/oracle/fulfill` EVM path exists but is OFF in prod and still reads the key
from host env (not sealed). The on-chain *verifier* signature (forgeable oracle results) is the
confidential part and it signs on the host.

### RC2 — Keys are host-injected / host-unsealed, not enclave-born (CRITICAL/HIGH)
The enclave's AWS SDK uses `node:https` which ignores the enclave `HTTPS_PROXY`, so the enclave
can't reach Secrets Manager/KMS itself. Consequence: `provision-enclave-compute.sh` runs **on the
host**, derives the wrap key (host IMDS + Secrets Manager), reads the host keystore, and **unseals
the X25519 oracle decryption private key to PLAINTEXT in host memory**, then injects it via
`/provision` (every boot + 4h rotation). The host can also re-derive it offline. The Neo N3
oracle_verifier/updater keys are generated off-box and stored plaintext in a host file
(`morpheus-nitro-signer.env`) before `/provision`. The neodid salt + the SM masters are likewise
host-derivable. So the highest-sensitivity decryption key + the signing keys all touch the host.

### RC3 — CP-01 only partially fixed (CRITICAL)
The feed-lane leak was retired, but `callback-broadcast` + `automation-execute` workflow lanes
(`workflows-impl.js`) still resolve the Neo N3 WIF from the edge env and forward it to the Vercel
backend (`apps/web`), which signs Neo N3 txs host-side with neon-js. The WIF lives as a Cloudflare
edge secret + a Vercel env + signs on a non-TEE host.

### RC4 — Split / fallback topologies route confidential work off-TEE (HIGH/MEDIUM)
A standalone host `nitro-worker` (`server.js`, `morpheus-nitro-worker.service`, `:8788`) runs the
SAME decrypt code on the host; if the relayer `apiUrl` points there, decrypt + the X25519 key run
host-side. `/oracle/message-reveal` isn't in the enclave's route set (only the 6 execution routes +
sign/keys), so it's served by that host worker. The relayer also appends public-edge fallbacks
(`oracle.meshmini.app`/`edge`) to `apiUrl` with `allowFallback` default true → confidential compute
can be sent off-box if the local URL is unset.

### RC5 — Host-side compute + signing fast-paths (MEDIUM)
Feed VALUE aggregation runs on the host then blind-signs in-TEE unless
`MORPHEUS_FEED_PUSHER_ENCLAVE_SIGN` is on. The relayer has a `resolveLocalVerifierAccount`
host-signing fast-path for Neo N3 that fires if any verifier key is in the relayer env. The
derived-keys path derives the Neo N3 key in host memory on the primary path.

## Remediation roadmap (each enclave-code phase = an EIF rebuild + cutover)

- **Phase A — routing/config (lower risk, mostly flags/topology):** turn on
  `MORPHEUS_RELAYER_ENCLAVE_FULFILL` (atomic decrypt+sign in-TEE) and
  `MORPHEUS_FEED_PUSHER_ENCLAVE_SIGN` (feed compute in-TEE); pin relayer
  `MORPHEUS_RUNTIME_URL/NITRO_API_URL` to the vsock bridge and set `allowFallback:false` for
  decrypt/compute; decommission `morpheus-nitro-worker.service`; add `/oracle/message-reveal` to the
  enclave route set + gateway. Validate each.
- **Phase B — finish CP-01:** make `callback-broadcast` + `automation-execute` sign in-TEE (call the
  enclave `/sign/payload`), delete `resolveNeoN3*Signer` + the `...signer` spreads, remove the WIF
  from the control-plane + Vercel envs. Rotate that WIF (see RC3).
- **Phase C — enclave-self-sufficient key sealing (the structural fix for RC2):** make the enclave
  unseal/derive the X25519 + Neo N3 keys ITSELF — route the AWS SDK through the vsock egress proxy
  OR use AWS KMS attestation-gated decrypt (`kms:RecipientAttestation` bound to PCR0/1/2). Remove all
  host key injection/unsealing; scope the EC2 instance role so the host cannot read the masters;
  keys born+sealed in-TEE. Rotate every key that was host-exposed.
- **Phase D — in-TEE EVM signing (RC1):** add a secp256k1 signing role to the enclave; generate+seal
  the EVM verifier key in-TEE; route all Neo X feed + fulfillment signing through the enclave; keep
  only a low-privilege gas/submission key on the host (or move it in-TEE too).

## Honest framing
The user requirement "all computation secure + confidential inside the TEE" is met for the
**compute**, but NOT for **key custody** (RC1/RC2) or two **signing lanes** (RC3), and is bypassable
in some **topologies** (RC4/RC5). Closing it fully = Phases A–D; the architectural core is Phase C
(enclave self-sufficiency so no key is ever host-unsealed) and Phase D (in-TEE EVM signing).
