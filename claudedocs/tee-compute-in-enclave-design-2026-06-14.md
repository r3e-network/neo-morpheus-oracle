# Morpheus Oracle — Compute-in-Enclave (TEE) Design & Build Plan (2026-06-14)

> Decisions: tiered trust (deterministic lanes in-enclave + attested; arbitrary-URL fetch host-side, labeled); build+validate on testnet first; relayer/feed-pusher stay host-side as delivery.

All key facts confirmed. `buildFulfillmentDigestBytes`, `buildWorkerPayload`, `encodeFulfillmentResult`, `buildOnchainResultEnvelope`, `resolveCompactCallbackBytes`, `buildNeoXDigest` are all exported from `router.js`/`neox.js` (importable into the enclave — critical for byte-exact digest reproduction). `feed-pusher.mjs:230` blind-signs `{ role:'updater', data_hex: msg }`. I now have everything needed to produce the design.

---

# Morpheus Oracle → Nitro Enclave: Target Design + Phased Build Plan

## 0. Source-of-truth invariants (verified in-repo)

- The worker already exposes the perfect reuse seam: `workers/nitro-worker/src/worker.js` →`export default async function handler(request: Request): Promise<Response>`; `server.js` is a 60-line HTTP shim over it. **The enclave reuses `handler` directly** — no rewrite.
- Digest builders are already exported and MUST be imported, never re-derived: `buildFulfillmentDigestBytes` (`router.js:302`), `buildWorkerPayload` (`:275`), `buildOnchainResultEnvelope` (`:540`), `encodeFulfillmentResult` (`:586`), `resolveCompactCallbackBytes` (`:105`), `buildNeoXDigest` (`neox.js:332`), `signNeoXFulfillment` (`neox.js:366`).
- Relayer call seam: `callNitro(config, route, payload, {baseUrl})` (`fulfillment.js`), URLs from `config.nitro.apiUrl` (worker) and `config.nitro.signerUrl` (enclave). Merging = point both at one base URL.
- Signer dispatch: `dispatchSignerRequest({method, rawUrl, headers, payloadProvider})` (`nitro-signer-server.mjs:312`) already runs over HTTP **and** `--stdio` framed-HTTP. This is the dispatcher the merged enclave server extends.
- `ac75d1a` touched `workers/nitro-worker/src/**` (compute, vrf, feeds, neodid, fetch, providers, capabilities, worker.js) + relayer + feed-pusher. **Carrying that code into the enclave image = COPY the post-ac75d1a `workers/nitro-worker/src` tree; no cherry-pick needed.**

---

## 1. TARGET ARCHITECTURE (diagram-in-prose)

**Merged EIF (one measured boundary, `morpheus-oracle.eif`) — staging/testnet.** Inside the enclave:

- **Worker compute (`workers/nitro-worker/src/worker.js` `handler`)** running as a long-lived `http.createServer` bound to a vsock-LISTEN socat fork (replaces the current one-shot `--stdio`). Lanes: `oracle.query`/`feeds.*`, `vrf.random`, `compute.run` (script/wasm; ZKP/snarkjs decision below), `confidential.decrypt`/`seal`/`message-reveal`, `neodid.*`.
- **Signer (`nitro-signer-server.mjs` logic)** folded into the same process as an internal module — holds `oracle_verifier` (N3 secp256r1), `updater`, the NeoDID signing key, and the X25519 confidential key. Compute→digest→sign happen in-process (no host between compute and signature).
- **New atomic endpoints** (§2): `/oracle/fulfill`, `/feed/sign`, `/attestation`.
- **`nsm-attest`** Go binary at `/app/bin/nsm-attest` (already generic; binds `--user-data`/`--nonce`/`--public-key`).

**Host (untrusted delivery + un-attested tier):**

- **Relayer (`workers/morpheus-relayer`)** — watches chains, builds prepared fulfillment by calling the enclave `/oracle/fulfill`, submits `fulfillRequest` on-chain (N3 `neo-n3.js:1033`, EVM `neox.js:433`). It carries `{result, signature}` only — can stall, cannot forge.
- **Feed-pusher (`deploy/feed-pusher/feed-pusher.mjs`)** — calls enclave `/feed/sign` (which computes the value + decides + signs the tx), then broadcasts. Loses its host-side `td()`+`planFeedUpdate` integrity role.
- **vsock-proxy** — host-side egress forwarder, allow-list only (§3). Enclave does end-to-end TLS through it (host sees only ciphertext).
- **Host-side arbitrary-URL lane** — `oracle.fetch`/`oracle.smart_fetch` stay on the host worker (cannot be allow-listed); labeled `trust_tier: "host-unattested"` (§6).

**Request data flow (attested tier):**

```
relayer reads chain event
  → relayer buildWorkerPayload(...) [router.js:275]
  → POST enclave /oracle/fulfill {chain, requestType, payload, requestId, fulfillmentContext}  (over vsock)
      enclave: handler(request) computes result IN-ENCLAVE
             → buildOnchainResultEnvelope + resolveCompactCallbackBytes  [imported]
             → buildFulfillmentDigestBytes / buildNeoXDigest             [imported, byte-exact]
             → sign digest with oracle_verifier (N3) / signNeoXFulfillment (EVM)  ATOMIC
             → nsm-attest --user-data <fulfillment_binding> --public-key <signer> --nonce <relayer nonce>
             → return {success, result, result_bytes_base64, error, signature, public_key, fulfillment_digest_hex, attestation_document, attestation_user_data_hex, trust_tier:"enclave-attested", release}
  → relayer fulfillRequest(requestId, success, resultHex, error, signature)  [submit on-chain]
```

**Feed flow:** `feed-pusher → POST /feed/sign {chain, symbols, current_onchain_state} → enclave fetches (vsock-proxy)+plans+scales+signs the updateFeeds tx message → returns {pairs, rounds, prices, timestamps, attestation_hashes, signature(s), attestation_document} → feed-pusher broadcasts updateFeeds`.

---

## 2. ENCLAVE ENDPOINT CONTRACTS

### `POST /oracle/fulfill` (the atomic compute+sign — NEW; replaces blind `/sign/payload` for attested tier)

Request (relayer-supplied; mirrors `buildWorkerPayload` + signing context from `resolveFulfillmentSigningContext`):

```json
{
  "chain": "neo_n3" | "legacy" | "neox",
  "request_type": "<normalized>",
  "request_id": "<decimal-or-hex>",
  "payload": { ...worker payload as today... },
  "fulfillment_context": {
    "app_id": "...", "module_id": "...", "operation": "...",
    "contract_script_hash": "0x..", "network_magic": 860833102,    // N3
    "chain_id": 12227332, "oracle_contract": "0x.."                 // EVM
  },
  "nonce": "<hex, relayer freshness nonce>"
}
```

Response (reproduces current digest/signature exactly so on-chain verify is unchanged):

```json
{
  "status": "ok",
  "success": true,
  "result": "<result string, ≤900B envelope from buildOnchainResultEnvelope>",
  "result_bytes_base64": "<compact callback bytes if vrf/neodid, else absent>",
  "error": "",
  "signature": "<oracle_verifier sig over buildFulfillmentDigestBytes / EIP-191 EVM>",
  "public_key": "<signer pubkey hex>",
  "fulfillment_digest_hex": "<the exact digest bytes signed — for relayer assertion>",
  "verification": { ...existing envelope (B), now produced in-enclave... },
  "attestation_document": "<base64 COSE_Sign1>",
  "attestation_user_data_hex": "<hex: commits sha256(fulfillment_digest || result_envelope)>",
  "trust_tier": "enclave-attested",
  "release": "<eif release id>"
}
```

Key binding rule: `attestation_user_data = sha256(fulfillment_digest_hex_bytes)` (a single 32-byte commit), `nsm-attest --public-key = oracle_verifier pubkey`, `--nonce = request.nonce`. This makes the attestation cryptographically bind THIS result to THIS signer to THIS enclave (closes the §5 dead-binding gap). The relayer asserts `fulfillment_digest_hex == its own buildFulfillmentDigestBytes(...)` before submit (defense-in-depth; the digest is still consensus-checked on-chain regardless).

### `POST /feed/sign` (NEW — moves feed compute+decision in-enclave)

Request: `{ chain, symbols:[...], onchain_state:{ <sym>:{round, price, timestamp} }, nonce }`.
Response: `{ status, pairs[], rounds[], prices_scaled[], timestamps[], attestation_hashes[], source_set_ids[], tx_message_hex, signature, public_key, attestation_document, attestation_user_data_hex:"sha256(tx_message)", trust_tier:"enclave-attested", release }`. Enclave runs `td()` (now via vsock-proxy) + `planFeedUpdate` + scaling internally; signs `txn.getMessageForSigning(magic)`. For EVM feeds it returns the signed `updateFeeds` calldata signature.

### `POST /attestation` (EXISTING shape, kept for the verifier + standalone health)

Unchanged response shape (`nitro-signer-server.mjs:298`); add `report_data`/`user_data` echo so the verifier can rebind. The fulfill/feed endpoints embed the doc inline, so the standalone route is for liveness/verifier probes.

### Compatibility note

`/sign/payload` (blind) is **removed from the attested tier** (no caller-supplied `data_hex` that touches `oracle_verifier`/`updater`). It can survive only for non-consensus internal uses; the attested keys are reachable ONLY via `/oracle/fulfill` and `/feed/sign`.

---

## 3. EGRESS allow-list + vsock-proxy + end-to-end TLS

**vsock-proxy config** (`deploy/nitro/vsock-proxy.allowlist.yaml`, new) — host:port allow-list, one `vsock-proxy` instance per entry or a multi-entry config:

```yaml
allowlist:
  - { address: api.twelvedata.com, port: 443 } # providers.js:490 (TWELVEDATA_API_KEY)
  - { address: api1.binance.com, port: 443 } # providers.js:521
  - { address: api.coinbase.com, port: 443 } # providers.js:541
  - { address: api.n3index.dev, port: 443 } # relayer RPC+indexer (live box)
  - { address: mainnet1.neo.coz.io, port: 443 }
  - { address: mainnet2.neo.coz.io, port: 443 }
  - { address: testnet1.neo.coz.io, port: 443 } # staging
  - { address: neoxt4seed1.ngd.network, port: 443 } # NeoX EVM
  - { address: neoxt4seed2.ngd.network, port: 443 }
  - { address: api-auth.web3auth.io, port: 443 } # neodid JWKS
  - { address: przhhxbovqwopibssjzr.supabase.co, port: 443 } # feed snapshots + provider config
  - { address: secretsmanager.us-east-1.amazonaws.com, port: 443 }
  - { address: kms.us-east-1.amazonaws.com, port: 443 } # KMS-attested decrypt
```

**End-to-end TLS:** the enclave's Node `undici`/`fetch` opens TLS to the real hostname; vsock-proxy forwards opaque TLS bytes host→internet. `ca-certificates` already in the image. **Hard requirements** (else the no-MITM guarantee is void): force HTTPS-only endpoints (drop the `seedN.neo.org:10332` HTTP defaults in-enclave via `config/networks/*` override) and hard-disable `MORPHEUS_ALLOW_UNSAFE_PROVIDER_BASE_URL_OVERRIDE` (`providers.js:452`). The arbitrary-URL lane is **excluded** by construction (stays host-side).

