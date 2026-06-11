import test from 'node:test';
import assert from 'node:assert/strict';
import { wallet as neonWallet } from '@cityofzion/neon-js';

import { buildSignAndBroadcastNeoN3Tx } from './neo-n3.js';

// Deterministic throwaway test key (not used anywhere live).
const TEST_PK = '59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const TEST_SCRIPT = '51';

const baseConfig = {
  neo_n3: {
    rpcUrl: 'https://neo-rpc.test',
    networkMagic: 894710606,
  },
};

function stubNeoRpc(handlers, calls) {
  return async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ method: body.method, params: body.params });
    const handler = handlers[body.method];
    if (!handler) throw new Error(`unexpected RPC method ${body.method}`);
    const result = typeof handler === 'function' ? handler(body.params) : handler;
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ jsonrpc: '2.0', id: 1, result }),
    };
  };
}

test('buildSignAndBroadcastNeoN3Tx builds, fees, double-signs, and broadcasts a local-signer tx', async () => {
  const account = new neonWallet.Account(TEST_PK);
  const calls = [];
  let signCalls = 0;
  const originalFetch = global.fetch;
  try {
    global.fetch = stubNeoRpc(
      {
        getblockcount: 100,
        invokescript: { state: 'HALT', gasconsumed: '1000000' },
        calculatenetworkfee: { networkfee: '345000' },
        sendrawtransaction: { hash: '0xabc' },
      },
      calls
    );

    const { txHash, signedBase64, transaction } = await buildSignAndBroadcastNeoN3Tx(
      baseConfig,
      TEST_SCRIPT,
      {
        scriptHash: account.scriptHash,
        sign: (tx) => {
          signCalls += 1;
          tx.witnesses = [];
          tx.sign(account, baseConfig.neo_n3.networkMagic);
        },
      },
      { label: 'Neo N3 test transfer' }
    );

    assert.match(txHash, /^0x[0-9a-f]{64}$/);
    assert.equal(transaction.validUntilBlock, 220);
    // systemFee = gasconsumed + 0.001 GAS padding (no headroom by default).
    assert.equal(transaction.systemFee.toString(), '1100000');
    // networkFee = calculatenetworkfee + 0.001 GAS padding.
    assert.equal(transaction.networkFee.toString(), '445000');
    // Signed once for fee sizing, once for the final witness.
    assert.equal(signCalls, 2);
    assert.deepEqual(
      calls.map((entry) => entry.method),
      ['getblockcount', 'invokescript', 'calculatenetworkfee', 'sendrawtransaction']
    );
    assert.deepEqual(calls[3].params, [signedBase64]);
  } finally {
    global.fetch = originalFetch;
  }
});

test('buildSignAndBroadcastNeoN3Tx applies system-fee headroom and runs the fee-balance hook before the final sign', async () => {
  const account = new neonWallet.Account(TEST_PK);
  const calls = [];
  const feeBalanceCalls = [];
  let signCalls = 0;
  let verifyWitnessCalls = 0;
  const originalFetch = global.fetch;
  try {
    global.fetch = stubNeoRpc(
      {
        getblockcount: 100,
        invokescript: { state: 'HALT', gasconsumed: '1000000' },
        calculatenetworkfee: { networkfee: '345000' },
        sendrawtransaction: { hash: '0xabc' },
      },
      calls
    );

    const { transaction } = await buildSignAndBroadcastNeoN3Tx(
      baseConfig,
      TEST_SCRIPT,
      {
        scriptHash: account.scriptHash,
        sign: (tx) => {
          signCalls += 1;
          tx.witnesses = [];
          tx.sign(account, baseConfig.neo_n3.networkMagic);
        },
        verifyWitness: () => {
          verifyWitnessCalls += 1;
          assert.equal(signCalls, 2);
        },
      },
      {
        systemFeeHeadroom: true,
        ensureFeeBalance: (requiredFee) => {
          feeBalanceCalls.push({ requiredFee, signCallsAtCheck: signCalls });
        },
        buildTestInvokeFaultError: (exception) => exception || 'unused fault message',
      }
    );

    // systemFee = gasconsumed + 20% headroom + 0.001 GAS padding.
    assert.equal(transaction.systemFee.toString(), '1300000');
    assert.equal(transaction.networkFee.toString(), '445000');
    // The hook sees the full fee bill (system + raw network fee + padding)
    // and runs after the fee-sizing signature but before the final one.
    assert.deepEqual(feeBalanceCalls, [{ requiredFee: 1745000n, signCallsAtCheck: 1 }]);
    assert.equal(signCalls, 2);
    assert.equal(verifyWitnessCalls, 1);
  } finally {
    global.fetch = originalFetch;
  }
});

test('buildSignAndBroadcastNeoN3Tx fails closed on a FAULTing test invoke without signing or broadcasting', async () => {
  const account = new neonWallet.Account(TEST_PK);
  const calls = [];
  let signCalls = 0;
  const originalFetch = global.fetch;
  try {
    global.fetch = stubNeoRpc(
      {
        getblockcount: 100,
        invokescript: { state: 'FAULT', exception: 'boom' },
      },
      calls
    );

    await assert.rejects(
      buildSignAndBroadcastNeoN3Tx(
        baseConfig,
        TEST_SCRIPT,
        {
          scriptHash: account.scriptHash,
          sign: () => {
            signCalls += 1;
          },
        },
        { label: 'Neo N3 updater fee top-up' }
      ),
      { message: 'Neo N3 updater fee top-up test invoke faulted: boom' }
    );

    assert.equal(signCalls, 0);
    assert.ok(!calls.some((entry) => entry.method === 'sendrawtransaction'));
  } finally {
    global.fetch = originalFetch;
  }
});

test('buildSignAndBroadcastNeoN3Tx lets call sites shape the FAULT error message', async () => {
  const account = new neonWallet.Account(TEST_PK);
  const originalFetch = global.fetch;
  try {
    global.fetch = stubNeoRpc(
      {
        getblockcount: 100,
        invokescript: { state: 'FAULT', exception: 'request fee not paid' },
      },
      []
    );

    await assert.rejects(
      buildSignAndBroadcastNeoN3Tx(
        baseConfig,
        TEST_SCRIPT,
        { scriptHash: account.scriptHash, sign: () => {} },
        {
          buildTestInvokeFaultError: (exception) =>
            exception || 'Neo N3 automation queue test invoke faulted for 0xrequester',
        }
      ),
      { message: 'request fee not paid' }
    );
  } finally {
    global.fetch = originalFetch;
  }
});
