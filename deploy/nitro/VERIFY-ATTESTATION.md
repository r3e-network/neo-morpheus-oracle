# Verifying the Morpheus Oracle TEE enclave

Release **`oracle-enclave-testnet-2026-06-14.1`** — the merged compute+sign
enclave **deployed live on Neo N3 mainnet** (2026-06-14 cutover).

This release is the **merged compute+sign Nitro Enclave** for the Morpheus
Oracle: the worker compute (price feeds, HTTP/JSON oracle lanes, VRF) and the
secp256r1 / secp256k1 signers run inside **one** AWS Nitro Enclave, so a result
is computed **and** signed within a single measured boundary — the host never
sees or substitutes the data between compute and signature. Because we run a
single node (not a decentralized quorum), the TEE *is* the trust root: the
enclave attests to exactly which code is running, and consumers verify that
attestation before trusting a signed result.

The enclave reaches its price/RPC providers over an **allow-listed host egress
proxy** (`deploy/nitro/vsock-proxy.allowlist.yaml`): it has no NIC, so all
outbound traffic is end-to-end TLS to the real provider tunnelled over vsock; the
host forwards opaque ciphertext and cannot MITM. Signing keys + network + the
worker config are injected at runtime via `POST /provision` (the enclave boots
with only the baked image ENV); the **same reproducible EIF serves testnet or
mainnet** depending on the provisioned network, so its PCRs are network-agnostic.

This document tells you how to independently verify, end to end, that the code
running in the enclave is the code in this repository — with no need to trust
the operator.

---

## 1. What is measured

`nitro-cli build-enclave` derives three Platform Configuration Registers from the
enclave image:

| PCR  | Covers | Value (this release) |
|------|--------|----------------------|
| PCR0 | The whole enclave image (kernel + ramdisk + application) | `4a76e94891b5a698b2eba9c03fbecbeb37e195eb7963d4841feef68070c1a56ad42c60fd558613c0b40292ee44777194` |
| PCR1 | Linux kernel + boot ramdisk (stable across app changes) | `4b4d5b3661b3efc12920900c80e126e4ce783c522de6c02a2a5bf7af3a2b9327b86776f188e4be1c1c404a129dbda493` |
| PCR2 | The application filesystem | `224c4d8ac2cde303f919b7165efef6c0932b042f1e50d95b3053a5ed41f67eef2943333baa0bd6de9ed3f3eaba81e3df` |

- **Hash algorithm:** SHA384 (48 bytes / 96 hex chars each)
- **Source commit:** `9ee3e2d089da64b494d8fd5da666b50207edaf6c`
- **Docker image id:** `sha256:cac832b964af48b92b4691265703e0101c8502feb74eb317d97f8ece8aae1f85`

The authoritative copy of these values is committed at
`deploy/nitro/measurements/oracle-enclave-testnet-2026-06-14.1.json` and served
live at `GET /api/attestation/measurements`. The **live mainnet enclave's
attestation reports exactly this PCR0** (verified at cutover).

> **Note on the `.eif` file hash.** `nitro-cli` stamps a build timestamp into the
> EIF *file* metadata, so the **file sha256 is not stable** between builds even
> when the measured filesystem is identical. **Do not** verify by EIF file hash —
> verify by **PCR**. The PCRs are derived only from the flattened filesystem and
> are reproducible (see §2). The `eif_sha256` in the manifest identifies the one
> specific artifact this operator built, for download-integrity only.

---

## 2. Verification path A — reproducible rebuild (strongest)

The enclave image is **reproducible by construction**: a third party who rebuilds
it from this source gets **byte-identical PCRs**. This is the strongest guarantee
— it ties the published measurements to auditable source with no trust in the
operator at all.

Requirements: a Linux host with Docker and `aws-nitro-cli` installed (an
EC2 instance type that supports Nitro Enclaves, or any host with the nitro-cli
package; the measurement step does not need the enclave to actually run).

```bash
git clone https://github.com/r3e-network/neo-morpheus-oracle
cd neo-morpheus-oracle
git checkout 9ee3e2d089da64b494d8fd5da666b50207edaf6c   # or the release tag

# Build twice from scratch and assert identical PCRs (the built-in gate):
bash deploy/nitro/build-enclave-eif.sh --verify-reproducible
```

Expected output ends with:

```
    build #1 PCRs: 4a76e948…|4b4d5b36…|224c4d8a…
    build #2 PCRs: 4a76e948…|4b4d5b36…|224c4d8a…
    OK: identical PCR0/PCR1/PCR2 across two independent builds -> reproducible enclave
```

Confirm those PCRs equal the table in §1. They will.

**Why it is reproducible:** base images are digest-pinned (`@sha256`), node deps
come from the committed `package-lock.json` via `npm ci`, the Go NSM helper is
pinned via `go.mod`/`go.sum` and built with `-trimpath -buildvcs=false`, apt
versions are pinned, and every build-time cache/log/mtime that would otherwise
flip a layer (npm cache + logs, Node's V8 compile cache, apt/dpkg logs, file
mtimes) is stripped in `Dockerfile.enclave`.

