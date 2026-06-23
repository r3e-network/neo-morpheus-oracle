// Minimal, dependency-free CBOR / COSE_Sign1 decoder shared by the enclave server
// (which PRODUCES Nitro NSM attestation documents) and the relayer (which VERIFIES
// them). Keeping ONE decoder on both sides is a correctness requirement: previously
// each had its own copy that disagreed on indefinite-length CBOR (RFC 8949 §3.2) —
// the relayer threw `unsupported minor 31` (rejecting a legitimately-attested doc),
// while the enclave set length = -1 and silently produced EMPTY strings/arrays/maps.
// Either way an indefinite-length-encoded attestation was mis-handled. This module
// decodes both definite and indefinite lengths correctly so producer and verifier
// agree, and a shared fixture test pins that agreement.
//
// We decode just enough CBOR to read the COSE_Sign1 structure and the attestation
// payload map (pcrs, user_data, public_key, nonce) — no external CBOR/COSE library.

// Sentinel returned for the CBOR "break" stop code (0xff, major 7 / minor 31).
// It terminates an indefinite-length string/array/map. Not a valid data item, so
// it can never collide with a decoded value.
const BREAK = Symbol('cbor-break');

/**
 * Decode a single CBOR data item starting at `offset`.
 * @param {Buffer} buf
 * @param {number} offset
 * @returns {{ value: unknown, pos: number }} decoded value and the position after it
 */
export function cborRead(buf, offset) {
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

  let length = 0n;
  let indefinite = false;
  if (minor < 24) length = BigInt(minor);
  else if (minor === 24) length = readUint(1);
  else if (minor === 25) length = readUint(2);
  else if (minor === 26) length = readUint(4);
  else if (minor === 27) length = readUint(8);
  else if (minor === 31)
    indefinite = true; // indefinite length, or the break stop code
  else throw new Error(`cbor: unsupported minor ${minor}`);

  switch (major) {
    case 0: // unsigned int
      if (indefinite) throw new Error('cbor: indefinite length invalid for uint');
      return { value: Number(length), pos };
    case 1: // negative int
      if (indefinite) throw new Error('cbor: indefinite length invalid for negative int');
      return { value: -1 - Number(length), pos };
    case 2: // byte string
    case 3: {
      // text string
      if (indefinite) {
        // Concatenation of definite-length chunks of the same major type until break.
        const chunks = [];
        for (;;) {
          const item = cborRead(buf, pos);
          pos = item.pos;
          if (item.value === BREAK) break;
          chunks.push(Buffer.isBuffer(item.value) ? item.value : Buffer.from(item.value, 'utf8'));
        }
        const joined = Buffer.concat(chunks);
        return { value: major === 2 ? joined : joined.toString('utf8'), pos };
      }
      const len = Number(length);
      const slice = buf.subarray(pos, pos + len);
      pos += len;
      return { value: major === 2 ? Buffer.from(slice) : slice.toString('utf8'), pos };
    }
    case 4: {
      // array
      const arr = [];
      if (indefinite) {
        for (;;) {
          const item = cborRead(buf, pos);
          pos = item.pos;
          if (item.value === BREAK) break;
          arr.push(item.value);
        }
        return { value: arr, pos };
      }
      const len = Number(length);
      for (let i = 0; i < len; i += 1) {
        const item = cborRead(buf, pos);
        arr.push(item.value);
        pos = item.pos;
      }
      return { value: arr, pos };
    }
    case 5: {
      // map
      const map = {};
      const addPair = () => {
        const key = cborRead(buf, pos);
        pos = key.pos;
        if (key.value === BREAK) return false;
        const val = cborRead(buf, pos);
        pos = val.pos;
        const keyName = Buffer.isBuffer(key.value) ? key.value.toString('hex') : String(key.value);
        map[keyName] = val.value;
        return true;
      };
      if (indefinite) {
        while (addPair());
        return { value: map, pos };
      }
      const len = Number(length);
      for (let i = 0; i < len; i += 1) addPair();
      return { value: map, pos };
    }
    case 6: {
      // tag — decode + return the tagged value (the tag number is not needed here).
      if (indefinite) throw new Error('cbor: indefinite length invalid for tag');
      const inner = cborRead(buf, pos);
      return { value: inner.value, pos: inner.pos };
    }
    case 7: {
      // simple/float/break
      if (minor === 31) return { value: BREAK, pos }; // break stop code
      if (minor === 20) return { value: false, pos };
      if (minor === 21) return { value: true, pos };
      if (minor === 22) return { value: null, pos };
      if (minor === 23) return { value: undefined, pos };
      // floats (25/26/27) and 1-byte simple (24): bytes already consumed above; we
      // do not need their numeric value, so surface null.
      return { value: null, pos };
    }
    default:
      throw new Error(`cbor: unsupported major ${major}`);
  }
}

/**
 * Decode a COSE_Sign1 buffer into its four elements plus the decoded payload map.
 * Used by the relayer, which needs the raw protected-header and payload byte strings
 * to reconstruct the Sig_structure for ES384 signature verification.
 * @param {Buffer} coseBuffer
 */
export function decodeCoseSign1(coseBuffer) {
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

/**
 * Decode a COSE_Sign1 buffer and return only its payload map (attestation fields:
 * pcrs, user_data, public_key, nonce, ...). Used by the enclave server, which only
 * needs to read the committed fields.
 * @param {Buffer} coseBuffer
 */
export function decodeCoseSign1Payload(coseBuffer) {
  return decodeCoseSign1(coseBuffer).payload;
}
