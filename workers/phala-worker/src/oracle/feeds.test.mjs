import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  __buildNeoN3RelaySigningPayloadForTests,
  __buildFeedSnapshotRowsForTests,
  __loadFeedStateForTests,
  __resetFeedStateForTests,
  handleOracleFeed,
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

test('loadFeedState bootstraps from Supabase snapshots when local state is empty', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'morpheus-feed-state-'));
  process.env.MORPHEUS_FEED_STATE_PATH = path.join(tempDir, 'feed-state.json');
  process.env.SUPABASE_URL = 'https://supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
  process.env.MORPHEUS_FEED_BOOTSTRAP_SUPABASE_ENABLED = 'true';
  process.env.MORPHEUS_NETWORK = 'testnet';

  global.fetch = async (url) => {
    assert.match(String(url), /morpheus_feed_snapshots/);
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

  const state = await __loadFeedStateForTests();
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
