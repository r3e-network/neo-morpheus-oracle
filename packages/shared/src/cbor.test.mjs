import test from 'node:test';
import assert from 'node:assert/strict';
import { cborRead, decodeCoseSign1, decodeCoseSign1Payload } from './cbor.js';

const B = (...bytes) => Buffer.from(bytes);
const decode = (buf) => cborRead(buf, 0).value;

// ── definite vs indefinite must decode identically (the core fix) ────────────
// Before this shared codec, the relayer threw "unsupported minor 31" on the
// indefinite forms and the enclave decoded them to empty containers.

test('definite and indefinite maps decode identically', () => {
  const definite = B(0xa1, 0x61, 0x61, 0x01); // {a: 1}
  const indefinite = B(0xbf, 0x61, 0x61, 0x01, 0xff); // {_ a: 1 } (0xbf .. 0xff)
  assert.deepEqual(decode(definite), { a: 1 });
  assert.deepEqual(decode(indefinite), { a: 1 });
  assert.deepEqual(decode(indefinite), decode(definite));
});

test('definite and indefinite arrays decode identically', () => {
  const definite = B(0x83, 0x01, 0x02, 0x03); // [1,2,3]
  const indefinite = B(0x9f, 0x01, 0x02, 0x03, 0xff); // [_ 1,2,3]
  assert.deepEqual(decode(definite), [1, 2, 3]);
  assert.deepEqual(decode(indefinite), [1, 2, 3]);
});

test('definite and indefinite byte strings decode identically (chunks concatenated)', () => {
  const definite = B(0x45, 0x01, 0x02, 0x03, 0x04, 0x05); // h'0102030405'
  // indefinite: two chunks h'0102' + h'030405'
  const indefinite = B(0x5f, 0x42, 0x01, 0x02, 0x43, 0x03, 0x04, 0x05, 0xff);
  assert.deepEqual(decode(definite), B(0x01, 0x02, 0x03, 0x04, 0x05));
  assert.deepEqual(decode(indefinite), B(0x01, 0x02, 0x03, 0x04, 0x05));
});

test('indefinite text string concatenates chunks', () => {
  // (_ "ab", "c") => "abc"
  const indefinite = B(0x7f, 0x62, 0x61, 0x62, 0x61, 0x63, 0xff);
  assert.equal(decode(indefinite), 'abc');
});

// ── COSE_Sign1 decoding ──────────────────────────────────────────────────────

test('decodeCoseSign1 extracts the four elements and the raw payload bytes', () => {
  // [ h'' (protected), {} (unprotected), h'A1616101' (payload = {a:1}), h'' (sig) ]
  const cose = B(0x84, 0x40, 0xa0, 0x44, 0xa1, 0x61, 0x61, 0x01, 0x40);
  const decoded = decodeCoseSign1(cose);
  assert.deepEqual(decoded.protectedHeaderBytes, Buffer.alloc(0));
  // The raw payload byte string must be preserved exactly — ES384 verification
  // recomputes the Sig_structure over these bytes, so they cannot be re-encoded.
  assert.deepEqual(decoded.payloadBytes, B(0xa1, 0x61, 0x61, 0x01));
  assert.deepEqual(decoded.payload, { a: 1 });
  assert.deepEqual(decoded.signature, Buffer.alloc(0));
});

test('decodeCoseSign1Payload returns the same map decodeCoseSign1 does', () => {
  const cose = B(0x84, 0x40, 0xa0, 0x44, 0xa1, 0x61, 0x61, 0x01, 0x40);
  assert.deepEqual(decodeCoseSign1Payload(cose), { a: 1 });
});

test('COSE_Sign1 with an INDEFINITE-length payload map decodes correctly (the bug)', () => {
  // payload bstr wraps an indefinite map {_ a:1}: 0xBF 61 61 01 0xFF (5 bytes).
  // Previously: relayer threw on 0xBF; enclave produced {}. Now both read {a:1}.
  const cose = B(0x84, 0x40, 0xa0, 0x45, 0xbf, 0x61, 0x61, 0x01, 0xff, 0x40);
  assert.deepEqual(decodeCoseSign1Payload(cose), { a: 1 });
});

test('attestation-shaped payload with indefinite pcrs map and byte fields', () => {
  // payload = { "pcrs": {_ 0: h'BB' }, "x": h'AA' }
  // "pcrs" = 0x64 70 63 72 73 ; indefinite map 0xBF 00 41 BB 0xFF ; "x"=0x61 78 ; h'AA'=0x41 AA
  const payloadInner = B(
    0xa2,
    0x64,
    0x70,
    0x63,
    0x72,
    0x73, // "pcrs"
    0xbf,
    0x00,
    0x41,
    0xbb,
    0xff, // {_ 0: h'BB' }
    0x61,
    0x78, // "x"
    0x41,
    0xaa // h'AA'
  );
  const cose = Buffer.concat([
    B(0x84, 0x40, 0xa0),
    B(0x40 | payloadInner.length),
    payloadInner,
    B(0x40),
  ]);
  const payload = decodeCoseSign1Payload(cose);
  assert.deepEqual(payload.pcrs, { 0: B(0xbb) });
  assert.deepEqual(payload.x, B(0xaa));
});

// ── structural guards preserved ──────────────────────────────────────────────

test('rejects a non-4-element COSE_Sign1', () => {
  assert.throws(() => decodeCoseSign1(B(0x83, 0x40, 0xa0, 0x40)), /4-element COSE_Sign1/);
});

test('rejects a payload that is not a byte string', () => {
  // [ h'', {}, 1, h'' ] — payload is uint, not bstr
  assert.throws(() => decodeCoseSign1(B(0x84, 0x40, 0xa0, 0x01, 0x40)), /not a byte string/);
});

test('still rejects truly reserved minors (28-30) rather than silently accepting', () => {
  assert.throws(() => decode(B(0x1c)), /unsupported minor 28/);
});

test('round-trips uints across the 1/2/4-byte length encodings', () => {
  assert.equal(decode(B(0x18, 0x64)), 100); // uint8 100
  assert.equal(decode(B(0x19, 0x01, 0x00)), 256); // uint16 256
  assert.equal(decode(B(0x1a, 0x00, 0x01, 0x00, 0x00)), 65536); // uint32 65536
});
