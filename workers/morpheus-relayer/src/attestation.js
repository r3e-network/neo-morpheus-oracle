import crypto from 'node:crypto';
import { wallet as neonWallet } from '@cityofzion/neon-js';

import { trimString } from '@neo-morpheus-oracle/shared/utils';
import { normalizeErrorMessage } from './feed-sync.js';
import { resolvePinnedNeoN3VerifierPublicKey } from './lib/neo-signers.js';

export function normalizePublicKey(value) {
  return trimString(value).replace(/^0x/i, '').toLowerCase();
}

// ---------------------------------------------------------------------------
// Minimal CBOR / COSE_Sign1 decoder (no external deps) — mirrors the encoder/
// decoder in deploy/nitro/enclave-server.mjs. A Nitro NSM attestation document is
// a COSE_Sign1 (CBOR array [protected, unprotected, payload(bstr), signature]),
// possibly wrapped in CBOR tag 18; the payload is a CBOR map with the measured
// `pcrs`, `user_data`, `public_key`, `nonce`. We decode just enough to read those
// committed fields so the relayer can VERIFY (C1) the document binds the digest +
// matches the pinned PCR0 — without bundling a CBOR/COSE library.
// ---------------------------------------------------------------------------
function cborRead(buf, offset) {
  if (offset >= buf.length) throw new Error('cbor: truncated');
  const initial = buf[offset];
  const major = initial >> 5;
  const minor = initial & 0x1f;
  let pos = offset + 1;
  const readUint = (n) => {
    let value = 0n;
    for (let i = 0; i < n; i += 1) {
      if (pos >= buf.length) throw new Error('cbor: truncated uint');
      value = (value << 8n) | BigInt(buf[pos]);
      pos += 1;
    }
    return value;
  };
  let length;
  if (minor < 24) length = BigInt(minor);
  else if (minor === 24) length = readUint(1);
  else if (minor === 25) length = readUint(2);
  else if (minor === 26) length = readUint(4);
  else if (minor === 27) length = readUint(8);
  else throw new Error(`cbor: unsupported minor ${minor}`);

  switch (major) {
    case 0:
      return { value: Number(length), pos };
    case 1:
      return { value: -1 - Number(length), pos };
    case 2:
    case 3: {
      const len = Number(length);
      const slice = buf.subarray(pos, pos + len);
      pos += len;
      return { value: major === 2 ? Buffer.from(slice) : slice.toString('utf8'), pos };
    }
    case 4: {
      const arr = [];
      const len = Number(length);
      for (let i = 0; i < len; i += 1) {
        const item = cborRead(buf, pos);
        arr.push(item.value);
        pos = item.pos;
      }
      return { value: arr, pos };
    }
    case 5: {
      const map = {};
      const len = Number(length);
      for (let i = 0; i < len; i += 1) {
        const key = cborRead(buf, pos);
        pos = key.pos;
        const val = cborRead(buf, pos);
        pos = val.pos;
        const keyName = Buffer.isBuffer(key.value) ? key.value.toString('hex') : String(key.value);
        map[keyName] = val.value;
      }
      return { value: map, pos };
    }
    case 6: {
      const inner = cborRead(buf, pos);
      return { value: inner.value, pos: inner.pos };
    }
    case 7: {
      if (minor === 20) return { value: false, pos };
      if (minor === 21) return { value: true, pos };
      if (minor === 22) return { value: null, pos };
      return { value: null, pos };
    }
    default:
      throw new Error(`cbor: unsupported major ${major}`);
  }
}

function decodeCoseSign1(coseBuffer) {
  const { value: cose } = cborRead(coseBuffer, 0);
  if (!Array.isArray(cose) || cose.length !== 4) {
    throw new Error('cose: not a 4-element COSE_Sign1');
  }
  const [protectedHeaderBytes, , payloadBytes, signature] = cose;
  if (!Buffer.isBuffer(payloadBytes)) throw new Error('cose: payload is not a byte string');
  const { value: payload } = cborRead(payloadBytes, 0);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('cose: payload is not a map');
  }
  return {
    protectedHeaderBytes: Buffer.isBuffer(protectedHeaderBytes)
      ? protectedHeaderBytes
      : Buffer.alloc(0),
    payloadBytes,
    payload,
    signature: Buffer.isBuffer(signature) ? signature : Buffer.alloc(0),
  };
}

