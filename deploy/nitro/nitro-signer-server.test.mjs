import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SERVER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'nitro-signer-server.mjs');
const TOKEN = 'unit-test-token';

function buildSignRequest(headers) {
  const body = '{}';
  return [
    'POST /sign/payload HTTP/1.1',
    'host: localhost',
    ...headers,
    'content-type: application/json',
    `content-length: ${Buffer.byteLength(body)}`,
    '',
    body,
  ].join('\r\n');
}

function stdioRequest(rawRequest) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SERVER, '--stdio'], {
      env: { ...process.env, NITRO_SIGNER_TOKEN: TOKEN },
      encoding: 'utf8',
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', () => resolve({ stdout, stderr }));
    child.stdin.write(rawRequest);
    child.stdin.end();
  });
}

test('signer rejects a wrong bearer token of the same length', async () => {
  const wrong = 'x'.repeat(TOKEN.length);
  const { stdout } = await stdioRequest(buildSignRequest([`authorization: Bearer ${wrong}`]));
  assert.match(stdout, /^HTTP\/1\.1 401 Unauthorized/);
  assert.match(stdout, /"error":"unauthorized"/);
});

test('signer rejects a wrong token of a different length without crashing', async () => {
  // regression: a bare crypto.timingSafeEqual throws on length mismatch — the
  // length guard must turn this into a clean 401, not a 500
  const { stdout } = await stdioRequest(buildSignRequest([`authorization: Bearer ${TOKEN}-extended`]));
  assert.match(stdout, /^HTTP\/1\.1 401 Unauthorized/);
});

test('signer accepts the trusted bearer token', async () => {
  // auth passes, then payload validation fires — proving the timing-safe
  // comparison still matches the provisioned token exactly
  const { stdout } = await stdioRequest(buildSignRequest([`authorization: Bearer ${TOKEN}`]));
  assert.doesNotMatch(stdout, /^HTTP\/1\.1 401/);
  assert.match(stdout, /data_hex is required/);
});

test('signer accepts the trusted token via the x-nitro-token header', async () => {
  const { stdout } = await stdioRequest(buildSignRequest([`x-nitro-token: ${TOKEN}`]));
  assert.doesNotMatch(stdout, /^HTTP\/1\.1 401/);
  assert.match(stdout, /data_hex is required/);
});

test('signer rejects a request with no token at all', async () => {
  const { stdout } = await stdioRequest(buildSignRequest([]));
  assert.match(stdout, /^HTTP\/1\.1 401 Unauthorized/);
});