---

## 4. The EIF

**`deploy/nitro/Dockerfile.enclave`** (new; supersedes `Dockerfile.signer` for the merged image):

- **Digest-pin every base image:** `FROM golang:1.22-bookworm@sha256:…`, `FROM node:22-bookworm-slim@sha256:…` (today both float — `Dockerfile.signer:2,10`).
- **Deterministic deps:** replace `npm install …@^5.8.1` (`Dockerfile.signer:19`) with `COPY package.json package-lock.json` + `npm ci --omit=dev`. This pulls the worker's `ethers@^6.16`, `jose@^6.2.1`, `@aws-sdk/client-secrets-manager`, `@cityofzion/neon-js` from the committed lockfile.
- **Pin the Go helper:** replace `go get github.com/hf/nsm@latest` (`Dockerfile.signer:6`) with a pinned version + committed `go.mod`/`go.sum`.
- **Bundle the worker + relayer digest libs:** `COPY workers/nitro-worker/src ./workers/nitro-worker/src`, `COPY workers/morpheus-relayer/src/router.js workers/morpheus-relayer/src/neox.js ./workers/morpheus-relayer/src/` (digest reuse), `COPY config ./config`, `COPY scripts/lib-neo-signers.mjs`.
- **snarkjs / ZKP decision (the one external-binary gap):** Phase the compute lane in **without** snarkjs first — keep the ZKP-CLI branch routed to the host tier (`compute/index.js:265` already has a non-CLI runtime branch); script/wasm/builtin compute move in. Add `snarkjs` as a pinned npm dep in a later phase only if needed (raises image to 4096 MiB).
- **Long-lived listener:** new `deploy/nitro/entrypoint-enclave.sh` runs `node deploy/nitro/enclave-server.mjs` (the merged server importing worker `handler` + signer module + new endpoints) behind `socat VSOCK-LISTEN:8787,fork,reuseaddr → TCP-CONNECT:127.0.0.1:<internal>` (worker is a real http server, not one-shot stdio).
- **Build:** `SOURCE_DATE_EPOCH` + normalized mtimes; `build-enclave` derives PCRs from the image.

**Resource sizing:** 2 vCPU / **2048 MiB** merged (up from `start-nitro-signer.sh:16` 1024); 4096 MiB if snarkjs runs in-enclave. Requires editing `/etc/nitro_enclaves/allocator.yaml` on the box.

**PCR compute + publish:** modify `build-nitro-signer-eif.sh` (→ `build-enclave-eif.sh`) to capture `nitro-cli build-enclave` `Measurements` JSON into a committed, versioned manifest `deploy/nitro/measurements/<release>.json`:

```json
{
  "release": "oracle-2026-06-XX",
  "app_id": "morpheus-oracle",
  "network": "testnet",
  "git_commit": "<sha>",
  "eif_sha256": "...",
  "hash_algorithm": "SHA384",
  "pcr0": "<hex48>",
  "pcr1": "<hex48>",
  "pcr2": "<hex48>",
  "built_at": "..."
}
```

Build script fails if PCRs are empty. Serve via `apps/web/app/api/attestation/measurements/route.ts` (GET) + ship the static committed copy for offline verify.

---

## 5. ATTESTATION VERIFIER (server + client)

**New files:** `apps/web/lib/nitro-attestation.ts` (`verifyNitroAttestationDocument()`), `apps/web/lib/attestation/aws-nitro-root.pem` (pinned, + asserted SHA256 fingerprint constant). Wire into `apps/web/app/api/attestation/verify/route.ts` as a **new layer alongside** the existing hash-binding `verifyAttestation()` (`attestation.ts`) — keep that layer (binds output_hash↔result); the new layer binds enclave-code↔document.

**Algorithm (canonical order):**

1. base64→CBOR-decode COSE_Sign1 `[protected, unprotected, payload, signature]`.
2. CBOR-decode payload doc; assert `digest=="SHA384"`, `module_id` non-empty, `timestamp` within skew window.
3. Build chain: leaf=`certificate`, intermediates=`cabundle`, anchor=**pinned AWS Nitro root**; verify validity windows (vs `timestamp`), signatures, basicConstraints/keyUsage, terminates at pinned root.
4. Verify COSE Sig_structure `["Signature1", protected, b"", payload]` ES384 against leaf pubkey (alg must be ES384/-35, from **protected** header).
5. `pcrs[0/1/2]` == pinned manifest values → reject on any mismatch.
6. Bind: `user_data == sha256(expected_fulfillment_digest)`; `public_key == expected_signer_public_key`; `nonce == caller nonce`.
7. `measurement_chain_verified = true` only when 1–6 pass; redefine `full_attestation_ok` to require it.

**Libs (minimal, pinned):** `cbor2`/`cbor-x` for CBOR; hand-rolled COSE_Sign1 verify (rebuild Sig_structure + WebCrypto ES384); `@peculiar/x509` for DER chain. Matches house style (hand-rolled crypto elsewhere) and minimizes supply chain. **Requires adversarial test vectors** (tampered doc, wrong root, mismatched PCR, expired cert, replayed nonce).

**Root pinning:** commit the PEM from `aws-nitro-enclaves-crl.s3.amazonaws.com/AWS_NITRO_ENCLAVES_ROOT-G1.zip`, assert its SHA256 at load, never fetch at runtime; documented rotation path (support multiple pinned roots for G1→G2).

**Client-side:** `/verifier` page does the same verification in-browser using the same pinned root + pinned PCR manifest shipped as static assets (WebCrypto P-384) — optional "verify locally" mode.

**Response additions:** `{cose_signature_ok, cert_chain_ok, root_pinned_ok, pcr0_match, pcr1_match, pcr2_match, user_data_bound_ok, public_key_bound_ok, nonce_match, timestamp_fresh, measurement_chain_verified}`.

---

## 6. TIERED-TRUST labeling (host-side arbitrary-URL lane)

- Every result envelope carries `trust_tier`: `"enclave-attested"` (fulfill/feed) or `"host-unattested"` (`oracle.fetch`/`oracle.smart_fetch`). Add to `buildOnchainResultEnvelope` (`router.js:540`) so it lands in the on-chain `verification` field and the API response.
- The host-unattested path carries **no `attestation_document`** and `measurement_chain_verified:false`; the verifier MUST reject any attempt to present a host-tier result as enclave-attested (distinct scope label, no doc to verify).
- Docs: `docs/ATTESTATION_SPEC.md` rewritten for the Nitro document shape (drop TDX/64-byte `report_data` assumptions) + a tier matrix (which `request_type`/`module_id` is attested vs host-tier, mirroring the §3 lane→tier mapping).

---

## 7. RELAYER + FEED-PUSHER rewiring

**Relayer (`workers/morpheus-relayer/src/fulfillment.js`):**

- Replace the worker-call + separate-sign 2-step with a single `callNitro(config, '/oracle/fulfill', enclavePayload, {baseUrl: config.nitro.signerUrl})` for the 5 attested lanes. `signFulfillmentPayload` (`:302`) no longer calls `/sign/payload` for these; it consumes `{signature, fulfillment_digest_hex, attestation_document}` from the fulfill response.
- Assert `fulfillment_digest_hex == buildFulfillmentDigestBytes(...)` locally before submit (the relayer still has the imported builder — keep it as the cross-check).
- VRF: delete the relayer-local `crypto.randomBytes(32)` branch (`fulfillment.js:706`) — randomness now generated in-enclave (`oracle/vrf.js`) and attested.
- Keep `oracle.fetch`/`smart_fetch` on `config.nitro.apiUrl` (host worker) → tagged `host-unattested`.
- Merged topology: set `apiUrl == signerUrl == http://127.0.0.1:8787`; the request→result binding via signature is preserved (relayer only delivers).

**Feed-pusher (`deploy/feed-pusher/feed-pusher.mjs`):** replace `nitroSign(txn.getMessageForSigning())` blind call (`:226,336`) with `POST /feed/sign {chain, symbols, onchain_state}`; the enclave returns the planned+scaled+signed update; feed-pusher broadcasts. Host-side `td()`/`planFeedUpdate` become an out-of-enclave fallback/monitor only.

**Carrying ac75d1a:** since the enclave image `COPY`s `workers/nitro-worker/src` from the working tree (post-`ac75d1a`), all those fixes (compute/vrf/feeds/neodid/fetch/providers/worker.js robustness) are in the EIF automatically. No cherry-pick — just build off the current HEAD.

---

## 8. PHASED BUILD PLAN (first milestone small + local-testable)

**Phase 0 — Local enclave-server shell (LOCAL, node, no AWS). Smallest first.**

- New `deploy/nitro/enclave-server.mjs`: imports worker `handler` (`worker.js`) + signer module + `dispatchSignerRequest`; adds `/oracle/fulfill` + `/feed/sign` routes that call `handler` then sign via the imported digest builders.
- New `deploy/nitro/enclave-server.test.mjs`: prove `/oracle/fulfill` produces a `signature` whose `fulfillment_digest_hex` equals `buildFulfillmentDigestBytes(...)` for N3, legacy, and EVM — **byte-for-byte against fixtures captured from the current relayer path** (golden vectors). This is the consensus-critical gate, fully unit-testable on a laptop. ✅ Milestone: green test = digest reproduced.

**Phase 1 — Reproducible image + PCR plumbing (LOCAL docker; PCR on box).**

- `Dockerfile.enclave` (digest-pinned bases, `npm ci`, pinned `nsm`, bundle worker+digest libs). `build-enclave-eif.sh` capturing `Measurements` → `deploy/nitro/measurements/<release>.json` (fail-if-empty). LOCAL test: `docker build` reproducibility (build twice, identical image digest). ✅ Milestone: deterministic image; manifest written on box build.

**Phase 2 — Verifier (LOCAL, node + browser).**

- `apps/web/lib/nitro-attestation.ts` + pinned root + verify route + `/api/attestation/measurements`. Unit tests with **adversarial vectors** (tampered/wrong-root/wrong-PCR/expired/replayed). ✅ Milestone: verifier passes a real captured doc and fails all tampered variants — all local.

**Phase 3 — Egress + KMS-attested secrets (box, SSM).**

- `vsock-proxy.allowlist.yaml`, force-HTTPS config override, disable unsafe base-URL override. Move confidential X25519 master + NeoDID key to KMS-attested-decrypt-in-enclave (replace `/provision` plaintext push). LOCAL test: a stub vsock-proxy + the enclave-server fetching through it (host sees only TLS bytes). ✅ Milestone: allow-listed fetch works, off-list blocked.

**Phase 4 — Relayer + feed-pusher rewiring (LOCAL unit + integration).**

- Rewire `fulfillment.js` to `/oracle/fulfill`, delete relayer VRF branch, add digest cross-check; rewire feed-pusher to `/feed/sign`; add `trust_tier`. Tests in `fulfillment.test.mjs`/`feed-pusher.test.mjs` against the local enclave-server. ✅ Milestone: full relayer→enclave→submit path green locally (mock chain).

