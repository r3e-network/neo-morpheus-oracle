import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildFeedSyncPayload } from './feed-sync.js';

test('feed sync payload does not inject relayer/updater signer material', () => {
  const payload = buildFeedSyncPayload(
    {
      network: 'mainnet',
      feedSync: {
        symbols: ['TWELVEDATA:NEO-USD'],
        projectSlug: 'morpheus',
        changeThresholdBps: '10',
        minUpdateIntervalMs: '60000',
        staleAfterMs: '300000',
        providers: ['twelvedata'],
      },
      neo_n3: {
        updaterPrivateKey: '0x'.padEnd(66, '1'),
        updaterWif: 'L'.padEnd(52, '1'),
      },
    },
    'neo_n3'
  );

  assert.equal(payload.target_chain, 'neo_n3');
  assert.equal(payload.network, 'mainnet');
  assert.equal(payload.private_key, undefined);
  assert.equal(payload.wif, undefined);
});