// Build the COSE Sig_structure for a COSE_Sign1 (RFC 8152 §4.4):
//   Sig_structure = [ "Signature1", body_protected(bstr), external_aad(bstr ""), payload(bstr) ]
// This is the exact byte string the enclave's ES384 signature is computed over.
function buildCoseSign1SigStructure(protectedHeaderBytes, payloadBytes) {
  return cborEncodeSigStructure([
    'Signature1',
    protectedHeaderBytes,
    Buffer.alloc(0),
    payloadBytes,
  ]);
}

// Minimal deterministic CBOR encoder for the 4-element Sig_structure array (text
// string + three byte strings). Self-contained so no CBOR/COSE library is bundled.
function cborEncodeSigStructure(items) {
  const head = (major, len) => {
    if (len < 24) return Buffer.from([(major << 5) | len]);
    if (len < 256) return Buffer.from([(major << 5) | 24, len]);
    if (len < 65536) return Buffer.from([(major << 5) | 25, (len >> 8) & 0xff, len & 0xff]);
    const b = Buffer.alloc(5);
    b[0] = (major << 5) | 26;
    b.writeUInt32BE(len, 1);
    return b;
  };
  const parts = [head(4, items.length)];
  for (const item of items) {
    if (typeof item === 'string') {
      const b = Buffer.from(item, 'utf8');
      parts.push(head(3, b.length), b);
    } else {
      const b = Buffer.isBuffer(item) ? item : Buffer.from(item || []);
      parts.push(head(2, b.length), b);
    }
  }
  return Buffer.concat(parts);
}

// Convert a 96-byte COSE raw (r||s) ES384 signature into the DER-encoded ECDSA
// signature Node's crypto.verify expects. Returns null if the input is not a
// 96-byte raw signature (e.g. a placeholder), so the caller treats it as
// unverifiable rather than throwing.
function coseEs384SignatureToDer(rawSignature) {
  if (!Buffer.isBuffer(rawSignature) || rawSignature.length !== 96) return null;
  const encodeInt = (bytes) => {
    let i = 0;
    while (i < bytes.length - 1 && bytes[i] === 0) i += 1;
    let trimmed = bytes.subarray(i);
    if (trimmed[0] & 0x80) trimmed = Buffer.concat([Buffer.from([0]), trimmed]);
    return Buffer.concat([Buffer.from([0x02, trimmed.length]), trimmed]);
  };
  const r = encodeInt(rawSignature.subarray(0, 48));
  const s = encodeInt(rawSignature.subarray(48, 96));
  const body = Buffer.concat([r, s]);
  return Buffer.concat([Buffer.from([0x30, body.length]), body]);
}

// The AWS Nitro attestation certificate chain (cabundle + leaf) lives in the COSE
// payload map: `certificate` (leaf, DER bstr) and `cabundle` (array of DER bstr,
// root-first). Return the chain leaf-first as DER buffers, or null when absent.
function extractAttestationCertChain(payload) {
  const leaf = payload.certificate;
  const cabundle = Array.isArray(payload.cabundle) ? payload.cabundle : [];
  if (!Buffer.isBuffer(leaf)) return null;
  const intermediates = cabundle.filter(Buffer.isBuffer);
  return { leaf, intermediates };
}