**Phase 5 — TESTNET validation (box via SSM).**

- Build EIF on box, run merged enclave (2vCPU/2048MiB), provision keys, point relayer/feed-pusher at it. Prove: a live testnet request is computed+signed **in-enclave**, the on-chain `fulfillRequest` verifies (digest unchanged), and the **verifier validates the doc + PCRs** (`measurement_chain_verified:true`) for that request's nonce/signer/digest. ✅ Milestone: one end-to-end attested testnet fulfillment + one attested feed update.

**Phase 6 — MAINNET migration runbook.**

1. Build mainnet EIF off the same commit; capture + publish mainnet `measurements/<release>.json`.
2. Re-provision the mainnet `oracle_verifier`/`updater`/X25519/NeoDID keys into the enclave via KMS-attested decrypt (PCR-gated KMS key policy).
3. Bump `allocator.yaml` memory; `run-enclave`; verify `/health` + `/attestation` PCRs match published.
4. Cut over relayer + feed-pusher env to the enclave base URL; restart.
5. Verify one live mainnet fulfillment + feed update attested end-to-end.

- **Rollback:** keep the old host-worker systemd unit + the previous relayer/feed-pusher env (split URLs) staged; revert env + restart relayer/feed-pusher to the host worker, terminate the enclave. Because the on-chain digest/signature is unchanged, rollback is a pure delivery-path swap (no contract change).

---

## 9. RISKS + mitigations

- **Reproducible-build fragility** (PCRs meaningless if not reproducible): floating bases (`Dockerfile.signer:2,10`), `npm install` caret, `go get @latest`. → Digest-pin bases, `npm ci` from lockfile, pin `nsm` + commit `go.sum`, `SOURCE_DATE_EPOCH`. Gate: build twice → identical image digest (Phase 1).
- **Enclave resource limits / OOM**: fork()'d script/wasm sandboxes + ZKP tmpfs can exceed 1 GiB. → 2048 MiB min, defer snarkjs in-enclave (keep ZKP-CLI host-tier first), allocator.yaml sized with headroom, overload-guard already present (`platform/overload-guard.js`).
- **Egress latency / no-MITM**: vsock-proxy adds a hop; HTTP-only seed endpoints void TLS guarantee. → end-to-end TLS in-enclave, force-HTTPS config, 10–30s `callNitro` timeouts already exist; allow-list keeps the surface to ~13 hosts.
- **Key re-provisioning**: plaintext `/provision` push undermines TEE; merging widens blast radius (provider keys + Supabase service key + X25519/NeoDID masters now in-boundary). → KMS-attested-decrypt-in-enclave (PCR-gated KMS policy) before mainnet (Phase 3/6).
- **Per-result binding currently dead** (worker posts `/attest` which 404s; user_data binds pubkeys not output_hash). → `/oracle/fulfill` sets `user_data = sha256(fulfillment_digest)` + `--public-key = signer` + `--nonce` (Phase 0/2).
- **Consensus-critical digest drift**: any normalization diff breaks on-chain verify. → **import** `buildFulfillmentDigestBytes`/`buildNeoXDigest`, never re-derive; golden-vector test is the Phase 0 gate.
- **Root-cert single point of trust / manifest circularity**: pinned root staleness fails closed; serving the manifest from the untrusted server is circular. → multi-root pin support + documented rotation; commit manifest in-repo (reviewable) + ship to client as static asset.
- **Downtime during cutover**: → merged-on-staging first; mainnet cutover is an env+restart swap with the host worker kept warm for instant rollback; digest unchanged so no contract risk.
- **Supabase coupling for in-enclave feed bootstrap** (ephemeral disk + prior 8GB quota outage): a Supabase outage now stalls in-enclave feed bootstrap. → keep `MORPHEUS_FEED_BOOTSTRAP_SUPABASE_ENABLED` on with the host-tier feed-pusher fallback retained during migration; monitor quota.

**Relevant files:** `deploy/nitro/enclave-server.mjs` (new), `deploy/nitro/enclave-server.test.mjs` (new), `deploy/nitro/Dockerfile.enclave` (new), `deploy/nitro/entrypoint-enclave.sh` (new), `deploy/nitro/build-enclave-eif.sh` (from `build-nitro-signer-eif.sh`), `deploy/nitro/vsock-proxy.allowlist.yaml` (new), `deploy/nitro/measurements/<release>.json` (new), `deploy/nitro/nitro-signer-server.mjs` (fold in), `deploy/nitro/nsm-attest/main.go` (pin + go.sum), `workers/nitro-worker/src/worker.js` (reused `handler`), `workers/morpheus-relayer/src/router.js` + `neox.js` (digest builders, imported into enclave; add `trust_tier`), `workers/morpheus-relayer/src/fulfillment.js` + `config.js` + `nitro.js` (rewire to `/oracle/fulfill`, drop local VRF), `deploy/feed-pusher/feed-pusher.mjs` (rewire to `/feed/sign`), `apps/web/lib/nitro-attestation.ts` + `apps/web/lib/attestation/aws-nitro-root.pem` + `apps/web/lib/attestation.ts` + `apps/web/app/api/attestation/verify/route.ts` + `apps/web/app/api/attestation/measurements/route.ts` + `apps/web/app/verifier/page.tsx` (new/updated verifier), `docs/ATTESTATION_SPEC.md` (rewrite for Nitro).

---

# Investigation appendix

## CURRENT COMPUTE+SIGN FLOW — Morpheus Oracle (Neo N3 + Neo X) request → signed on-chain fulfillment, and feed-pusher

# Top-level architecture (today)

Three trust boundaries exist right now:

1. **HOST relayer** (`workers/morpheus-relayer`) — watches chains, orchestrates, builds the on-chain **fulfillment digest**, and submits the fulfill tx.
2. **HOST worker** (`workers/nitro-worker`, port 8080) — does ALL the integrity-critical COMPUTE (price providers, vrf, compute fns, confidential decrypt/seal, neodid) and ALSO does its own _worker-role_ secp256r1 signing over an `output_hash`. This runs OUTSIDE the enclave today — it only _calls_ the enclave for derived key material/attestation.
3. **ENCLAVE signer** (`deploy/nitro/nitro-signer-server.mjs`, port 8787) — a thin SIGN-ONLY service. It holds the pinned `oracle_verifier`/`updater` Neo N3 keys and signs an arbitrary host-supplied `data_hex` (secp256r1). It does NO compute.

CRITICAL distinction: there are TWO different signatures per request and they are not the same thing:

- **(A) The on-chain fulfillment signature** — over `buildFulfillmentDigestBytes(...)` (router.js:302), signed by `oracle_verifier`. THIS is what the kernel contract verifies (`ComputeFulfillmentDigest`). For Neo N3 it is produced by the ENCLAVE via `/sign/payload` (or a relayer-local verifier key if pinned). For Neo X it is produced by the relayer LOCALLY (secp256k1, never the enclave).
- **(B) The worker's "verification envelope" signature** — over `sha256(stableStringify(result))` = `output_hash`, signed by the _worker_ role key INSIDE the worker process (`buildSignedResultEnvelope`, chain/signing.js:192). This is advisory provenance metadata only; it is folded into the on-chain result JSON's `verification` field but the kernel does NOT verify it. It is the proof-of-compute that the new in-enclave design must REPLACE with a real attested signature.

The NEW in-enclave endpoint must reproduce (A) exactly (digest bytes are consensus-critical) AND should subsume (B) by computing the result and signing both inside the measured TEE.

---

# THE ON-CHAIN FULFILLMENT DIGEST (the load-bearing contract — must reproduce byte-for-byte)

`buildFulfillmentDigestBytes(requestId, requestType, success, result, error, resultBytesBase64, {chain, appId, moduleId, operation, contractScriptHash, networkMagic})` — `workers/morpheus-relayer/src/router.js:302-375`.

Neo N3 kernel digest (router.js:360-374):

```
sha256(
  "miniapp-os-fulfillment-v1"            // FULFILLMENT_SIGNATURE_DOMAIN_N3 (router.js:3)
  || uint256_be(requestId)               // 32 bytes (encodeUint256Bytes, router.js:136)
  || sha256(appId) || sha256(moduleId) || sha256(operation)
  || successByte                         // 1 byte 0/1
  || sha256(resultBytes)                 // resultBytes = base64-decode(result_bytes_base64) if present, else utf8(result)  (router.js:319-321)
  || sha256(error)
  || [scriptHashLE(20) || networkMagicLE(4)]  // appended ONLY if both supplied (router.js:328-336); LE = reverse of 0x display hash
)
```

Legacy Neo N3 digest (no appId) — router.js:343-356: domain `"morpheus-fulfillment-v2"` + `uint256(requestId)` + `sha256(requestType)` + successByte + `sha256(resultBytes)` + `sha256(error)`. Selected when `chain==='legacy'`, which `resolveFulfillmentSigningContext` (fulfillment.js:202-204) returns whenever a neo_n3 event has no appId.

Neo X (EVM) digest — `buildNeoXDigest` (neox.js:332-364): `keccak256(abi.encode("morpheus-evm-fulfillment-v1", chainId, oracleContract(address), requestId(uint256), keccak(appId), keccak(moduleId), keccak(operation), success(bool), keccak(resultBytes), keccak(error)))`. Signed via EIP-191 personal-sign (`wallet.signMessage(getBytes(digest))`, neox.js:372).

resultBytes resolution (must match): compact callback bytes (e.g. raw 32-byte VRF randomness, neodid ticket bytes) when present, else utf8 of the result JSON string — `resolveResultBytesHex` (neox.js:324-329) / router.js:319-321.

Identifier hygiene: appId/moduleId/operation/error are hashed VERBATIM (no trim) because the contract stores them exactly; whitespace ids are rejected at ingestion (`findWhitespaceIdentifier`/`assertEventIdentifiersClean`, fulfillment.js:233-255).

---

# THE RELAYER → WORKER → SIGN → SUBMIT PIPELINE (per lane)

Entry: `processEvent` (fulfillment.js:1207) → `prepareOracleFulfillment` (fulfillment.js:608) builds the prepared fulfillment {success, result, result_bytes_base64, error, verification_signature}; then `deliverPreparedFulfillment` (fulfillment.js:505) → `fulfillNeoRequest` (fulfillment.js:360) submits on-chain. The signature is computed in `prepareOracleFulfillment` and only the bytes + signature are carried to delivery — so the relayer can deliver-or-stall but cannot forge.

The generic signing call: `signFulfillmentPayload(config, chain, fulfillment)` (fulfillment.js:302-358):

- chain `neox` → `signNeoXFulfillment` (relayer-local EVM key, never enclave).
- chain `neo_n3` → if a pinned local verifier key is present, sign locally (fulfillment.js:328-338); ELSE `callNitro(config, '/sign/payload', {target_chain, key_role:'oracle_verifier', data_hex: digestBytes.hex}, {baseUrl: config.nitro.signerUrl})` (fulfillment.js:340-349). signerUrl = `NITRO_SIGNER_URL` || worker apiUrl, default `http://127.0.0.1:8787` (config.js:422-430). The enclave responds `{status:'ok', signature, public_key, address, script_hash}` (nitro-signer-server.mjs handleSignPayload:206-227).

