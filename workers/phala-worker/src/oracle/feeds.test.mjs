import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  __buildNeoN3RelaySigningPayloadForTests,
  __buildFeedSnapshotRowsForTests,
  __loadFeedStateForTests,
  __resolvePairThresholdBpsForTests,
  __resetFeedStateForTests,
  handleOracleFeed,
  normalizePairSymbol,
} from './feeds.js';

const originalFetch = global.fetch;
const originalFeedStatePath = process.env.MORPHEUS_FEED_STATE_PATH;
const originalSupabaseUrl = process.env.SUPABASE_URL;
const originalSupabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const originalFeedBootstrap = process.env.MORPHEUS_FEED_BOOTSTRAP_SUPABASE_ENABLED;
const originalFeedSnapshot = process.env.MORPHEUS_FEED_SNAPSHOT_SUPABASE_ENABLED;
const originalFeedProviders = process.env.MORPHEUS_FEED_PROVIDERS;
const originalTwelveDataKey = process.env.TWELVEDATA_API_KEY;
const originalDatafeedHash = process.env.CONTRACT_MORPHEUS_DATAFEED_HASH;
const originalFeedState = process.env.MORPHEUS_NETWORK;
const originalRelayerWif = process.env.MORPHEUS_RELAYER_NEO_N3_WIF;
const originalRelayerKey = process.env.MORPHEUS_RELAYER_NEO_N3_PRIVATE_KEY;
const originalUpdaterWif = process.env.MORPHEUS_UPDATER_NEO_N3_WIF;
const originalUpdaterKey = process.env.MORPHEUS_UPDATER_NEO_N3_PRIVATE_KEY;
const originalAllowUnpinned = process.env.MORPHEUS_ALLOW_UNPINNED_SIGNERS;

