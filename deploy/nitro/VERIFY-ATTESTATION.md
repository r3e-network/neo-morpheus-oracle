# Verifying the Morpheus Oracle TEE enclave

Release **`oracle-enclave-testnet-2026-06-14`**

This release is the **merged compute+sign Nitro Enclave** for the Morpheus
Oracle: the worker compute (price feeds, HTTP/JSON oracle lanes, VRF) and the
secp256r1 / secp256k1 signers run inside **one** AWS Nitro Enclave, so a result
is computed **and** signed within a single measured boundary — the host never
sees or substitutes the data between compute and signature. Because we run a
single node (not a decentralized quorum), the TEE *is* the trust root: the
enclave attests to exactly which code is running, and consumers verify that
attestation before trusting a signed result.

This document tells you how to independently verify, end to end, that the code
running in the enclave is the code in this repository — with no need to trust
the operator.

---

## 1. What is measured

`nitro-cli build-enclave` derives three Platform Configuration Registers from the
enclave image:

| PCR  | Covers | Value (this release) |
|------|--------|----------------------|
| PCR0 | The whole enclave image (kernel + ramdisk + application) | `3e563972dd7de8837b8ee8fb1a2d498540f5d992a5c13c9332dd89bb11b09e8d82fec64b1271c735f752b204b07c5a11` |
| PCR1 | Linux kernel + boot ramdisk (stable across app changes) | `4b4d5b3661b3efc12920900c80e126e4ce783c522de6c02a2a5bf7af3a2b9327b86776f188e4be1c1c404a129dbda493` |
| PCR2 | The application filesystem | `7613d5c589df3377dcc6cfd9cb365686c32278e4aa0ab8bac1b11c192f1ab076278deb05da217bc3a2fff329dab7ae25` |

- **Hash algorithm:** SHA384 (48 bytes / 96 hex chars each)
- **Source commit:** `c2196e4a28f3ca33e33f110af3b9b956be19553d`
- **Docker image id:** `sha256:8b350e2338cd720f874026cc139bb1c653d16b3993e9d488ecf6fcee0724ced1`

The authoritative copy of these values is committed at
`deploy/nitro/measurements/oracle-enclave-testnet-2026-06-14.json` and served
live at `GET /api/attestation/measurements`.

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
git checkout c2196e4a28f3ca33e33f110af3b9b956be19553d   # or the release tag

# Build twice from scratch and assert identical PCRs (the built-in gate):
bash deploy/nitro/build-enclave-eif.sh --verify-reproducible
```

Expected output ends with:

```
    build #1 PCRs: 3e563972…|4b4d5b36…|7613d5c5…
    build #2 PCRs: 3e563972…|4b4d5b36…|7613d5c5…
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
`describe-eif.oracle-enclave-testnet-2026-06-14.json` is this operator's own
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
| `oracle-enclave-testnet-2026-06-14.measurements.json` | The canonical PCR manifest (source of truth for §1). |
| `describe-eif.oracle-enclave-testnet-2026-06-14.json` | `nitro-cli describe-eif` of the operator's build (§4). |
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
- Enclave golden-vector tests (digest/envelope/signature byte-exactness):
  `deploy/nitro/enclave-server.test.mjs`.
- Network: **testnet** build (the image bakes `MORPHEUS_NETWORK=testnet`). The
  mainnet enclave is a separate build with its own published manifest; the
  mainnet cutover from the signer-only enclave to this merged compute+sign
  enclave is performed in a maintenance window.