`callNitro` (nitro.js:40-110): POST JSON to `${baseUrl}${path}`, Bearer/x-nitro-token auth, 10s default timeout (max 30s), endpoint fallback list. Worker payload decorated with network/use_derived_keys (nitro.js:12-38).

### Lane: price providers / oracle.fetch / smart-fetch / oracle.query (worker route `/oracle/smart-fetch`, `/oracle/query`, `/oracle/feed`)

- Route resolved by `resolveKernelIntent` (router.js:148-255). Default/oracle/fetch → moduleId `oracle.fetch`, route `/oracle/smart-fetch`. Feed → `feed.publish`, route `/oracle/feed`, **operatorOnly:true**.
- prepareOracleFulfillment: `buildWorkerPayload` (router.js:275-289) → `callNitro(config, route, workerPayload)` (fulfillment.js:789).
- Worker handler `handleOracleSmartFetch`/`handleOracleQuery` → `buildOracleResponse` (oracle/fetch.js); price logic in `oracle/providers.js` (`fetchProviderJSON`, circuit breakers, BUILTIN_PROVIDER_CATALOG twelvedata/binance etc., providers.js:76+) + `oracle/feeds.js` (`handleFeedsPrice`, `decimalToIntegerString`). Worker returns a body with `result`/`extracted_value`/`price`/`sources` + a `verification` envelope (output_hash + worker signature).
- Relayer encodes: `encodeFulfillmentResult` (router.js:586-608) → `buildOnchainResultEnvelope` (router.js:540-584) compacts to `{version:'morpheus-result/v1', request_type, module_id, operation, success, result, verification}` ≤900 bytes. Then `signFulfillmentPayload` over the digest. **operator-only feed requests are rejected locally** (no worker call) with a signed failure (fulfillment.js:673-701).
- Transient worker 5xx/429/408/425/0 → `buildTransientWorkerError` → retried, never finalized (fulfillment.js:797-802).

### Lane: VRF / random (route `/vrf/random`, moduleId `random.generate`)