test.afterEach(async () => {
  global.fetch = originalFetch;
  __resetFeedStateForTests();
  if (originalFeedStatePath === undefined) delete process.env.MORPHEUS_FEED_STATE_PATH;
  else process.env.MORPHEUS_FEED_STATE_PATH = originalFeedStatePath;
  if (originalSupabaseUrl === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = originalSupabaseUrl;
  if (originalSupabaseServiceRoleKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = originalSupabaseServiceRoleKey;
  if (originalFeedBootstrap === undefined)
    delete process.env.MORPHEUS_FEED_BOOTSTRAP_SUPABASE_ENABLED;
  else process.env.MORPHEUS_FEED_BOOTSTRAP_SUPABASE_ENABLED = originalFeedBootstrap;
  if (originalFeedSnapshot === undefined)
    delete process.env.MORPHEUS_FEED_SNAPSHOT_SUPABASE_ENABLED;
  else process.env.MORPHEUS_FEED_SNAPSHOT_SUPABASE_ENABLED = originalFeedSnapshot;
  if (originalFeedProviders === undefined) delete process.env.MORPHEUS_FEED_PROVIDERS;
  else process.env.MORPHEUS_FEED_PROVIDERS = originalFeedProviders;
  if (originalTwelveDataKey === undefined) delete process.env.TWELVEDATA_API_KEY;
  else process.env.TWELVEDATA_API_KEY = originalTwelveDataKey;
  if (originalDatafeedHash === undefined) delete process.env.CONTRACT_MORPHEUS_DATAFEED_HASH;
  else process.env.CONTRACT_MORPHEUS_DATAFEED_HASH = originalDatafeedHash;
  if (originalFeedState === undefined) delete process.env.MORPHEUS_NETWORK;
  else process.env.MORPHEUS_NETWORK = originalFeedState;
  if (originalRelayerWif === undefined) delete process.env.MORPHEUS_RELAYER_NEO_N3_WIF;
  else process.env.MORPHEUS_RELAYER_NEO_N3_WIF = originalRelayerWif;
  if (originalRelayerKey === undefined) delete process.env.MORPHEUS_RELAYER_NEO_N3_PRIVATE_KEY;
  else process.env.MORPHEUS_RELAYER_NEO_N3_PRIVATE_KEY = originalRelayerKey;
  if (originalUpdaterWif === undefined) delete process.env.MORPHEUS_UPDATER_NEO_N3_WIF;
  else process.env.MORPHEUS_UPDATER_NEO_N3_WIF = originalUpdaterWif;
  if (originalUpdaterKey === undefined) delete process.env.MORPHEUS_UPDATER_NEO_N3_PRIVATE_KEY;
  else process.env.MORPHEUS_UPDATER_NEO_N3_PRIVATE_KEY = originalUpdaterKey;
  if (originalAllowUnpinned === undefined) delete process.env.MORPHEUS_ALLOW_UNPINNED_SIGNERS;
  else process.env.MORPHEUS_ALLOW_UNPINNED_SIGNERS = originalAllowUnpinned;
});

test('buildNeoN3RelaySigningPayload prefers updater signer material over worker signer material', () => {
  process.env.MORPHEUS_RELAYER_NEO_N3_WIF = 'relayer-wif';
  process.env.MORPHEUS_RELAYER_NEO_N3_PRIVATE_KEY = 'relayer-key';
  process.env.MORPHEUS_UPDATER_NEO_N3_WIF = 'updater-wif';
  process.env.MORPHEUS_UPDATER_NEO_N3_PRIVATE_KEY = 'updater-key';

  const resolved = __buildNeoN3RelaySigningPayloadForTests({});
  assert.equal(resolved.private_key, 'updater-key');
  assert.equal(resolved.wif, 'updater-wif');
});

test('normalizePairSymbol maps legacy oil symbol to WTI-USD', () => {
  assert.equal(normalizePairSymbol('OIL-USD'), 'WTI-USD');
});

test('pair-specific threshold overrides the global feed threshold', () => {
  process.env.MORPHEUS_FEED_PAIR_REGISTRY_JSON = JSON.stringify({
    'NEO-USD': {
      threshold_bps: 5,
    },
  });

  assert.equal(
    __resolvePairThresholdBpsForTests('TWELVEDATA:NEO-USD', { network: 'mainnet' }, 'neo_n3'),
    5
  );
});

test('handleOracleFeed honors pair-specific threshold overrides for mainnet pairs', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'morpheus-feed-threshold-'));
  process.env.MORPHEUS_FEED_STATE_PATH = path.join(tempDir, 'feed-state.json');
  process.env.MORPHEUS_FEED_BOOTSTRAP_SUPABASE_ENABLED = 'false';
  process.env.MORPHEUS_FEED_SNAPSHOT_SUPABASE_ENABLED = 'false';
  process.env.MORPHEUS_FEED_PROVIDERS = 'twelvedata';
  process.env.TWELVEDATA_API_KEY = 'test-twelvedata-key';
  process.env.MORPHEUS_FEED_CHANGE_THRESHOLD_BPS = '10';
  process.env.MORPHEUS_NETWORK = 'mainnet';
  process.env.MORPHEUS_ALLOW_UNPINNED_SIGNERS = 'true';
  process.env.MORPHEUS_FEED_PAIR_REGISTRY_JSON = JSON.stringify({
    'NEO-USD': {
      threshold_bps: 5,
    },
  });
  delete process.env.CONTRACT_PRICEFEED_HASH;
  delete process.env.CONTRACT_MORPHEUS_DATAFEED_HASH;

  await fs.writeFile(
    process.env.MORPHEUS_FEED_STATE_PATH.replace(/\.json$/, '.mainnet.neo_n3.json'),
    JSON.stringify({
      records: {
        'TWELVEDATA:NEO-USD': {
          storage_pair: 'TWELVEDATA:NEO-USD',
          pair: 'TWELVEDATA:NEO-USD',
          provider: 'twelvedata',
          price: '2.694',
          price_units: '2694000',
          round_id: '1',
          last_submitted_at_ms: Date.now() - 120000,
        },
      },
    }),
    'utf8'
  );

  global.fetch = async (url) => {
    const value = String(url);
    if (!value.includes('api.twelvedata.com')) {
      throw new Error(`unexpected fetch ${value}`);
    }
    return new Response(JSON.stringify({ price: '2.692', timestamp: '2026-04-12T23:23:09.000Z' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const response = await handleOracleFeed({
    network: 'mainnet',
    target_chain: 'neo_n3',
    symbols: ['TWELVEDATA:NEO-USD'],
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.batch_submitted, true);
  assert.equal(body.batch_count, 1);
  assert.equal(body.sync_results[0].relay_status, 'skipped');
  assert.equal(body.sync_results[0].skip_reason, undefined);
});

test('loadFeedState bootstraps from Supabase snapshots when local state is empty', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'morpheus-feed-state-'));
  process.env.MORPHEUS_FEED_STATE_PATH = path.join(tempDir, 'feed-state.json');
  process.env.SUPABASE_URL = 'https://supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
  process.env.MORPHEUS_FEED_BOOTSTRAP_SUPABASE_ENABLED = 'true';
  delete process.env.MORPHEUS_NETWORK;

  global.fetch = async (url) => {
    assert.match(String(url), /morpheus_feed_snapshots/);
    assert.match(String(url), /network=eq\.mainnet/);
    assert.match(String(url), /target_chain=eq\.neo_x/);
    return new Response(
      JSON.stringify([
        {
          symbol: 'TWELVEDATA:NEO-USD',
          target_chain: 'neo_n3',
          price: '12.34',
          attestation_hash: '0xaaa',
          payload: {
            storage_pair: 'TWELVEDATA:NEO-USD',
            pair: 'NEO-USD',
            provider: 'twelvedata',
            price: '12.34',
            last_observed_price: '12.34',
          },
        },
      ]),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  };

  const state = await __loadFeedStateForTests({ network: 'mainnet', targetChain: 'neo_x' });
  assert.equal(state.records['TWELVEDATA:NEO-USD'].price, '12.34');
  assert.equal(state.records['TWELVEDATA:NEO-USD'].provider, 'twelvedata');
});

test('handleOracleFeed persists Supabase snapshots without blocking pricefeed flow', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'morpheus-feed-snapshot-'));
  process.env.MORPHEUS_FEED_STATE_PATH = path.join(tempDir, 'feed-state.json');
  process.env.SUPABASE_URL = 'https://supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
  process.env.MORPHEUS_FEED_BOOTSTRAP_SUPABASE_ENABLED = 'false';
  process.env.MORPHEUS_FEED_SNAPSHOT_SUPABASE_ENABLED = 'true';
  process.env.MORPHEUS_FEED_PROVIDERS = 'twelvedata';
  process.env.TWELVEDATA_API_KEY = 'test-twelvedata-key';
  process.env.MORPHEUS_NETWORK = 'testnet';
  process.env.MORPHEUS_ALLOW_UNPINNED_SIGNERS = 'true';
  delete process.env.CONTRACT_PRICEFEED_HASH;
  delete process.env.CONTRACT_MORPHEUS_DATAFEED_HASH;

  const snapshotWrites = [];
  global.fetch = async (url, options = {}) => {
    const value = String(url);
    if (value.includes('api.twelvedata.com')) {
      return new Response(JSON.stringify({ price: '12.34' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (value.includes('morpheus_feed_snapshots')) {
      assert.equal(options.method, 'POST');
      snapshotWrites.push(JSON.parse(String(options.body)));
      return new Response('', { status: 201 });
    }
    throw new Error(`unexpected fetch ${value}`);
  };

  const response = await handleOracleFeed({
    target_chain: 'neo_n3',
    symbols: ['NEO-USD'],
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.mode, 'pricefeed');
  assert.equal(snapshotWrites.length, 1);
  assert.equal(snapshotWrites[0][0].symbol, 'TWELVEDATA:NEO-USD');
});

test('buildFeedSnapshotRows keeps relay metadata in snapshot payloads', () => {
  const rows = __buildFeedSnapshotRowsForTests(
    'neo_n3',
    [
      {
        storage_pair: 'TWELVEDATA:NEO-USD',
        pair: 'NEO-USD',
        relay_status: 'submitted',
        skip_reason: null,
        change_bps: 42,
        comparison_basis: 'last_submitted',
        anchored_tx: { txid: '0xabc' },
        quote: { provider: 'twelvedata', attestation_hash: '0xaaa', price: '12.34' },
      },
    ],
    {
      records: {
        'TWELVEDATA:NEO-USD': {
          storage_pair: 'TWELVEDATA:NEO-USD',
          pair: 'NEO-USD',
          provider: 'twelvedata',
          price: '12.34',
          attestation_hash: '0xaaa',
        },
      },
    },
    { txid: '0xabc' }
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].symbol, 'TWELVEDATA:NEO-USD');
  assert.equal(rows[0].payload.relay_status, 'submitted');
  assert.deepEqual(rows[0].payload.anchored_tx, { txid: '0xabc' });
});


test('handleOracleFeed isolates feed state by Morpheus network in a shared worker', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'morpheus-feed-shared-network-'));
  process.env.MORPHEUS_FEED_STATE_PATH = path.join(tempDir, 'feed-state.json');
  process.env.MORPHEUS_FEED_BOOTSTRAP_SUPABASE_ENABLED = 'false';
  process.env.MORPHEUS_FEED_SNAPSHOT_SUPABASE_ENABLED = 'false';
  process.env.MORPHEUS_FEED_PROVIDERS = 'twelvedata';
  process.env.TWELVEDATA_API_KEY = 'test-twelvedata-key';
  process.env.MORPHEUS_ALLOW_UNPINNED_SIGNERS = 'true';
  delete process.env.CONTRACT_PRICEFEED_HASH;
  delete process.env.CONTRACT_MORPHEUS_DATAFEED_HASH;

  let requestCount = 0;
  global.fetch = async (url) => {
    const value = String(url);
    if (!value.includes('api.twelvedata.com')) {
      throw new Error(`unexpected fetch ${value}`);
    }
    requestCount += 1;
    return new Response(JSON.stringify({ price: requestCount === 1 ? '12.34' : '56.78' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const mainnetResponse = await handleOracleFeed({
    network: 'mainnet',
    target_chain: 'neo_n3',
    symbols: ['NEO-USD'],
  });
  assert.equal(mainnetResponse.status, 200);

  const testnetResponse = await handleOracleFeed({
    network: 'testnet',
    target_chain: 'neo_n3',
    symbols: ['NEO-USD'],
  });
  assert.equal(testnetResponse.status, 200);

  const mainnetState = await __loadFeedStateForTests({ network: 'mainnet', targetChain: 'neo_n3' });
  const testnetState = await __loadFeedStateForTests({ network: 'testnet', targetChain: 'neo_n3' });
  assert.equal(mainnetState.records['TWELVEDATA:NEO-USD'].price, '12.34');
  assert.equal(testnetState.records['TWELVEDATA:NEO-USD'].price, '56.78');
});

test('handleOracleFeed isolates feed state by target chain inside one Morpheus network', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'morpheus-feed-shared-target-'));
  process.env.MORPHEUS_FEED_STATE_PATH = path.join(tempDir, 'feed-state.json');
  process.env.MORPHEUS_FEED_BOOTSTRAP_SUPABASE_ENABLED = 'false';
  process.env.MORPHEUS_FEED_SNAPSHOT_SUPABASE_ENABLED = 'false';
  process.env.MORPHEUS_FEED_PROVIDERS = 'twelvedata';
  process.env.TWELVEDATA_API_KEY = 'test-twelvedata-key';
  process.env.MORPHEUS_ALLOW_UNPINNED_SIGNERS = 'true';
  delete process.env.CONTRACT_PRICEFEED_HASH;
  delete process.env.CONTRACT_MORPHEUS_DATAFEED_HASH;
  delete process.env.CONTRACT_MORPHEUS_DATAFEED_X_ADDRESS;

  let requestCount = 0;
  global.fetch = async (url) => {
    const value = String(url);
    if (!value.includes('api.twelvedata.com')) {
      throw new Error(`unexpected fetch ${value}`);
    }
    requestCount += 1;
    return new Response(JSON.stringify({ price: requestCount === 1 ? '12.34' : '56.78' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const neoN3Response = await handleOracleFeed({
    network: 'mainnet',
    target_chain: 'neo_n3',
    symbols: ['NEO-USD'],
  });
  assert.equal(neoN3Response.status, 200);

  const neoXResponse = await handleOracleFeed({
    network: 'mainnet',
    target_chain: 'neo_x',
    symbols: ['NEO-USD'],
  });
  assert.equal(neoXResponse.status, 200);

  const neoN3State = await __loadFeedStateForTests({ network: 'mainnet', targetChain: 'neo_n3' });
  const neoXState = await __loadFeedStateForTests({ network: 'mainnet', targetChain: 'neo_x' });
  assert.equal(neoN3State.records['TWELVEDATA:NEO-USD'].price, '12.34');
  assert.equal(neoXState.records['TWELVEDATA:NEO-USD'].price, '56.78');
});

test('handleOracleFeed fails closed when on-chain baseline is unavailable and local state is empty', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'morpheus-feed-baseline-'));
  process.env.MORPHEUS_FEED_STATE_PATH = path.join(tempDir, 'feed-state.json');
  process.env.MORPHEUS_FEED_BOOTSTRAP_SUPABASE_ENABLED = 'false';
  process.env.MORPHEUS_FEED_SNAPSHOT_SUPABASE_ENABLED = 'false';
  process.env.MORPHEUS_FEED_PROVIDERS = 'twelvedata';
  process.env.TWELVEDATA_API_KEY = 'test-twelvedata-key';
  process.env.MORPHEUS_NETWORK = 'mainnet';
  process.env.NEO_RPC_URL = 'https://mainnet1.neo.coz.io:443';
  process.env.CONTRACT_MORPHEUS_DATAFEED_HASH = '0x03013f49c42a14546c8bbe58f9d434c3517fccab';
  process.env.MORPHEUS_ALLOW_UNPINNED_SIGNERS = 'true';
  process.env.MORPHEUS_RELAYER_NEO_N3_PRIVATE_KEY =
    '1111111111111111111111111111111111111111111111111111111111111111';

  const calls = [];
  global.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).includes('api.twelvedata.com')) {
      return new Response(JSON.stringify({ price: '2.723' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error('rpc baseline fetch failed');
  };

  const response = await handleOracleFeed({
    network: 'mainnet',
    target_chain: 'neo_n3',
    symbols: ['TWELVEDATA:NEO-USD'],
  });
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(body.batch_submitted, false);
  assert.equal(body.batch_count, 0);
  assert.deepEqual(body.sync_results, []);
  assert.match(body.errors[0].error, /baseline/i);
  assert.ok(calls.some((entry) => entry.includes('mainnet1.neo.coz.io')));
  assert.ok(!calls.some((entry) => entry.includes('api.twelvedata.com')));
});