// Best-effort COSE_Sign1 ES384 signature + certificate-chain verification against a
// pinned AWS Nitro root certificate. Returns one of:
//   { verified: true }                     — signature + chain to the pinned root OK
//   { verified: false, checked: false }    — not checkable (no root pinned / no cert
//                                            / placeholder signature) — caller does
//                                            NOT treat this as attested but does NOT
//                                            hard-fail (backward compatible)
//   throws                                 — a real, checkable signature/chain that
//                                            FAILS verification (forged document)
function verifyCoseSign1Crypto(rootCertPem, cose, payload) {
  if (!trimString(rootCertPem)) return { verified: false, checked: false };
  const chain = extractAttestationCertChain(payload);
  if (!chain) return { verified: false, checked: false };
  const der = coseEs384SignatureToDer(cose.signature);
  if (!der) return { verified: false, checked: false };

  let leafCert;
  let rootCert;
  let intermediateCerts;
  try {
    const { X509Certificate } = crypto;
    leafCert = new X509Certificate(chain.leaf);
    rootCert = new X509Certificate(rootCertPem);
    intermediateCerts = chain.intermediates.map((der509) => new X509Certificate(der509));
  } catch {
    // Malformed certs in a doc we were ASKED to verify (root pinned) is a hard fail.
    throw new Error(
      'invalid signature: enclave attestation certificate chain is malformed — refusing to submit'
    );
  }

  // Chain validation: each cert must be issued by the next; the top must chain to
  // the pinned root. AWS publishes the chain root-first in cabundle, leaf separate.
  const ordered = [leafCert, ...intermediateCerts.slice().reverse()];
  for (let i = 0; i < ordered.length; i += 1) {
    const issuer = ordered[i + 1] || rootCert;
    if (!ordered[i].verify(issuer.publicKey)) {
      throw new Error(
        'invalid signature: enclave attestation certificate chain does not verify to the pinned ' +
          'AWS Nitro root — refusing to submit'
      );
    }
  }
  // The top intermediate (or the leaf, if no intermediates) must chain to the root.
  const topCert = ordered[ordered.length - 1];
  if (topCert !== rootCert && !topCert.verify(rootCert.publicKey)) {
    throw new Error(
      'invalid signature: enclave attestation certificate chain does not verify to the pinned ' +
        'AWS Nitro root — refusing to submit'
    );
  }

  // COSE_Sign1 signature over the Sig_structure using the LEAF cert's P-384 key.
  const sigStructure = buildCoseSign1SigStructure(cose.protectedHeaderBytes, cose.payloadBytes);
  let ok = false;
  try {
    ok = crypto.verify(
      'sha384',
      sigStructure,
      { key: leafCert.publicKey, dsaEncoding: 'der' },
      der
    );
  } catch {
    ok = false;
  }
  if (!ok) {
    throw new Error(
      'invalid signature: enclave attestation COSE_Sign1 ES384 signature does not verify against ' +
        'the leaf certificate — refusing to submit'
    );
  }
  return { verified: true, checked: true };
}

// The PCR0 the live enclave is pinned to. Sourced from MORPHEUS_EXPECTED_PCR0 (or
// config.nitro.expectedPcr0). When unset, PCR0 cannot be asserted — the relayer
// still verifies the digest binding but cannot claim the document came from the
// expected measured image, so trust is downgraded. Lowercase hex, no 0x.
export function resolveExpectedPcr0(config) {
  return normalizePublicKey(
    trimString(config?.nitro?.expectedPcr0 || '') ||
      trimString(process.env.MORPHEUS_EXPECTED_PCR0 || '')
  );
}