- **Computed LOCALLY IN THE RELAYER, not the worker** (fulfillment.js:706-727): `crypto.randomBytes(32)` → `{randomness}`. Then signed. The on-chain callback is the raw 32-byte randomness as compact bytes (`resolveCompactCallbackBytes`, router.js:105-117). (The worker DOES have a `/vrf/random` handler — oracle/vrf.js:5-20 — `crypto.getRandomValues(32)` + `buildSignedResultEnvelope` + attestation — but the relayer's local branch short-circuits before calling it.)

### Lane: confidential decrypt / reveal (route `/oracle/decrypt`, moduleId `confidential.decrypt`)

- prepareOracleFulfillment special-cases it (fulfillment.js:732-775): `callNitro(config, '/oracle/decrypt', {envelope: event.payloadText})`. On success result_bytes_base64 = base64(utf8(plaintext)); sign; submit. Transient → retry.
- Worker `handleOracleDecrypt` (capabilities.js:154-176): optional (chain,contract,messageId) binding gate `assertDecryptBinding` (capabilities.js:101-152, reads neox message contract, re-asserts time-lock), then `decryptEncryptedToken` (oracle/crypto.js). Envelope = `X25519-HKDF-SHA256-AES-256-GCM`, version 2 (crypto.js:26-30). The X25519 private key is `deriveOracleWrapKey`-sealed (crypto.js:148-211) — wrap key derived via `deriveKeyBytes('morpheus/oracle/encryption/wrap/v1','oracle-encryption-wrap')`, i.e. from a **Secrets Manager master read by the host worker** (platform/nitro-signer.js:129-150, x25519SecretId default `morpheus/x25519-wrap`). So the confidential key material is reachable by the untrusted host today.

### Lane: compute (route `/compute/execute`, moduleId `compute.run`)

- prepareOracleFulfillment generic path → `callNitro('/compute/execute', workerPayload)`.
- Worker `handleComputeExecute` (compute/index.js:710-743): `resolveConfidentialPayload` (decrypt sealed inputs) → builtin (`executeBuiltinCompute`: sha256/keccak/rsa-verify/modpow/matrix/cosine/merkle/zk-verify/mask/laplace — compute/index.js:494-643) or sandboxed script/wasm (`runScriptWithTimeout`/`runWasmWithTimeout`). Returns `{mode, target_chain, ...result, output_hash, signature, public_key, attestation_hash, tee_attestation, verification}` (signature B over output_hash via worker key).

### Lane: NeoDID (routes `/neodid/bind|action-ticket|recovery-ticket|zklogin-ticket`, moduleId `identity.verify`)

- prepareOracleFulfillment generic path → `callNitro` to the route.
- **Worker signs a ticket digest with its OWN secp256r1 key INSIDE the worker** — `signDigestBytes` (neodid/index.js:404-413) over `buildActionDigestBytes`/`buildRecoveryDigestBytes`/`buildBindingDigestBytes` (neodid/index.js:328-376, domain-separated). Key from `resolveNeoDidSignerPrivateKey` (neodid/index.js:378-402): env/derived('neodid')/pinned-worker. Worker returns `{master_nullifier, action_nullifier, signature, callback_encoding:'neo_n3_action_v1'|...}`.
- Relayer re-encodes that into the COMPACT on-chain callback bytes — `resolveCompactCallbackBytes` (router.js:105-134) → `encodeNeoN3ActionTicketV1/V3` / `encodeNeoN3RecoveryTicketV1/V3` (router.js:53-103). Those bytes become resultBytes that the fulfillment digest (A) then covers, and the kernel/AA contract verifies the ticket signature itself. So neodid has a SECOND in-worker signing identity distinct from oracle_verifier.

### On-chain submission

- Neo N3: `fulfillNeoN3Request` (neo-n3.js:1033-1085) → `experimental.SmartContract(...).invoke('fulfillRequest', buildFulfillRequestParams(requestId, success, resultHex, error, verificationSignature))`, signed by the `updater` key (`resolveNeoN3UpdaterPayload`); resultHex = base64→hex of result_bytes_base64 OR utf8(result). Confirms via app-log poll (`confirmNeoN3FulfillExecution`).
- Neo X: `fulfillNeoXRequest` (neox.js:433-481) → `kernel.fulfillRequest(requestId, success, resultBytesHex, error, signature)` via ethers (updater signer), gas-estimate-then-2x, per-signer serialized queue.

---

# FEED-PUSHER (`deploy/feed-pusher/feed-pusher.mjs`) — SEPARATE PATH, does NOT use the worker

This is a standalone systemd-timer oneshot (not the relayer, not the worker):

1. Fetch prices DIRECTLY from TwelveData on the HOST: `td(syms)` (feed-pusher.mjs:150-174) — drops non-positive/non-finite quotes.
2. Plan update per symbol: `planFeedUpdate` (feed-pusher.mjs:37-69) — threshold (THRESHOLD_BPS=10), staleness (MAX_STALE_SEC=1800), 50% deviation guard (MAX_DEVIATION_BPS=5000), round/ts monotonicity.
3. **Neo N3 push** `pushNeoN3` (feed-pusher.mjs:250-350): builds `updateFeeds(pairs[], rounds[], prices[], timestamps[], attestationHashes[], sourceSetIds[])` for contract `0x03013f49c42a14546c8bbe58f9d434c3517fccab`. price scaled `*1e6`; attestationHash = `sha256(s|px|ts).slice(0,32)` (host-computed, feed-pusher.mjs:290). It signs the **Neo transaction message** (`txn.getMessageForSigning(N3_MAGIC=860833102)`) — NOT a fulfillment digest — by calling the ENCLAVE: `nitroSign(msg)` → `POST :8787/sign/payload {role:'updater', data_hex: msg}` (feed-pusher.mjs:226-236, SIGNER default `http://127.0.0.1:8787`). So the enclave's role here is to sign the updater's raw tx, holding the updater key.
4. **Neo X push** `pushNeoX` (feed-pusher.mjs:375-443): signs LOCALLY with `NEOX_FEED_PK` via ethers `new ethers.Wallet(NEOX_PK)` (feed-pusher.mjs:378) → `c.updateFeeds(symbols, prices, timestamps, roundIds)` on `0x38DD6BCE...`. Enclave NOT involved.

So today the feed VALUE is computed and integrity-decided entirely on the untrusted host; the enclave only blind-signs the resulting tx. This is the weakest lane re: "compute in TEE."

---

# THE ENCLAVE SIGNER TODAY (`deploy/nitro/nitro-signer-server.mjs`) — what the new compute+sign endpoint extends

Endpoints (dispatchSignerRequest:312-336): `GET /health`, `POST /provision` (handleProvision:159-190 injects env incl. tokens), `POST /attestation` (handleAttestation:257-310), `POST /keys/derived` (handleKeysDerived:192-204), `POST /sign/payload` (handleSignPayload:206-227). Runs as HTTP server OR vsock-style `--stdio` framed HTTP (readStdioHttpRequest:358-421).

- `/sign/payload`: normalizes role (oracle_verifier/updater/relayer/worker), validates `data_hex` is even-length hex, resolves the PINNED key (`reportPinnedNeoN3Role`), `neoWallet.sign(dataHex, account.privateKey)` (secp256r1), returns signature+public_key+address+script_hash. **It signs whatever bytes the host gives it — zero binding to a request or to the computed result.**
- `/attestation`: spawns `nsm-attest` binary (NITRO_ATTEST_BIN, default `/app/bin/nsm-attest`) with `--user-data <hex>` (+ optional `--nonce`, `--public-key`). user-data binds the enclave's pinned role public keys + network (`attestationUserDataHex`:229-240). Returns COSE-Sign1 CBOR base64 doc. **Today nothing VERIFIES this doc / PCRs** — the relayer's `signFulfillmentPayload` never requests or checks attestation; `compactTeeAttestation`/`buildVerificationEnvelope` (router.js:377-414) only forwards whatever the worker put in its body, unverified. This is the gap the "REAL remote attestation" goal must close.

---

# CONTRACT THE NEW IN-ENCLAVE COMPUTE+SIGN ENDPOINT MUST REPRODUCE

1. Accept the same per-lane inputs the worker handlers accept (workerPayload from `buildWorkerPayload`, router.js:275) and produce the SAME worker body shape per lane (so `encodeFulfillmentResult`/`buildOnchainResultEnvelope` are unchanged), OR move that encoding inside too.
2. Compute the result INSIDE the enclave for: price/feed, vrf, compute, confidential decrypt/seal, neodid (these 5 are the attested tier). Keep oracle.fetch/smart-fetch (arbitrary user URL) on the host — it needs the vsock-proxy allow-list which can't cover arbitrary URLs.
3. Sign (A) the on-chain fulfillment digest `buildFulfillmentDigestBytes` with `oracle_verifier` (secp256r1 N3 / secp256k1 EVM) — byte-identical to router.js:302/neox.js:332. The signing MUST happen over the result the enclave itself computed (bind compute→sign atomically, eliminating the host's current ability to feed an arbitrary `data_hex`).
4. Preserve the compact-callback encodings for vrf (raw 32B) and neodid tickets (router.js:53-134) so resultBytes/digest match.
5. Hold the confidential X25519 key + neodid signing key + oracle_verifier key inside the enclave (today: oracle X25519 derived from host-readable Secrets Manager master; neodid key host-side; only oracle_verifier/updater are enclave-pinned).
6. Emit a REAL attestation doc bound to the computed output (report_data = output/fulfillment hash) that the relayer (or a verifier) actually verifies (PCRs + AWS Nitro root + that the doc's user-data public key == the signer that signed (A)). Currently `signFulfillmentPayload` does none of this.
7. Feed-pusher: either move price compute+decision (`td`+`planFeedUpdate`) into the enclave and have it sign the tx over an enclave-computed value, or at minimum bind the signed message to an attested price. Today it blind-signs a host-decided tx via `:8787/sign/payload {role:'updater'}`.
8. Relayer/feed-pusher stay host-side as delivery (they only carry signature+bytes to `fulfillRequest`/`updateFeeds`; they can stall but not forge once compute+sign are atomic in-enclave).
</summary>
<parameter name="contracts">
ENCLAVE SIGNER (deploy/nitro/nitro-signer-server.mjs):

- POST :8787/sign/payload req {role|key_role, data_hex(hex)} resp {status:'ok', signature, signature_hex, public_key, address, script_hash, network, role, key_source} (handleSignPayload:206-227)
- POST :8787/attestation req {nonce?|report_data?, role?|key_role?} resp {status:'ok', format:'cose-sign1-cbor-base64', public_key, nonce, user_data_hex, document_len, attestation_document} (handleAttestation:257-310). user_data_hex = hex(JSON {runtime, network, roles:[{role,ok,public_key,script_hash}]}) (attestationUserDataHex:229-240)
- POST :8787/keys/derived req {role|key_role} resp {status,role,derived:{neo_n3:{address,script_hash,public_key}},neo_n3,key_source} (handleKeysDerived:192-204)
- POST :8787/provision req {env:{KEY:val}} resp {status,runtime,network,provisioned,env_keys,roles} (handleProvision:159-190)
- GET :8787/health resp {status:'ok'|'degraded', runtime:'aws-nitro-signer', network, roles}
- Auth: Bearer / x-nitro-token / x-phala-token / x-runtime-token vs runtimeTrustedTokens (assertAuthorized:50-70). /attestation is UNAUTH; /provision auth only if tokens set.

WORKER (workers/nitro-worker, :8080) capability routes (capabilities.js CAPABILITIES:258-434):

- /oracle/smart-fetch, /oracle/query, /oracle/feed(operatorOnly), /feeds/price[/:symbol], /feeds/catalog, /vrf/random, /oracle/decrypt(+binding), /oracle/message-reveal, /compute/execute, /compute/functions, /compute/jobs[/:id], /neodid/{bind,action-ticket,recovery-ticket,zklogin-ticket,providers,runtime}, /paymaster/authorize, /sign/payload, /relay/transaction, /txproxy/invoke, /keys/derived, /oracle/public-key, /oracle/heartbeat, /providers, GET /health|/info|/attestation
- Worker signed-result envelope (B), every lane: {output_hash=sha256(stableStringify(result)), signature(worker-role secp256r1 over output_hash), public_key, attestation_hash=output_hash, signer_address, signer_script_hash, key_source, tee_attestation, verification{...}} (chain/signing.js buildSignedResultEnvelope:192-211 / buildLaneSignedEnvelope:231-240)

RELAYER → WORKER worker payload (router.js buildWorkerPayload:275-289):
{...payload, request_id, request_source:`morpheus-relayer:<chain>`, target_chain, legacy_request_type, kernel_module_id, kernel_operation, requester, callback_contract, callback_method}

ON-CHAIN FULFILLMENT DIGEST (A) — must reproduce byte-for-byte:

- Neo N3 (router.js:360-374): sha256("miniapp-os-fulfillment-v1" || uint256_be(requestId) || sha256(appId)||sha256(moduleId)||sha256(operation) || successByte || sha256(resultBytes) || sha256(error) || [scriptHashLE(20)||networkMagicLE(4)])
- Legacy N3 (router.js:343-356): sha256("morpheus-fulfillment-v2" || uint256(requestId) || sha256(requestType) || successByte || sha256(resultBytes) || sha256(error))
- Neo X (neox.js:332-364): keccak256(abi.encode("morpheus-evm-fulfillment-v1", chainId, oracleContract, requestId, keccak(appId), keccak(moduleId), keccak(operation), success, keccak(resultBytes), keccak(error))); signed EIP-191 (neox.js:372)
- resultBytes = base64-decode(result_bytes_base64) if present (vrf raw32 / neodid ticket), else utf8(result string)

FULFILL SUBMISSION:

- N3: fulfillRequest(requestId, success, resultHex, error, signature) signed by 'updater' (neo-n3.js:1033-1085)
- EVM: fulfillRequest(uint256 requestId, bool success, bytes result, string error, bytes signature) (neox.js ORACLE_ABI:22, fulfillNeoXRequest:433-481)

COMPACT CALLBACKS (router.js:53-134): vrf→raw 32B randomness hex; neodid action_v1 = 0x01||hash160(disposable_account)||lp(action_id)||action_nullifier(32)||signature(64); recovery_v1 = 0x01||hash160(new_owner)||lp(recovery_nonce)||lp(expires_at)||lp(action_id)||master_nullifier(32)||action_nullifier(32)||signature(64); v3 = base64-piped string form.

FEED-PUSHER (deploy/feed-pusher/feed-pusher.mjs):

- N3 updateFeeds(pairs[], rounds[], prices\*1e6[], timestamps[], attestHashes[sha256(s|px|ts)[:32]], sourceSetIds[0]) on 0x03013f49c42a14546c8bbe58f9d434c3517fccab; tx signed via :8787/sign/payload {role:'updater', data_hex: txn.getMessageForSigning(860833102)} (nitroSign:226-236, pushNeoN3:250-350)
- EVM updateFeeds(symbols[], prices\*1e6[], timestamps[], roundIds[]) on 0x38DD6BCE...; signed LOCALLY with NEOX_FEED_PK (pushNeoX:375-443)
- Price source: TwelveData direct on host (td:150-174); decision planFeedUpdate:37-69 (threshold 10bps, stale 1800s, 50% deviation guard)
  </contracts>
  <parameter name="risks">
  <![CDATA[
  Today's compute runs on the untrusted host: only /sign/payload (blind data_hex) is enclave-side. The enclave signs ANY bytes the host supplies with oracle_verifier/updater keys — so a compromised host can sign an arbitrary fulfillment digest or feed tx. The new endpoint must bind compute→sign atomically inside the enclave (no caller-supplied data_hex for the attested tier).
  ]]>
  There are TWO signatures: (A) the on-chain oracle_verifier fulfillment-digest signature the kernel actually verifies, and (B) the worker-role output_hash "verification" signature folded into result JSON that the kernel does NOT verify. (B) is unattested provenance theater today; the redesign must make the attested in-enclave signature the real verified one.
  NeoDID has a THIRD signing identity (neodid key) that signs ticket digests inside the worker (neodid/index.js:404), key sourced from env/derived/pinned-worker — must also move in-enclave and be attested; its tickets are verified by the AA/kernel contract, not by oracle_verifier.
  Confidential decrypt's X25519 private key is sealed under a wrap key DERIVED from a Secrets Manager master read by the HOST worker (platform/nitro-signer.js:129-150; oracle/crypto.js:148-159). The host can therefore reconstruct the confidential key today — moving decrypt in-enclave requires the master/key to be enclave-only (NSM-sealed or KMS-with-attestation), not host-readable Secrets Manager.
  Feed-pusher computes the price value AND the push decision entirely on the host (TwelveData fetch + planFeedUpdate), then has the enclave blind-sign the resulting updateFeeds tx. The signed feed value has no TEE integrity today — a compromised host can sign a poisoned price (only the 50% deviation guard, also host-side, limits it). This is the weakest lane.
  Attestation is produced (/attestation, nsm-attest) but NEVER verified anywhere: signFulfillmentPayload requests no attestation; router.js compactTeeAttestation/buildVerificationEnvelope forward worker-supplied attestation unchecked. "Real remote attestation" (verify AWS Nitro root cert chain + PCR0/1/2 measurements + report_data binding + user-data pubkey == signer) is entirely absent and must be built.
  VRF is currently generated in the RELAYER (host) via crypto.randomBytes (fulfillment.js:707), bypassing even the worker's /vrf/random handler. It must move in-enclave to be trustless randomness.
  Digest bytes are consensus-critical and brittle: any normalization/trim difference (verbatim identifier hashing, scriptHashLE reversal, networkMagic LE, resultBytes compact-vs-utf8 selection) will make signatures unverifiable on-chain. The in-enclave reimplementation must import/share router.js:302 + neox.js:332 logic exactly, not re-derive it.
  oracle.fetch/smart-fetch (arbitrary user URL) cannot be attested (enclave net egress is allow-list-only via vsock-proxy) — it stays host-side as a lower un-attested trust tier; the result envelope must clearly distinguish attested vs un-attested lanes so consumers don't conflate them.
  ]]>
  </risks>
  </invoke>

### Contracts

### Risks

## NITRO ENCLAVE FEASIBILITY — moving the integrity-critical compute (price/VRF/compute/confidential/NeoDID/feeds) into the attested Nitro TEE alongside the signer

VERDICT: Feasible, with three concrete engineering items that must be solved before any in-enclave compute: (a) a vsock egress proxy + a finite destination allow-list, (b) reproducible EIF builds, (c) one external-binary gap (snarkjs) that must either be bundled or moved off the attested tier. Resource bump is modest. Recommendation: MERGE worker+signer into ONE enclave for testnet/staging.

=== CURRENT STATE (what is and isn't in the enclave today) ===

- Only the SIGNER runs in-enclave. Dockerfile.signer (deploy/nitro/Dockerfile.signer:10-33) builds a node:22-bookworm-slim image that COPYs only config/, scripts/lib-neo-signers.mjs, deploy/nitro/nitro-signer-server.mjs, entrypoint-signer.sh and the Go nsm-attest binary, and installs ONE npm dep: @cityofzion/neon-js (line 19). It does NOT contain the worker.
- The enclave entry (entrypoint-signer.sh:6-8) is socat VSOCK-LISTEN → EXEC node nitro-signer-server.mjs --stdio: a one-shot stdio HTTP handler per vsock connection (nitro-signer-server.mjs:462-463, handleStdioConnection). There is NO long-lived HTTP listener inside the enclave today; the worker, by contrast, is a long-lived http.createServer (workers/nitro-worker/src/server.js:46-66). This is an architectural mismatch the merge must reconcile (run worker.js as the long-lived listener and expose it over a vsock-LISTEN socat fork, OR run both processes inside the enclave).
- The worker today runs on the HOST as a systemd unit (deploy/nitro/morpheus-nitro-worker.service:9-11, ExecStart=/usr/bin/node src/server.js, port 8788) and the signer enclave is reached over vsock on 8787 (start-nitro-signer.sh:35 socat TCP-LISTEN:8787 → VSOCK-CONNECT:cid:8787). The relayer splits the two: NITRO_API_URL=http://127.0.0.1:8788 (worker), NITRO_SIGNER_URL=http://127.0.0.1:8787 (enclave) (nitro-worker.env.example:2-3).
- Attestation today binds only signer identities (nitro-signer-server.mjs:229-240 attestationUserDataHex embeds pinned Neo pubkeys/network). The nsm-attest helper (deploy/nitro/nsm-attest/main.go) is generic — accepts --nonce/--user-data/--public-key — so it can bind ANY result digest; nothing new is needed there to bind compute outputs.

=== (1) EGRESS — enclave has no NIC ===
The standard AWS pattern is the vsock-proxy + YAML allow-list (host:port), with the enclave performing END-TO-END TLS itself (Node's fetch/undici with bundled CA roots, so the host proxy only forwards encrypted bytes and cannot MITM). ca-certificates is already installed in the signer image (Dockerfile.signer:13), so the CA trust store is present. The deterministic lanes need a SMALL, finite allow-list — enumerated from the code:

Price/feed providers (workers/nitro-worker/src/oracle/providers.js):

- api.twelvedata.com:443 (line 490, buildProviderRequest twelvedata; key via TWELVEDATA_API_KEY)
- api1.binance.com:443 (line 521, default Binance base; note MORPHEUS_ALLOW_UNSAFE_PROVIDER_BASE_URL_OVERRIDE can change this — must be FORCED off in-enclave so the allow-list stays closed)
- api.coinbase.com:443 (line 541, coinbase-spot)

Chain RPC (Neo N3) — config/networks/{mainnet,testnet}.json:18-26 list coz.io + seedN.neo.org; the worker/relayer in practice use:

- api.n3index.dev:443 (relayer default RPC + indexer: workers/morpheus-relayer/src/config.js:24,32,469; also the live box per memory rpc/api/nexus.n3index.dev)
- mainnet1.neo.coz.io:443 / mainnet2.neo.coz.io:443, testnet1.neo.coz.io:443 (config/networks/\*.json)
- seed1..5(t5).neo.org:10332/20332 (config defaults — these are HTTP not HTTPS, a problem for the no-MITM goal; prefer the TLS coz.io/n3index endpoints in-enclave)
  NeoX EVM RPC (NeoDID message-reveal lane, message-reveal.js:99-100,118,148; relayer neox config.js:519-540):
- neoxt4seed1.ngd.network:443, neoxt4seed2.ngd.network:443

NeoDID web3auth JWKS (workers/nitro-worker/src/neodid/index.js:182):

- api-auth.web3auth.io:443 (createRemoteJWKSet, line 173/254 — fetched in-enclave to verify the id_token)

Supabase (the worker DOES write/read it directly): providers.js:159-176/296-329 (morpheus_projects, morpheus_provider_configs) and feed-state.js:26-100 (morpheus_feed_snapshots GET/POST). Endpoint is SUPABASE_URL — the project host, e.g. <ref>.supabase.co:443 (per memory the morpheus project ref is przhhxbovqwopibssjzr → przhhxbovqwopibssjzr.supabase.co:443).
AWS Secrets Manager (key material for confidential/NeoDID lanes): platform/nitro-signer.js:88-89 lazy-imports @aws-sdk/client-secrets-manager → secretsmanager.<AWS_REGION>.amazonaws.com:443 (default us-east-1, line 86). KMS endpoint kms.<region>.amazonaws.com:443 will also be needed if Secrets Manager secrets are KMS-encrypted (the SDK transparently calls KMS).

So the allow-list is ~10-12 host:port entries. CRITICAL trust-tier note (matches Decision 1): the arbitrary-user-URL lanes — oracle.fetch / oracle.smart_fetch (capabilities.js:344-348; raw fetch at oracle/fetch.js:200) — CANNOT be covered by a closed allow-list and MUST stay host-side as the un-attested lower tier. oracle.query/feeds/vrf/compute/neodid use only the finite providers above and CAN move in.

=== (2) IMAGE — what must be added to run worker.js in-enclave ===
Worker npm deps (workers/nitro-worker/package.json): @cityofzion/neon-js@^5.8.1 (already in signer image), ethers@^6.16.0 (NeoX EVM + message-reveal), jose@^6.2.1 (web3auth JWT verify), @aws-sdk/client-secrets-manager@^3.0.0 (key material). The signer image currently installs ONLY neon-js (Dockerfile.signer:19) — to merge, switch to a workspace-aware npm ci against package-lock.json and COPY workers/nitro-worker/src/\*\* + scripts/ + config/.
Subprocess primitives the worker needs INSIDE the enclave (all node-builtin, no extra OS pkgs): node:child_process fork for the script/wasm sandboxes (script-runner.js:2,76; wasm-runner.js:2,69) and execFile for the ZKP lane (compute/index.js:2,33,247). socat is already in the image (Dockerfile.signer:13).
EXTERNAL-BINARY GAP (concrete): the compute ZKP lane shells out to `snarkjs` (compute/index.js:226-227, 248 resolveSnarkjsCommand → 'snarkjs') and writes temp files to os.tmpdir() (index.js:235 mkdtemp). snarkjs is NOT in package.json/package-lock — it is currently a host-provided binary. To move the compute lane in-enclave you must either (a) add snarkjs to the image (npm dep + ensure the CLI resolves) or (b) keep groth16-via-CLI verification on the host (it has a non-CLI runtime branch too: index.js:265 resolveZkpVerificationRuntime !== 'cli'). This is the single biggest image gap.
FILESYSTEM/STATE: the enclave has NO persistent disk — only an in-RAM root + tmpfs. Two touchpoints:

- Feed state file: feed-state.js defaults to /data/morpheus-feed-state.json (oracle/feeds/shared.js:8 DEFAULT_FEED_STATE_PATH) with atomic temp+rename writes (feed-state.js:200-209). In-enclave this becomes ephemeral (lost on every enclave restart). That is acceptable BUT only because the code already bootstraps the baseline from Supabase when the file is empty (feed-state.js:176-186 fetchLatestFeedSnapshots), and persists snapshots to Supabase (persistFeedSnapshots). So Supabase is the durable store; the local file is just a cache. Set MORPHEUS_FEED_STATE_PATH to a tmpfs path and keep MORPHEUS_FEED_BOOTSTRAP_SUPABASE_ENABLED on. (If you split feed into a separate enclave per the README two-CVM model, that enclave also needs Supabase egress.)
- ZKP temp dir: os.tmpdir() (compute/index.js:235) → /tmp, which is tmpfs (RAM) in the enclave — fine, but counts against the memory budget (see resources).
  SECRET PROVISIONING: secrets currently arrive via the /provision POST over vsock at boot (start-nitro-signer.sh:50-91 → handleProvision in nitro-signer-server.mjs:159-190). That same channel can carry the worker's env (TWELVEDATA*API_KEY, SUPABASE*\*, NITRO_API_TOKEN, web3auth client id, RPC URLs). Note the security caveat already in the env examples (morpheus-nitro-signer.env.example:1-3, morpheus-nitro.env.example:2-4): pushing plaintext secrets from the host into the enclave UNDERMINES the trust model — the proper pattern is KMS-with-attestation (enclave proves PCRs to KMS Decrypt via the attestation doc). Moving compute in-enclave RAISES the stakes here because now provider API keys + Supabase service-role key + the x25519/neodid masters all live in the measured boundary; the host should never see them in plaintext. This argues for KMS envelope-decrypt-in-enclave over /provision for the merged design.

=== (3) RESOURCES — does 2 CPU / 2048 MiB fit? ===
Current allocations are inconsistent in the repo: Dockerfile/spec implies 2 CPU / 2048 MiB but the actual launcher start-nitro-signer.sh:15-16 and morpheus-nitro.env.example:10-11 default to 2 CPU / 1024 MiB. The signer alone (one neon-js sign per stdio connection) is tiny. The merged worker adds: a long-lived Node http server, ethers v6 (heavy), jose, the AWS SDK, plus fork()'d child processes for script/wasm sandboxes (each a separate Node process — script-runner.js:76, wasm-runner.js:69) and execFile snarkjs (memory-hungry, multi-hundred-MB for real circuits). Estimate: baseline merged idle ~250-400 MiB; under a concurrent script/wasm/ZKP job you can spike well past 1 GiB. RECOMMENDATION: bump to 2048 MiB minimum (4096 MiB if the ZKP/snarkjs lane runs in-enclave), keep 2 vCPU for staging (Nitro requires an even CPU count from the host's enclave-reserved pool; 4 vCPU if compute concurrency matters). The enclave memory must be reserved on the host via nitro-enclaves-allocator; the bump requires editing /etc/nitro_enclaves/allocator.yaml on the box (not in this repo).

=== (4) REPRODUCIBLE BUILD — matching PCR0 ===
Today the build is NOT reproducible. Gaps:

- Base images are tag-pinned, not digest-pinned: Dockerfile.signer:2 golang:1.22-bookworm, :10 node:22-bookworm-slim; worker Dockerfile:1 node:22-alpine. Tags float → PCR0 drifts. FIX: pin FROM ...@sha256:<digest> for every stage.
- Non-deterministic installs: signer image uses `npm install ... @cityofzion/neon-js@^5.8.1` (Dockerfile.signer:19) — a floating range, no lockfile. FIX: COPY package-lock.json (present, 9904 lines, deploy/nitro build context is repo root per build-nitro-signer-eif.sh:14) and use `npm ci` for byte-stable trees. The Go helper already builds deterministically (-trimpath -ldflags=-s -w, CGO_ENABLED=0, Dockerfile.signer:7) but `go get ...@latest` (line 6) floats — pin nsm to a version + commit go.mod/go.sum.
- Timestamps/ordering: EIF/PCR0 is sensitive to layer mtimes and file ordering. FIX: build with SOURCE_DATE_EPOCH, normalize mtimes, and (ideally) use a reproducible OCI builder (e.g. buildkit with rewrite-timestamp, or kaniko/nix). nitro-cli build-enclave (build-nitro-signer-eif.sh:15) derives PCR0/1/2 from the docker image — so determinism must come from the docker build.
- For CONSUMERS to verify: publish (a) the pinned Dockerfile + lockfiles + base-image digests, (b) the exact nitro-cli/blob versions (NITRO_CLI_BLOBS, build-nitro-signer-eif.sh:8), (c) the resulting PCR0/PCR1/PCR2 + PCR8 (signing cert). The REAL attestation verifier (the new work) must: parse the COSE_Sign1 doc, verify the chain to the AWS Nitro root cert, check PCR0/1/2 == the published reproducible values, and check the doc's user_data/public_key bind the specific result digest + nonce (the nsm-attest helper already supports all three fields: nsm-attest/main.go:44-64).

=== (5) MERGE vs TWO ENCLAVES ===
Two valid shapes; the repo already documents a two-CVM split (README.md:9-46: Oracle CVM = request/compute/neodid/confidential/signing; DataFeed CVM = feed sync/publish, kept isolated so price feeds survive bursty request traffic — README.md:34, and "do not merge it back" :146).

- RECOMMEND for testnet/staging: MERGE worker+signer into ONE enclave. Rationale: (a) the worker→signer call is currently a network hop (NITRO_API_URL vs NITRO_SIGNER_URL); merging makes compute+sign a single in-process step, which is exactly the integrity property we want (result computed AND signed inside one measured boundary, no host in between); (b) one PCR0 to verify instead of two; (c) simpler egress proxy. The cost: one bigger EIF, and you lose the feed/request isolation.
- For mainnet: follow the README split — Oracle enclave (compute+sign, the high-value tier) + a separate DataFeed enclave (feed-only, smaller, isolated). The signer MUST live with the Oracle compute (that is the whole point). DataFeed can be its own enclave with only Supabase + provider + RPC egress.
  Net: start MERGED on staging to prove the model end-to-end, then split feed out for mainnet to preserve the documented isolation guarantee.

### Contracts

EGRESS ALLOW-LIST (vsock-proxy YAML, host:port — TLS terminated IN-enclave):
api.twelvedata.com:443 # providers.js:490 (price; needs TWELVEDATA_API_KEY)
api1.binance.com:443 # providers.js:521 (price)
api.coinbase.com:443 # providers.js:541 (price)
api.n3index.dev:443 # relayer/config.js:24,32,469 (Neo N3 RPC + indexer; live box)
mainnet1.neo.coz.io:443 # config/networks/mainnet.json:18
mainnet2.neo.coz.io:443 # config/networks/mainnet.json:19
testnet1.neo.coz.io:443 # config/networks/testnet.json:18 (staging)
neoxt4seed1.ngd.network:443 # message-reveal.js / relayer neox (NeoX EVM)
neoxt4seed2.ngd.network:443 # relayer config.js:540
api-auth.web3auth.io:443 # neodid/index.js:182 (JWKS for NeoDID)
<ref>.supabase.co:443 # providers.js:159-176 + feed-state.js:26 (project config + feed snapshots; ref przhhxbovqwopibssjzr per memory)
secretsmanager.<region>.amazonaws.com:443 # nitro-signer.js:88-89 (key material)
kms.<region>.amazonaws.com:443 # if Secrets Manager secrets are KMS-encrypted / for attested decrypt
EXCLUDED (stays host-side, un-attested tier): oracle.fetch / oracle.smart_fetch arbitrary user URLs (capabilities.js:344-348; oracle/fetch.js:200).

LANE → TIER mapping (capabilities.js):
ATTESTED (move in): oracle*query (337-341), feeds*_ (351-369), vrf*random (369), compute (ZKP/script/wasm — needs snarkjs decision), neodid*_ (266-302), oracle_decrypt/seal + message_reveal (317-328), keys_derived (263).
UN-ATTESTED (keep host): oracle_smart_fetch (344-348), oracle_query when it proxies an arbitrary URL.

IMAGE DELTA (Dockerfile.signer must add):

- digest-pin: FROM golang:1.22-bookworm@sha256:..., node:22-bookworm-slim@sha256:...
- npm ci against committed package-lock.json (replace floating `npm install ...@^5.8.1` at line 19) → installs ethers, jose, @aws-sdk/client-secrets-manager, neon-js
- COPY workers/nitro-worker/src/\*\*, scripts/, config/
- decision: bundle snarkjs (npm) OR keep ZKP-CLI on host (compute/index.js:226-265)
- long-lived listener: run worker.js http server, expose via socat VSOCK-LISTEN fork (not the current one-shot stdio model, entrypoint-signer.sh:6-8)

RESOURCES: 2 vCPU / 2048 MiB minimum for merged worker+signer; 4096 MiB if snarkjs/ZKP runs in-enclave. (Current: start-nitro-signer.sh:15-16 = 2 CPU / 1024 MiB; bump via allocator.yaml on host.)

ATTESTATION (real verify, new work): COSE_Sign1 doc from nsm-attest (main.go) → verify cert chain to AWS Nitro root → assert PCR0/1/2 == published reproducible values → assert user_data binds result digest + nonce binds freshness (helper already supports --user-data/--nonce/--public-key, main.go:44-64).

### Risks

- No-MITM goal conflicts with config defaults: seedN.neo.org RPC endpoints are HTTP not HTTPS (config/networks/\*.json:20-26) and Binance base URL is host-overridable via MORPHEUS_ALLOW_UNSAFE_PROVIDER_BASE_URL_OVERRIDE (providers.js:452-455,519). In-enclave you MUST force HTTPS-only endpoints and hard-disable the base-URL override, else the egress allow-list/end-to-end-TLS guarantee is void.
- snarkjs is invoked as a host CLI but is NOT a declared dependency (compute/index.js:227 default 'snarkjs'; absent from package.json/package-lock). Moving the compute/ZKP lane in-enclave breaks unless snarkjs is bundled into the EIF or the lane is kept on the un-attested host tier.
- Secret blast radius increases: merging compute means provider API keys + Supabase service-role key + x25519/neodid masters all live inside the measured boundary. The current /provision-over-vsock push (start-nitro-signer.sh:50-91) hands plaintext from the host into the enclave — the env examples themselves warn this undermines TEE trust (morpheus-nitro-signer.env.example:1-3). Must move to KMS-attested-decrypt-in-enclave before mainnet.
- Reproducible PCR0 is currently impossible: floating base-image tags (Dockerfile.signer:2,10), `npm install` with a caret range and no lockfile (line 19), and `go get nsm@latest` (line 6). Until all three are pinned + deterministic, consumers cannot match PCR0 and remote attestation verification is meaningless.
- Enclave has no persistent disk: feed-state file (/data, oracle/feeds/shared.js:8) becomes ephemeral. Safe ONLY because Supabase is the durable baseline (feed-state.js:176-186) — but that hard-couples the in-enclave feed lane to Supabase egress, and Supabase has had quota-outage history (memory: morpheus project over 8GB). A Supabase outage now also stalls in-enclave feed bootstrap.
- Architectural rework: the enclave today is a one-shot stdio HTTP handler per vsock connection (entrypoint-signer.sh:6-8, nitro-signer-server.mjs:462), while the worker is a long-lived server (server.js:46). The merge requires running worker.js as a persistent listener behind socat VSOCK-LISTEN — not a trivial config flip.
- Memory pressure from fork()'d sandboxes: script/wasm runners spawn child Node processes (script-runner.js:76, wasm-runner.js:69) and ZKP writes to tmpfs /tmp (compute/index.js:235); concurrent jobs can exceed 1 GiB, risking OOM in a 1024/2048 MiB enclave with no swap.
- Relayer/feed-pusher integration assumes split URLs (NITRO_API_URL:8788 worker, NITRO_SIGNER_URL:8787 enclave, nitro-worker.env.example:2-3). A merged enclave changes the relayer's runtime URL wiring; the relayer's request->result binding via signature is preserved (it only delivers), but the endpoint topology must be re-pointed.

## Remote Attestation (real verification): AWS Nitro NSM COSE-Sign1 document parse + cert-chain-to-AWS-root + PCR0/1/2 pinning + user_data binding

## Current state (presence-only, evidence)

The enclave produces a genuine AWS NSM attestation document but NOTHING verifies it cryptographically.

- Enclave side: `deploy/nitro/nitro-signer-server.mjs:257-310` `handleAttestation()` shells out to `/app/bin/nsm-attest` (`nitro-signer-server.mjs:11,267-273`). The Go helper `deploy/nitro/nsm-attest/main.go:54-79` opens `/dev/nsm`, calls `request.Attestation{Nonce, UserData, PublicKey}` (uses `github.com/hf/nsm`, Dockerfile.signer:5-7 `go get github.com/hf/nsm@latest`), and returns the raw COSE_Sign1 document base64 (`main.go:75-79`). The server returns it verbatim as `attestation_document` with `format: "cose-sign1-cbor-base64"` (`nitro-signer-server.mjs:303,308`). It performs ZERO verification — it just relays bytes.
- user_data today: `attestationUserDataHex()` (`nitro-signer-server.mjs:229-240`) binds `{ runtime, network, roles:[{role, ok, public_key, script_hash}] }` — the Neo signer pubkeys, NOT the per-result output_hash. The worker-result lane separately uses `report_data` via `normalizeReportData` (`workers/nitro-worker/src/platform/nitro-signer.js:218-227`, posts `report_data_hex` to `/attest` at line 239) but that `/attest` route does not exist on the signer server (only `/attestation`) — so the result-binding attestation path is effectively dead; `maybeBuildDstackAttestation` (`chain/signing.js:200`) returns null on failure and attestation is "never required for fulfillment" (`nitro-signer.js:230`).
- Consumer side: `apps/web/lib/attestation.ts:72-217` `verifyAttestation()` checks ONLY hash binding (output_hash == attestation_hash, report_data[0:32] prefix) + metadata equality (compose_hash/app_id/instance_id). It NEVER parses COSE, never checks a cert chain, never checks PCRs. The code is honest about this: `attestation.ts:160-167` comment + `measurement_chain_verified: false` (line 178) + `attestation_scope` string (line 177). `full_attestation_ok` is "quote present + event_log present" only (line 167, `hasQuote`=`attestation.quote` exists, `hasEventLog`=key present). The `/api/attestation/verify` route (`apps/web/app/api/attestation/verify/route.ts:21-46`) just forwards to this function. The `/verifier` page (`apps/web/app/verifier/page.tsx`) UI text confirms presence-only (lines 498-499). This is exactly review item E8 (`claudedocs/oracle-improvement-roadmap-2026-06-14.md:108` — "validates only hash binding, not the Nitro/TDX quote chain", points at `attestation.ts:202`).
- NO published PCRs anywhere (grep for PCR0/expected_pcr/measurements.json across repo: zero hits outside node_modules). NO COSE/CBOR/ASN.1/x509 lib in any package.json (grep: zero). The doc `docs/ATTESTATION_SPEC.md:130-134` explicitly says it does NOT validate cert chains or trust roots.

## What "real verification" must do — the Nitro attestation document structure

AWS NSM returns a CBOR-encoded COSE_Sign1 (RFC 8152) over a CBOR map (the "attestation document") containing: `module_id`, `timestamp`, `digest` (always "SHA384"), `pcrs` (map index→48-byte SHA384), `certificate` (DER, the leaf/enclave signing cert), `cabundle` (array of DER intermediate certs, root-first), `public_key` (echoes our `--public-key`), `user_data` (echoes our `--user-data`), `nonce` (echoes our `--nonce`). The COSE_Sign1 is signed with the leaf cert's P-384 (ES384) key; the leaf chains via cabundle up to the AWS Nitro Enclaves root.

### Verifier algorithm (consumer side, the real version)

1. base64-decode `attestation_document` → CBOR-decode the COSE_Sign1 array `[protected, unprotected, payload, signature]`.
2. CBOR-decode `payload` → the attestation-document map. Sanity: `digest === "SHA384"`, `module_id` non-empty, `timestamp` within an acceptable skew/freshness window.
3. Build cert chain: leaf = `certificate`; intermediates = `cabundle`; trust anchor = PINNED AWS Nitro root. Verify each cert's validity period (against `timestamp`), signatures up the chain, basicConstraints/keyUsage, and that the chain terminates at the pinned root.
4. Verify the COSE_Sign1 signature: reconstruct the COSE Sig_structure `["Signature1", protected_headers, external_aad=empty, payload]`, CBOR-encode it, and verify ES384 against the LEAF cert's public key (alg in protected header must be ES384 / -35).
5. Check PCRs: compare `pcrs[0]`, `pcrs[1]`, `pcrs[2]` (48-byte hex) against the PUBLISHED expected measurements for the current oracle EIF release. PCR0 = enclave image (kernel+app), PCR1 = Linux kernel+bootstrap, PCR2 = application. (Optionally PCR8 = signing-cert measurement if the EIF is signed.) Reject if any differ — this is what proves the enclave runs the genuine oracle code, not arbitrary code.
6. Bind result: recompute `expected_user_data` and assert `document.user_data` equals it; assert `document.public_key` equals the signer pubkey that produced the Neo signature on the result; assert `document.nonce` equals the caller-supplied freshness nonce. For the per-result lane, `user_data` must commit to `output_hash` (e.g. user_data = the canonical result hash, or a struct containing it) so the attestation cryptographically binds THIS result to THIS enclave.
7. Only when 1-6 pass set `measurement_chain_verified: true`. `full_attestation_ok` should be redefined to require this.

## Where the AWS Nitro root cert comes from + pinning

AWS publishes the Nitro Enclaves root CA at https://aws-nitro-enclaves-crl.s3.amazonaws.com/AWS_NITRO_ENCLAVES_ROOT-G1.zip (PEM; SHA256 fingerprint published in AWS docs). DO NOT fetch it at verify-time (TOFU / MITM risk). Pin it: commit the PEM as a constant (e.g. `apps/web/lib/attestation/aws-nitro-root.pem` + a hardcoded SHA256 fingerprint asserted at load) and verify the bundled file's digest on startup. Treat it like the EIF PCRs — rotated only by an explicit, reviewed code change. (AWS root validity runs to ~2049; expiry is not a near-term concern.) CRL/revocation of intermediates is optional hardening (the cabundle is short-lived/per-instance); pinning root + checking validity windows is the must-have.

## Where/how expected PCRs are published so a consumer can fetch + compare

PCR0/1/2 are emitted by `nitro-cli build-enclave` (invoked at `deploy/nitro/build-nitro-signer-eif.sh:15`) — it prints a `Measurements` JSON ({HashAlgorithm, PCR0, PCR1, PCR2}). Today these are DISCARDED. Design:

- Capture build-enclave's JSON into a committed, versioned manifest, e.g. `deploy/nitro/measurements/<release>.json` = `{ release, eif_sha256, git_commit, app_id, pcr0, pcr1, pcr2, built_at }`, and surface it through a stable, signed-or-pinned endpoint the verifier can fetch: e.g. `apps/web/app/api/attestation/measurements/route.ts` (GET, returns the committed manifest for {network, release}) plus a static copy in the repo for offline verification. The build script (build-nitro-signer-eif.sh) must be modified to redirect build-enclave output to the manifest and fail if PCRs are empty. Because PCRs are reproducible from the EIF, anyone can rebuild the EIF and confirm the published PCRs (publish the Dockerfile.signer + pinned base-image digests so the build is reproducible — note Dockerfile.signer:7 `go get github.com/hf/nsm@latest` and :19 `neon-js@^5.8.1` are NON-pinned and MUST be pinned to exact versions/digests for reproducibility). The consumer verifier loads the pinned manifest (committed) as the source of truth, optionally cross-checks the API.

## Server-side vs client-side verification story

- Server-side (authoritative): implement the full algorithm in a Node route, e.g. `apps/web/app/api/attestation/verify/route.ts` calling a new `verifyNitroAttestationDocument()` (new file `apps/web/lib/nitro-attestation.ts`) that does COSE/CBOR/x509. Server holds the pinned root PEM + pinned PCR manifest; returns `{ cose_signature_ok, cert_chain_ok, pcr0/1/2_match, root_pinned_ok, user_data_bound_ok, nonce_match, public_key_bound_ok, measurement_chain_verified }`. Keep the EXISTING `verifyAttestation()` hash-binding as a separate, complementary layer (it binds output_hash↔result; the new layer binds enclave-code↔document). Final trust = both layers pass.
- Client-side (trust-minimized for the truly paranoid): the `/verifier` page can do the same verification entirely in-browser using the SAME pinned root + pinned PCRs shipped as static assets, so a user need not trust the Morpheus server. COSE/CBOR run fine in-browser; cert-chain/ES384 via WebCrypto (P-384 verify) + a small ASN.1/x509 parse. Provide it as an optional "verify locally" mode.

## npm libs for COSE/CBOR/Nitro

None are installed today. Recommended: `cbor2` or `cbor-x` (CBOR decode), `cose-js` or hand-rolled COSE_Sign1 (it is small — just rebuild the Sig_structure and ES384-verify), `@peculiar/x509` + `pkijs`/`asn1js` (or `node-forge`) for DER cert-chain verification, and WebCrypto/`crypto.verify('SHA384'...)` for ES384. There are purpose-built libs (`aws-nitro-enclaves-cose` in Rust, `nitrite`/`nsm-attestation` in JS) but they vary in maintenance; given the repo ships NO COSE/CBOR dep and prizes minimal pinned deps (see hand-rolled HTTP in nitro-signer-server.mjs), a MINIMAL hand-rolled COSE_Sign1 verify (a few hundred lines: CBOR decode + Sig_structure rebuild + WebCrypto ES384 + @peculiar/x509 chain) is the lower-supply-chain-risk path and matches the existing house style. Pin whatever is chosen to exact versions.

## Concrete gaps to close (file-level)

1. nitro-signer-server.mjs:229-240 — extend user_data to commit to output_hash for the per-result lane (today only binds signer pubkeys); add a `/attest` route or fix the worker to POST `/attestation` (nitro-signer.js:236 posts `/attest` which 404s).
2. nsm-attest/main.go — already correct (returns the document); ensure `--public-key` is always the Neo signer pubkey so document.public_key binds the signer.
3. build-nitro-signer-eif.sh:15 — capture build-enclave Measurements into a committed manifest; pin Dockerfile.signer:7,19 deps for reproducible PCRs.
4. apps/web/lib/attestation.ts + verify/route.ts — add the real COSE/cert/PCR verification as a new layer; redefine full_attestation_ok / measurement_chain_verified to require it.

### Contracts

### Enclave /attestation response (exists today, nitro-signer-server.mjs:298-309)

{ status:"ok", runtime:"aws-nitro-signer", network, role, format:"cose-sign1-cbor-base64",
public_key: <signer pubkey hex|null>, nonce: <hex|null>, user_data_hex: <hex>,
document_len: <int>, attestation_document: <base64 COSE_Sign1> }

### Decoded NSM attestation document (CBOR map inside COSE_Sign1 payload)

{ module_id, timestamp, digest:"SHA384", pcrs:{0:<48B>,1:<48B>,2:<48B>,...},
certificate:<DER leaf>, cabundle:[<DER>...], public_key:<echo --public-key>,
user_data:<echo --user-data>, nonce:<echo --nonce> }

### NEW: published PCR manifest deploy/nitro/measurements/<release>.json (committed; served at /api/attestation/measurements)

{ release, app_id, network, git_commit, eif_sha256, hash_algorithm:"SHA384",
pcr0:<hex48>, pcr1:<hex48>, pcr2:<hex48>, pcr8?:<hex48>, built_at }

### NEW: pinned root apps/web/lib/attestation/aws-nitro-root.pem (+ asserted SHA256 fingerprint constant)

Source: https://aws-nitro-enclaves-crl.s3.amazonaws.com/AWS_NITRO_ENCLAVES_ROOT-G1.zip (pin, do not fetch at runtime)

### NEW: /api/attestation/verify request additions (consumer supplies nonce for freshness)

{ attestation_document:<base64>, nonce:<hex>, expected_signer_public_key:<hex>,
expected_output_hash:<hex>, expected_release:<id> } // plus existing hash-binding fields

### NEW: verify response additions (replaces presence-only booleans)

{ cose_signature_ok, cert_chain_ok, root_pinned_ok, pcr0_match, pcr1_match, pcr2_match,
user_data_bound_ok, public_key_bound_ok, nonce_match, timestamp_fresh,
measurement_chain_verified:true, // ONLY when all above pass
...existing binding_ok/checks/actual/expected }

### Verifier algorithm (canonical order)

b64-decode → CBOR-decode COSE_Sign1 → CBOR-decode payload doc → assert digest=SHA384+fresh →
build chain(leaf=certificate, mids=cabundle, anchor=PINNED root) verify validity+sigs →
verify COSE Sig_structure ["Signature1",protected,b"",payload] ES384 vs leaf pubkey →
pcrs[0/1/2] == pinned manifest → user_data==expected (commits output_hash) +
public_key==signer pubkey + nonce==caller nonce → measurement_chain_verified=true.

### Risks

- Reproducible-build dependency: PCRs only mean something if a third party can rebuild the EIF and get the same PCR0/1/2. Dockerfile.signer:7 `go get github.com/hf/nsm@latest` and :19 `neon-js@^5.8.1` are non-pinned, plus node:22-bookworm-slim / golang:1.22-bookworm are floating tags — these MUST be pinned to digests or PCRs are not independently verifiable.
- Root-cert pinning is a single point of trust: if AWS rotates the Nitro root (G1→G2) the pinned PEM goes stale and ALL verification fails closed. Need a documented, reviewed rotation path (and possibly support multiple pinned roots).
- PCR-manifest publication must itself be trustworthy: serving it from the same Morpheus server the user is trying to NOT trust is circular. Commit it in-repo (reviewable) and/or sign it; the client-side verifier should ship the pinned copy as a static asset.
- Per-result binding is currently broken/dead: worker posts /attest (nitro-signer.js:236) but the server only serves /attestation; user_data binds signer pubkeys not output_hash (nitro-signer-server.mjs:238). Until fixed, the document cannot cryptographically bind an individual oracle result — only that SOME genuine enclave is alive.
- Freshness/replay: without a caller nonce the same valid attestation document can be replayed indefinitely. The verifier must require + check `nonce`; the enclave already forwards it (main.go:60, nitro-signer-server.mjs:268).
- Hand-rolled COSE/ES384/x509 is security-critical crypto — subtle bugs (wrong Sig_structure encoding, skipped validity-window or basicConstraints checks, accepting alg from unprotected header) silently defeat the whole guarantee. If hand-rolled, it needs adversarial test vectors (tampered doc, wrong root, mismatched PCR, expired cert, replayed nonce).
- Tiered-trust boundary must be surfaced in the verifier output: the arbitrary-URL HTTP fetch lane stays host-side and CANNOT carry a measurement-verified attestation. The verifier must not let a host-tier result masquerade as enclave-attested (distinct request_type/scope label).
- TDX-vs-Nitro mismatch in existing code/docs: attestation.ts/ATTESTATION_SPEC.md still speak of TDX/report_data 64-byte (Phala dstack legacy). Nitro NSM uses user_data/nonce/public_key, no 64-byte report_data; the verifier and spec must be rewritten for the Nitro document shape, not patched onto the TDX assumptions.
