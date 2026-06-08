import test from 'node:test';
import assert from 'node:assert/strict';
import { ethers } from 'ethers';
import {
  buildRevealStatement,
  recoverRevealSigner,
  addressesEqual,
  isRevealTimestampFresh,
  handleMessageReveal,
} from './message-reveal.js';

// Deterministic throwaway test key (not used anywhere live).
const TEST_PK = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const wallet = new ethers.Wallet(TEST_PK);

test('buildRevealStatement is deterministic and lowercases the contract', () => {
  const a = buildRevealStatement(47763, '0xABCdef0000000000000000000000000000000001', '5', 1700000000);
  const b = buildRevealStatement('47763', '0xabcdef0000000000000000000000000000000001', 5, '1700000000');
  assert.equal(a, b);
  assert.ok(a.includes('contract: 0xabcdef0000000000000000000000000000000001'));
  assert.ok(a.includes('message: 5'));
  assert.ok(a.includes('issued: 1700000000'));
});

test('recoverRevealSigner round-trips an EIP-191 signature to the signer', async () => {
  const statement = buildRevealStatement(47763, '0xd1906192c2308ae416acda96238ca846ebb83f15', '7', 1700000000);
  const sig = await wallet.signMessage(statement);
  assert.equal(recoverRevealSigner(statement, sig), wallet.address);
  // tampered statement must NOT recover to the signer
  const tampered = buildRevealStatement(47763, '0xd1906192c2308ae416acda96238ca846ebb83f15', '8', 1700000000);
  assert.notEqual(recoverRevealSigner(tampered, sig), wallet.address);
  // malformed signature returns null rather than throwing
  assert.equal(recoverRevealSigner(statement, '0xdeadbeef'), null);
});

test('addressesEqual compares checksum-insensitively and rejects non-addresses', () => {
  assert.equal(addressesEqual(wallet.address, wallet.address.toLowerCase()), true);
  assert.equal(addressesEqual(wallet.address, '0x0000000000000000000000000000000000000000'), false);
  assert.equal(addressesEqual('', wallet.address), false);
  assert.equal(addressesEqual('not-an-address', 'not-an-address'), false);
});

test('isRevealTimestampFresh enforces the freshness window', () => {
  const now = 1700000000;
  assert.equal(isRevealTimestampFresh(now, now), true);
  assert.equal(isRevealTimestampFresh(now - 300, now), true);
  assert.equal(isRevealTimestampFresh(now + 300, now), true);
  assert.equal(isRevealTimestampFresh(now - 601, now), false);
  assert.equal(isRevealTimestampFresh(now + 601, now), false);
  assert.equal(isRevealTimestampFresh(0, now), false);
});

test('handleMessageReveal rejects malformed requests before any chain access', async () => {
  const now = 1700000000;
  const bad = [
    { chain: 'neo_n3', signature: '0x', messageId: 1, issuedAt: now },
    { chain: 'neox', signature: '0x', messageId: 0, issuedAt: now },
    { chain: 'neox', messageId: 1, issuedAt: now }, // no signature
    { chain: 'neox', signature: 'sig', issuedAt: now }, // no messageId
    { chain: 'neox', signature: 'sig', messageId: 1 }, // no issuedAt
  ];
  for (const payload of bad) {
    const resp = await handleMessageReveal(payload, now);
    assert.equal(resp.status, 400, `expected 400 for ${JSON.stringify(payload)}`);
  }
  // stale timestamp -> 403
  const stale = await handleMessageReveal(
    { chain: 'neox', signature: 'sig', messageId: 1, issuedAt: now - 10_000 },
    now
  );
  assert.equal(stale.status, 403);
});

test('handleMessageReveal returns 503 when the worker is not configured for reveal', async () => {
  // Clear any reveal config so the unconfigured branch is exercised deterministically.
  const saved = {};
  for (const k of ['NEOX_MESSAGE_RPC', 'NEOX_RPC', 'EVM_RPC_URL', 'NEOX_MESSAGE_CONTRACT']) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  try {
    const now = 1700000000;
    const statement = buildRevealStatement(47763, '0xd1906192c2308ae416acda96238ca846ebb83f15', '1', now);
    const sig = await wallet.signMessage(statement);
    const resp = await handleMessageReveal(
      { chain: 'neox', signature: sig, messageId: 1, issuedAt: now },
      now
    );
    assert.equal(resp.status, 503);
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});
