import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, mkdtempSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const MONITOR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'feed-monitor.mjs');

function feedRecordStruct({ roundId, price, timestamp }) {
  return {
    type: 'Struct',
    value: [
      { type: 'ByteString', value: Buffer.from('TWELVEDATA:NEO-USD').toString('base64') },
      { type: 'Integer', value: String(roundId) },
      { type: 'Integer', value: String(price) },
      { type: 'Integer', value: String(timestamp) },
      { type: 'ByteString', value: '' },
      { type: 'Integer', value: '0' },
    ],
  };
}

function startMockRpc({ roundId, timestamp, gasBalance }) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk) => { raw += chunk; });
      req.on('end', () => {
        const body = JSON.parse(raw);
        const operation = body.params && body.params[1];
        const result =
          operation === 'getLatest'
            ? { state: 'HALT', stack: [feedRecordStruct({ roundId, price: 5_250_000, timestamp })] }
            : { state: 'HALT', stack: [{ type: 'Integer', value: String(gasBalance) }] };
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }));
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function runMonitor(rpcUrl, statusFile) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [MONITOR], {
      env: {
        ...process.env,
        FEED_RPCS: rpcUrl,
        MONITOR_LOG: path.join(path.dirname(statusFile), 'feed-monitor.log'),
        MONITOR_STATUS: statusFile,
      },
      encoding: 'utf8',
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

test('monitor measures age from the Timestamp field, not RoundId', async () => {
  const now = Math.floor(Date.now() / 1000);
  // A counter-style roundId (42) with a fresh timestamp must NOT alert: the
  // FeedRecord struct is [Pair, RoundId, Price, Timestamp, ...], and only the
  // current pusher happens to write roundId ≈ unix time.
  const server = await startMockRpc({ roundId: 42, timestamp: now - 60, gasBalance: 100e8 });
  const { port } = server.address();
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'feed-monitor-'));
  const statusFile = path.join(tmp, 'feed-status.json');
  try {
    const result = await runMonitor(`http://127.0.0.1:${port}`, statusFile);
    assert.equal(result.code, 0, `expected ok exit, got ${result.code}: ${result.stdout}${result.stderr}`);
    assert.match(result.stdout, /ok feed_age=1min/);
    const status = JSON.parse(readFileSync(statusFile, 'utf8'));
    assert.equal(status.ok, true);
    assert.equal(status.feed_age_min, 1);
  } finally {
    server.close();
  }
});

test('monitor alerts on a genuinely stale timestamp even when roundId looks fresh', async () => {
  const now = Math.floor(Date.now() / 1000);
  const server = await startMockRpc({ roundId: now, timestamp: now - 10 * 86400, gasBalance: 100e8 });
  const { port } = server.address();
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'feed-monitor-'));
  const statusFile = path.join(tmp, 'feed-status.json');
  try {
    const result = await runMonitor(`http://127.0.0.1:${port}`, statusFile);
    assert.equal(result.code, 1, `expected stale alert exit 1, got ${result.code}: ${result.stdout}${result.stderr}`);
    assert.match(result.stdout, /FEED STALE NEO-USD/);
    const status = JSON.parse(readFileSync(statusFile, 'utf8'));
    assert.equal(status.ok, false);
  } finally {
    server.close();
  }
});

test('monitor alerts on a low updater GAS balance', async () => {
  const now = Math.floor(Date.now() / 1000);
  const server = await startMockRpc({ roundId: 42, timestamp: now - 60, gasBalance: 2e8 });
  const { port } = server.address();
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'feed-monitor-'));
  const statusFile = path.join(tmp, 'feed-status.json');
  try {
    const result = await runMonitor(`http://127.0.0.1:${port}`, statusFile);
    assert.equal(result.code, 1);
    assert.match(result.stdout, /LOW GAS updater=2\.0/);
  } finally {
    server.close();
  }
});