---

## 3. Verification path B — live attestation (proves what is *running*)

This proves the enclave **actually running in production** is this exact build —
not just that the build is reproducible.

```bash
# 1. Ask the live enclave for a fresh attestation document (bind it to a nonce
#    you choose so the response cannot be replayed):
curl -s "https://<oracle-host>/api/attestation/verify?nonce=$(openssl rand -hex 16)" | tee att.json
```

The endpoint returns the enclave's NSM attestation document and the server-side
verification result. To verify it **yourself** rather than trusting the server:

1. Decode the COSE_Sign1 attestation document.
2. Verify its certificate chain terminates at the **AWS Nitro Enclaves Root G1**
   (attached: `aws-nitro-root-g1.pem`, see §5 for its fingerprint) using ES384.
3. Check the document's `pcrs` map equals PCR0/1/2 in §1.
4. Check the document's `nonce` equals the nonce you sent and `timestamp` is
   fresh.
5. Check the signed `public_key` / `user_data` binds the result-signing key the
   oracle uses on-chain.

A reference implementation of exactly this check (CBOR + COSE_Sign1 + X.509 chain
to the pinned root + PCR + nonce binding, zero external deps) lives at
`apps/web/lib/nitro-attestation.ts`, with adversarial tests in
`apps/web/lib/nitro-attestation.test.ts`.

---

## 4. Verification path C — measure a built EIF

If you have built (or obtained) the `.eif`, measure it directly without running
it:

```bash
nitro-cli describe-eif --eif-path morpheus-oracle.eif
```

Compare the `Measurements.PCR0/1/2` to §1. The attached
`describe-eif.oracle-enclave-testnet-2026-06-14.1.json` is this operator's own
`describe-eif` output for cross-reference (its `Metadata.BuildTime` is the
non-measured field that makes the file hash vary — the PCRs are what match).

---

## 5. The AWS root of trust

The whole attestation chain (path B) anchors to the AWS Nitro Enclaves PKI root,
included here so you pin the same one we do:

- File: `aws-nitro-root-g1.pem`
- **Certificate (DER) SHA-256:** `641a0321a3e244efe456463195d606317ed7cdcc3c1756e09893f3c68f79bb5b`
- Subject/Issuer: `CN=aws.nitro-enclaves, OU=AWS, O=Amazon, C=US` (self-signed)
- Validity: 2019-10-28 … 2049-10-28

This is the published AWS Nitro Enclaves Root G1. Confirm the DER SHA-256 above
matches AWS's documented value before trusting it.

---

## 6. Release assets

| Asset | What it is |
|-------|------------|
| `oracle-enclave-testnet-2026-06-14.1.measurements.json` | The canonical PCR manifest (source of truth for §1). |
| `describe-eif.oracle-enclave-testnet-2026-06-14.1.json` | `nitro-cli describe-eif` of the operator's build (§4). |
| `aws-nitro-root-g1.pem` | AWS Nitro Enclaves Root G1 (§5). |
| `nsm-attest-src/` | Source of the in-enclave NSM attestation helper (`main.go` + pinned `go.mod`/`go.sum`); reproduced inside the image. |
| `SHA256SUMS` | sha256 of every asset above. |
| `VERIFY-ATTESTATION.md` | This document. |

**The 295 MB `.eif` binary is not attached.** It is *reproducible from source*
(§2) — rebuilding the tagged commit yields the identical PCRs — and the build
host is access-restricted (no registry/object-store egress), so publishing the
binary adds download convenience but no verification power over the reproducible
build. If you need the prebuilt EIF, build it with §2 (you will get the exact
same measurements) or request it from the operator.

---

## 7. Status

- Reproducible build + measurements: **published and independently verifiable.**
- **Deployed live on Neo N3 mainnet (2026-06-14):** the merged compute+sign
  enclave replaced the signer-only enclave; the relayer computes+signs
  fulfilments via the enclave (`MORPHEUS_RELAYER_ENCLAVE_FULFILL`) and the
  feed-pusher computes+signs Neo N3 feed updates via the enclave
  (`MORPHEUS_FEED_PUSHER_ENCLAVE_SIGN`). The live enclave's attestation reports
  PCR0 `4a76e948…` (matches §1).
- Enclave golden-vector tests (digest/envelope/signature byte-exactness):
  `deploy/nitro/enclave-server.test.mjs`; egress allow-list tests:
  `deploy/nitro/host-egress-proxy.test.mjs`.
- **Same EIF, both networks:** the image bakes `MORPHEUS_NETWORK=testnet` as a
  default, but the runtime network + keys are injected via `/provision`, so this
  one reproducible EIF (PCRs above) is what runs on mainnet too.
- **Host-tier (not yet in-enclave):** the arbitrary-URL fetch lane (by design —
  cannot be egress-allow-listed) and the Neo X (EVM) feed-pusher path (signs
  locally with secp256k1). These remain on the host and are not enclave-attested.