// Whether the enclave signature cross-check (digest-sig) is enabled. Opt-in via
// config.nitro.verifyEnclaveSignature OR MORPHEUS_RELAYER_VERIFY_ENCLAVE_SIGNATURE
// (read directly so it is operable without a config.js change). Default OFF so the
// current deployment (which has not pinned strict verification) keeps fulfilling.
export function enclaveSignatureVerificationEnabled(config) {
  if (config?.nitro?.verifyEnclaveSignature) return true;
  const raw = trimString(process.env.MORPHEUS_RELAYER_VERIFY_ENCLAVE_SIGNATURE || '').toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

/**
 * Verify the enclave attestation document (C1) against the relayer's INDEPENDENTLY
 * recomputed fulfillment digest. Returns { attested, reason, pcr0 }:
 *   - attested true  => the document proves the result was produced inside the
 *     measured enclave (user_data == sha256(localDigest) AND, when a PCR0 is
 *     pinned, the document's PCR0 matches it).
 *   - attested false => attestation absent or unprovable; the caller MUST NOT label
 *     the result enclave-attested (it downgrades trust_tier). `reason` explains why.
 *
 * Backward-compatible: when no attestation doc is present (today's enclave images
 * pre-cutover) this returns attested:false WITHOUT throwing, so the lane keeps
 * fulfilling. A doc that IS present but binds the WRONG digest (or wrong PCR0 when
 * one is pinned) is a HARD failure — the caller treats it like a digest mismatch
 * and refuses to submit.
 */
// Pinned AWS Nitro attestation ROOT certificate (PEM). When set, the relayer
// best-effort verifies the COSE_Sign1 ES384 signature + the document's certificate
// chain up to this root. Sourced from config.nitro.nitroRootCertPem or
// MORPHEUS_NITRO_ROOT_CERT_PEM. Unset = crypto verification skipped (binding+PCR0
// still enforced) so pre-cutover deployments keep fulfilling.
export function resolveNitroRootCertPem(config) {
  return (
    trimString(config?.nitro?.nitroRootCertPem || '') ||
    trimString(process.env.MORPHEUS_NITRO_ROOT_CERT_PEM || '')
  );
}

// Maximum accepted age (ms) of an attestation document's echoed timestamp. 0 (the
// default) disables the timestamp-age gate; the nonce-echo binding is the primary
// anti-replay control. Sourced from config.nitro.attestationMaxAgeMs or
// MORPHEUS_ATTESTATION_MAX_AGE_MS.
export function resolveAttestationMaxAgeMs(config) {
  const fromConfig = Number(config?.nitro?.attestationMaxAgeMs);
  if (Number.isFinite(fromConfig) && fromConfig > 0) return fromConfig;
  const fromEnv = Number(process.env.MORPHEUS_ATTESTATION_MAX_AGE_MS || 0);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : 0;
}

export function verifyEnclaveAttestation(config, body, localDigestHex, options = {}) {
  const docBase64 = trimString(body?.attestation_doc_base64 || '');
  if (!docBase64) {
    return { attested: false, reason: 'no attestation document', pcr0: '' };
  }
  let cose;
  let payload;
  try {
    cose = decodeCoseSign1(Buffer.from(docBase64, 'base64'));
    payload = cose.payload;
  } catch (error) {
    return {
      attested: false,
      reason: `attestation parse failed: ${normalizeErrorMessage(error)}`,
      pcr0: '',
    };
  }
  // user_data MUST commit to sha256(the relayer-recomputed digest bytes). A doc that
  // commits to a DIFFERENT digest is an active attempt to attest a result the relayer
  // did not compute — treat it as a hard failure (throw), not a downgrade.
  const userData = Buffer.isBuffer(payload.user_data)
    ? payload.user_data.toString('hex')
    : normalizePublicKey(payload.user_data || '');
  const expectedUserData = crypto
    .createHash('sha256')
    .update(Buffer.from(localDigestHex, 'hex'))
    .digest('hex');
  if (userData && userData !== expectedUserData) {
    throw new Error(
      'invalid signature: enclave attestation user_data does not bind the fulfillment digest ' +
        `(doc=${userData} expected=${expectedUserData}) — refusing to submit`
    );
  }
  if (!userData) {
    return { attested: false, reason: 'attestation document has no user_data binding', pcr0: '' };
  }

  // FRESHNESS / ANTI-REPLAY (a): when the relayer supplied a per-request nonce AND the
  // document carries a nonce, the document MUST echo that exact nonce. A
  // captured-but-genuine document for the same digest carries a DIFFERENT (older)
  // nonce, so a mismatch is a replay attempt — hard fail. Backward compatibility: a
  // pre-cutover enclave image that does NOT echo a nonce leaves the doc nonce empty;
  // we cannot prove freshness then, so the nonce-echo gate stays inert (the
  // digest+PCR0 binding below still applies). Once the enclave echoes nonces, a
  // replayed doc (wrong nonce) is rejected.
  const expectedNonce = normalizePublicKey(options.expectedNonce || '');
  const docNonce = Buffer.isBuffer(payload.nonce)
    ? payload.nonce.toString('hex')
    : normalizePublicKey(payload.nonce || '');
  if (expectedNonce && docNonce && docNonce !== expectedNonce) {
    throw new Error(
      'invalid signature: enclave attestation nonce does not echo the relayer-supplied nonce ' +
        `(doc=${docNonce} expected=${expectedNonce}) — refusing to submit (possible replay)`
    );
  }

  // FRESHNESS / ANTI-REPLAY (a, timestamp): when a max-age is configured AND the
  // document carries a timestamp, reject a document whose timestamp is older than the
  // window (stale/replayed). NSM timestamps are epoch milliseconds. A future-dated
  // doc beyond a small skew is also rejected. No timestamp / no max-age => inert.
  const maxAgeMs = resolveAttestationMaxAgeMs(config);
  if (maxAgeMs > 0) {
    const docTimestampMs = Number(payload.timestamp);
    if (Number.isFinite(docTimestampMs) && docTimestampMs > 0) {
      const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
      const ageMs = now - docTimestampMs;
      const FUTURE_SKEW_MS = 60_000;
      if (ageMs > maxAgeMs || ageMs < -FUTURE_SKEW_MS) {
        throw new Error(
          'invalid signature: enclave attestation timestamp is outside the freshness window ' +
            `(age_ms=${ageMs} max_ms=${maxAgeMs}) — refusing to submit (possible replay)`
        );
      }
    }
  }

  // COSE_Sign1 signature + certificate-chain verification (b): best-effort. When a
  // pinned AWS Nitro root cert is configured AND the document carries a real
  // certificate chain + a 96-byte ES384 signature, verify the COSE_Sign1 signature
  // and the chain up to the pinned root. A document that FAILS this crypto check is
  // NOT attested — it is a forged/tampered structure and a hard failure (throw). When
  // no root is pinned / no cert chain present / placeholder signature, the check is a
  // no-op (binding + PCR0 still enforced below) so pre-cutover deployments keep
  // fulfilling.
  const cryptoResult = verifyCoseSign1Crypto(resolveNitroRootCertPem(config), cose, payload);

  // PCR0 binding: the document must come from the pinned measured image. When a
  // PCR0 is configured we ASSERT it (a mismatch is a hard failure — wrong/forged
  // image). When none is configured we cannot prove the image, so we do not claim
  // enclave-attested (downgrade) but keep submitting.
  const pcrs = payload.pcrs && typeof payload.pcrs === 'object' ? payload.pcrs : {};
  const docPcr0 = Buffer.isBuffer(pcrs['0'])
    ? pcrs['0'].toString('hex')
    : normalizePublicKey(pcrs['0'] || pcrs.pcr0 || '');
  const expectedPcr0 = resolveExpectedPcr0(config);
  if (expectedPcr0) {
    if (!docPcr0 || docPcr0 !== expectedPcr0) {
      throw new Error(
        'invalid signature: enclave attestation PCR0 does not match the pinned measurement ' +
          `(doc=${docPcr0 || 'missing'} expected=${expectedPcr0}) — refusing to submit`
      );
    }
    return {
      attested: true,
      reason: cryptoResult.verified
        ? 'attested (digest + PCR0 + COSE signature/chain verified)'
        : 'attested (digest + PCR0 verified)',
      pcr0: docPcr0,
      cose_verified: Boolean(cryptoResult.verified),
    };
  }
  // Digest binding verified, but PCR0 not pinned -> cannot prove the measured image.
  return {
    attested: false,
    reason: 'attestation digest verified but no MORPHEUS_EXPECTED_PCR0 pinned',
    pcr0: docPcr0,
    cose_verified: Boolean(cryptoResult.verified),
  };
}

// Verify the enclave's secp256r1 signature over the relayer-recomputed digest using
// the on-chain-pinned oracle_verifier public key (the digest-sig cross-check). Only
// runs for neo_n3/legacy when a pinned verifier pubkey is configured; otherwise it
// is a no-op (returns {checked:false}) so deployments that have not pinned a verifier
// key keep fulfilling. A returned public_key that differs from the pinned key, or a
// signature that does NOT verify against the pinned key, is a HARD failure (throws).
export function verifyEnclaveSignatureAgainstPinnedVerifier(config, chain, body, localDigestHex) {
  if (chain !== 'neo_n3' && chain !== 'legacy') return { verified: false, checked: false };
  let pinned;
  try {
    pinned = normalizePublicKey(resolvePinnedNeoN3VerifierPublicKey(config.network, process.env));
  } catch {
    pinned = '';
  }
  if (!pinned) return { verified: false, checked: false };
  const returnedKey = normalizePublicKey(body?.public_key || '');
  // The enclave must sign with the pinned verifier key (the only key the on-chain
  // contract accepts). A different key would be rejected on-chain anyway; flag it.
  if (returnedKey && returnedKey !== pinned) {
    throw new Error(
      `verifier rejected signature: enclave public_key ${returnedKey} != pinned oracle_verifier ${pinned}`
    );
  }
  const signature = trimString(body?.signature || '');
  let ok = false;
  try {
    ok = neonWallet.verify(localDigestHex, signature, pinned);
  } catch {
    ok = false;
  }
  if (!ok) {
    throw new Error(
      'invalid signature: enclave signature does not verify against the pinned oracle_verifier ' +
        'public key over the recomputed digest — refusing to submit'
    );
  }
  return { verified: true, checked: true };
}
