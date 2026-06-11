import test from 'node:test';
import assert from 'node:assert/strict';
import { wallet as neonWallet } from '@cityofzion/neon-js';

import { buildSignAndBroadcastNeoN3Tx, scanNeoN3OracleRequestsById } from './neo-n3.js';

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

// ===================================================================
// scanNeoN3OracleRequestsById — batched-scan equivalence (OR-W2-04)
// ===================================================================

function byteString(text) {
  return { type: 'ByteString', value: Buffer.from(text, 'utf8').toString('base64') };
}

function integerItem(value) {
  return { type: 'Integer', value: String(value) };
}

// 14-field kernel getRequest record: [id, appId, moduleId, operation, payload,
// requester, sponsor, callbackContract, callbackMethod, createdAtMs,
// fulfilledAtMs, status, resultText, errorText].
function kernelRequestRecord(requestId, { fulfilled = false } = {}) {
  return {
    type: 'Array',
    value: [
      integerItem(requestId),
      byteString('miniapp-os'),
      byteString('oracle.fetch'),
      byteString('privacy_oracle'),
      byteString('{"url":"https://example.test"}'),
      byteString('NScanner1111111111111111111111111'),
      byteString(''),
      byteString('0x0123456789012345678901234567890101234567'),
      byteString('onOracleResult'),
      integerItem(1700000000000),
      integerItem(fulfilled ? 1700000001000 : 0),
      integerItem(fulfilled ? 2 : 1),
      byteString(''),
      byteString(''),
    ],
  };
}

function emptyKernelRequestRecord() {
  return {
    type: 'Array',
    value: Array.from({ length: 14 }, (_, index) =>
      index === 0 || index === 9 || index === 10 ? integerItem(0) : byteString('')
    ),
  };
}

function stubGetRequestRpc(recordsById, calls) {
  return stubNeoRpc(
    {
      invokefunction: (params) => {
        const requestId = Number(params?.[2]?.[0]?.value || 0);
        const entry = recordsById[requestId];
        if (entry === 'FAULT') {
          return { state: 'FAULT', exception: `boom for ${requestId}`, stack: [] };
        }
        return { state: 'HALT', stack: [entry || emptyKernelRequestRecord()] };
      },
    },
    calls
  );
}

const scanConfig = (concurrency) => ({
  concurrency,
  neo_n3: {
    rpcUrl: 'https://neo-rpc.test',
    oracleContract: '0xaabbccddeeff00112233445566778899aabbccdd',
    networkMagic: 894710606,
  },
});

test('scanNeoN3OracleRequestsById batched scan is equivalent to the sequential path', async () => {
  // Equivalence gate for the bounded-concurrency scan: the same stubbed RPC is
  // scanned sequentially (concurrency 1) and concurrently; both must produce
  // identical, ascending-id pending-only event lists.
  const recordsById = {
    1: kernelRequestRecord(1),
    2: kernelRequestRecord(2, { fulfilled: true }),
    3: kernelRequestRecord(3),
    4: emptyKernelRequestRecord(),
    5: kernelRequestRecord(5),
  };
  const originalFetch = global.fetch;
  try {
    const sequentialCalls = [];
    global.fetch = stubGetRequestRpc(recordsById, sequentialCalls);
    const sequential = await scanNeoN3OracleRequestsById(scanConfig(1), 1, 5);

    const batchedCalls = [];
    global.fetch = stubGetRequestRpc(recordsById, batchedCalls);
    const batched = await scanNeoN3OracleRequestsById(scanConfig(4), 1, 5);

    assert.deepEqual(batched, sequential);
    assert.deepEqual(
      batched.map((event) => event.requestId),
      ['1', '3', '5']
    );
    // Both paths issue exactly one getRequest per id in the range.
    assert.equal(sequentialCalls.length, 5);
    assert.equal(batchedCalls.length, 5);
  } finally {
    global.fetch = originalFetch;
  }
});

test('scanNeoN3OracleRequestsById still aborts the scan on a FAULTed getRequest', async () => {
  const recordsById = {
    1: kernelRequestRecord(1),
    2: 'FAULT',
    3: kernelRequestRecord(3),
  };
  const originalFetch = global.fetch;
  try {
    global.fetch = stubGetRequestRpc(recordsById, []);
    await assert.rejects(scanNeoN3OracleRequestsById(scanConfig(4), 1, 3), /boom for 2/);
  } finally {
    global.fetch = originalFetch;
  }
});
