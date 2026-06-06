import test from 'node:test';
import assert from 'node:assert/strict';

const ORIGINALS = {
  CONTRACT_MORPHEUS_ORACLE_HASH: process.env.CONTRACT_MORPHEUS_ORACLE_HASH,
  CONTRACT_MORPHEUS_ORACLE_HASH_MAINNET: process.env.CONTRACT_MORPHEUS_ORACLE_HASH_MAINNET,
  CONTRACT_MORPHEUS_ORACLE_HASH_TESTNET: process.env.CONTRACT_MORPHEUS_ORACLE_HASH_TESTNET,
};

test.afterEach(() => {
  for (const [key, value] of Object.entries(ORIGINALS)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test('relayNeoN3Invocation applies the allowlist for the request network', async () => {
  delete process.env.CONTRACT_MORPHEUS_ORACLE_HASH;
  process.env.CONTRACT_MORPHEUS_ORACLE_HASH_MAINNET = '0x1111111111111111111111111111111111111111';
  process.env.CONTRACT_MORPHEUS_ORACLE_HASH_TESTNET = '0x2222222222222222222222222222222222222222';

  const { relayNeoN3Invocation } = await import(`./neo-n3.js?shared-worker=${Date.now()}`);
  const result = await relayNeoN3Invocation({
    network: 'mainnet',
    contract_hash: '0x1111111111111111111111111111111111111111',
    method: 'fulfillRequest',
    params: [],
  });

  assert.notEqual(result.status, 403);
});
