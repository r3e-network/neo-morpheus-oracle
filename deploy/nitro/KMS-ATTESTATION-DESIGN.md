# Phase C (complete) — KMS attestation-gated key release

**Goal:** only the *attested* enclave can unwrap the confidential keys (X25519 oracle
decryption key, neodid salt master, Neo N3 wrap key). The host — even with the EC2
instance role + IMDS creds + the on-disk keystore — **cannot**. This is the true
"no private key on the host" guarantee (the vsock-proxy step alone leaves the host able
to re-derive; KMS attestation closes that).

## ⛔ Blocker (needs an AWS admin on account 736326664265)

The box role `MorpheusNitroRelayerInstanceRole` has **no KMS permissions**
(`kms:ListKeys`, `kms:CreateKey` → AccessDenied). The AWS-infra steps below **must be
run by an account admin** (or grant me admin KMS+IAM creds). The code steps I can do now.

## Approach

AWS KMS `Decrypt` conditioned on **`kms:RecipientAttestation`**. The enclave sends a
Nitro attestation document with the `Decrypt` call; KMS verifies it + the PCR condition,
then returns the plaintext **encrypted to the enclave's public key** (from the
attestation) as `CiphertextForRecipient`, which only the enclave can open (NSM private
key). The host cannot produce a valid attestation, so its `Decrypt` is denied.

## Components

1. **KMS CMK** (symmetric, "morpheus-enclave-master"). Key policy allows `kms:Decrypt`
   for the instance role **only** when
   `kms:RecipientAttestation:ImageSha384` (PCR0) == the deployed EIF's PCR0
   (optionally also PCR1/PCR2). Without the condition match, Decrypt is denied.
2. **Ciphertext key material.** The X25519 keystore's wrap key (or the key material
   directly) re-encrypted under the CMK; the ciphertext is provisioned to the enclave
   (env/keystore — it's ciphertext, safe).
3. **Enclave KMS-decrypt** — two implementation options:
   - **(a) `@aws-sdk/client-kms` + NSM (recommended, fewer moving parts):** the enclave
     generates an attestation with an ephemeral RSA pubkey via `/dev/nsm`, calls
     `Decrypt({ CiphertextBlob, Recipient:{ AttestationDocument, KeyEncryptionAlgorithm:
     'RSAES_OAEP_SHA_256' } })`, and decrypts `CiphertextForRecipient` with the NSM
     private key. Egress via the existing vsock proxy (kms.us-east-1 already allow-listed;
     the SDK fetch-transport fix `a90122b` makes the SDK honor it). Needs the
     `@aws-sdk/client-kms` dep + NSM RSA glue (extend `nsm-attest`).
   - **(b) `kmstool-enclave-cli`** (AWS Nitro SDK, Rust): handles attestation+Decrypt,
     talks to a host `kmstool-instance`/`vsock-proxy`. Needs the tool built into the EIF +
     a host KMS vsock-proxy service. More standard, more infra.
4. **IAM scoping:** remove `secretsmanager:GetSecretValue` for the masters from the
   instance role (so the host can't read them); keep `kms:Decrypt` (gated by the policy).

## Deployment sequence (resolves the PCR chicken-and-egg)

1. **[admin]** Create the CMK; policy grants the instance role `kms:Decrypt` (PCR
   condition added in step 3).
2. Build the EIF with the enclave KMS-decrypt code → record PCR0.
3. **[admin]** Update the key policy: condition `kms:Decrypt` on
   `kms:RecipientAttestation:ImageSha384 = <EIF PCR0>`.
4. Encrypt the key material under the CMK → provision the ciphertext to the enclave.
5. Cutover to the new EIF (auto-rollback) → enclave attests + KMS-decrypts in-TEE →
   validate decrypt works.
6. **[admin]** Remove the SM master access from the instance role.
7. Rotate the X25519 key (host-exposed historically), retaining the old key for
   decrypting payloads already sealed to the old pubkey.

## What I can implement now (no AWS admin)
- The enclave KMS-decrypt module (option a): `@aws-sdk/client-kms` dep + the NSM
  attestation-with-pubkey + `Decrypt`+`Recipient` + CiphertextForRecipient open;
  wire it into `loadStableOracleKeyMaterial` as a new source (before the env-sealed path).
- A mocked unit test (KMS returns a known CiphertextForRecipient → enclave opens it).
- The provisioning change to carry the CMK ciphertext.
This stays dormant until the CMK exists (step 1) + the EIF cutover (step 5).

## Foundation already shipped (this session)
- `a90122b` — enclave AWS SDK egresses via the vsock proxy (so it can reach KMS/SM itself).
- `b0a0cf5` — enclave unseals a ciphertext keystore from env in-TEE (round-trip tested).
KMS attestation replaces the *wrap-key source* (KMS-attested instead of SM-derived);
the in-TEE unseal plumbing is reused.
