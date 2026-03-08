import test from 'node:test';
import assert from 'node:assert/strict';

const originalFetch = global.fetch;
const originalPhalaToken = process.env.PHALA_SHARED_SECRET;
const originalNeoN3Key = process.env.PHALA_NEO_N3_PRIVATE_KEY;
const originalNeoXKey = process.env.PHALA_NEOX_PRIVATE_KEY;
const originalNeoRpc = process.env.NEO_RPC_URL;
const originalNeoXRpc = process.env.NEOX_RPC_URL;
const originalNeoXRpcAlt = process.env.NEO_X_RPC_URL;
const originalEvmRpc = process.env.EVM_RPC_URL;

process.env.PHALA_SHARED_SECRET = 'worker-test-secret';
process.env.PHALA_NEO_N3_PRIVATE_KEY = '1111111111111111111111111111111111111111111111111111111111111111';
process.env.PHALA_NEOX_PRIVATE_KEY = '0x59c6995e998f97a5a0044976f5d7d28f6af5b8b4f3d8f93f2af6d0a2b03f1abb';
process.env.NEO_RPC_URL = 'https://neo-rpc.test';
process.env.NEOX_RPC_URL = '';
process.env.NEO_X_RPC_URL = '';
process.env.EVM_RPC_URL = '';

const { default: handler } = await import('./src/worker.js');

function authHeaders() {
  return {
    authorization: 'Bearer worker-test-secret',
    'content-type': 'application/json',
  };
}

async function encryptForOracle(publicKeyBase64, plaintext) {
  const spki = Buffer.from(publicKeyBase64, 'base64');
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    'spki',
    spki,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt'],
  );
  const encrypted = await globalThis.crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    cryptoKey,
    new TextEncoder().encode(plaintext),
  );
  return Buffer.from(encrypted).toString('base64');
}

test.after(() => {
  global.fetch = originalFetch;
  process.env.PHALA_SHARED_SECRET = originalPhalaToken;
  process.env.PHALA_NEO_N3_PRIVATE_KEY = originalNeoN3Key;
  process.env.PHALA_NEOX_PRIVATE_KEY = originalNeoXKey;
  process.env.NEO_RPC_URL = originalNeoRpc;
  process.env.NEOX_RPC_URL = originalNeoXRpc;
  process.env.NEO_X_RPC_URL = originalNeoXRpcAlt;
  process.env.EVM_RPC_URL = originalEvmRpc;
});

test('health endpoint works without auth', async () => {
  const res = await handler(new Request('http://local/health'));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'ok');
});

test('oracle public key endpoint returns RSA metadata', async () => {
  const res = await handler(new Request('http://local/oracle/public-key', { headers: authHeaders() }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.algorithm, 'RSA-OAEP-SHA256');
  assert.ok(body.public_key);
  assert.ok(body.public_key_pem);
});

test('oracle query supports plain fetch mode', async () => {
  global.fetch = async (url) => {
    assert.equal(url, 'https://api.example.com/plain');
    return new Response(JSON.stringify({ ok: true, value: 7 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const res = await handler(new Request('http://local/oracle/query', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ url: 'https://api.example.com/plain', target_chain: 'neo_n3' }),
  }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.mode, 'fetch');
  assert.equal(body.status_code, 200);
  assert.match(body.body, /"ok":true/);
});

test('oracle smart fetch supports encrypted_payload alias and script_base64', async () => {
  const keyRes = await handler(new Request('http://local/oracle/public-key', { headers: authHeaders() }));
  const keyBody = await keyRes.json();
  const ciphertext = await encryptForOracle(keyBody.public_key, 'secret-token');

  global.fetch = async (url, init) => {
    assert.equal(url, 'https://api.example.com/private');
    assert.equal(init.headers.get('Authorization'), 'Bearer secret-token');
    return new Response(JSON.stringify({ ok: true, age: 82 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const res = await handler(new Request('http://local/oracle/smart-fetch', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      url: 'https://api.example.com/private',
      encrypted_payload: ciphertext,
      script_base64: Buffer.from('function process(data) { return data.age > 80; }').toString('base64'),
      target_chain: 'neo_x',
      target_chain_id: '12227332'
    }),
  }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.mode, 'fetch+compute');
  assert.equal(body.result, true);
  assert.equal(body.target_chain, 'neo_x');
  assert.equal(body.target_chain_id, '12227332');
});

test('compute execute supports builtin heavy functions', async () => {
  const res = await handler(new Request('http://local/compute/execute', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      mode: 'builtin',
      function: 'math.modexp',
      input: { base: '2', exponent: '10', modulus: '17' },
      target_chain: 'neo_n3'
    }),
  }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.mode, 'builtin');
  assert.equal(body.function, 'math.modexp');
  assert.equal(body.result.value, '4');
  assert.ok(body.signature);
});

test('sign-payload supports neo_n3 and neo_x', async () => {
  global.fetch = originalFetch;

  const neoN3Res = await handler(new Request('http://local/sign/payload', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ target_chain: 'neo_n3', message: 'hello neo n3' }),
  }));
  assert.equal(neoN3Res.status, 200);
  const neoN3 = await neoN3Res.json();
  assert.ok(neoN3.signature);
  assert.ok(neoN3.public_key);
  assert.ok(neoN3.address);

  const neoXRes = await handler(new Request('http://local/sign/payload', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ target_chain: 'neo_x', message: 'hello neo x' }),
  }));
  assert.equal(neoXRes.status, 200);
  const neoX = await neoXRes.json();
  assert.ok(neoX.signature);
  assert.ok(neoX.address);
  assert.equal(neoX.mode, 'message');
});

test('relay-transaction signs neo_x tx locally when broadcast is disabled', async () => {
  global.fetch = originalFetch;

  const res = await handler(new Request('http://local/relay/transaction', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      target_chain: 'neo_x',
      broadcast: false,
      transaction: {
        to: '0x1111111111111111111111111111111111111111',
        data: '0x',
        value: '0',
        chain_id: 47763,
        nonce: 1,
        gas_limit: '21000',
        max_fee_per_gas: '1000000000',
        max_priority_fee_per_gas: '100000000'
      }
    }),
  }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.target_chain, 'neo_x');
  assert.ok(body.raw_transaction);
  assert.ok(body.address);
});
