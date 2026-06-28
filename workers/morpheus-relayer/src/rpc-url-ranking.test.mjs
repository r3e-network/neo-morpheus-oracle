import test from 'node:test';
import assert from 'node:assert/strict';

import { rpcUrlRank, uniqueRankedRpcUrls } from './config.js';

// Regression for the plaintext-RPC preference finding: the relayer must never
// rank a cleartext http:// endpoint ahead of an available https:// endpoint,
// otherwise consensus-adjacent reads/broadcasts run over MITM-able transport by
// default. Previously http://seed*.neo.org ranked first (rank 0).

test('https endpoints outrank plaintext http endpoints', () => {
  assert.ok(
    rpcUrlRank('https://api.n3index.dev/mainnet') < rpcUrlRank('http://seed1.neo.org:10332')
  );
  assert.ok(
    rpcUrlRank('https://mainnet1.neo.coz.io:443') < rpcUrlRank('http://seed2.neo.org:10332')
  );
  // The former special-cased http seeds must no longer win.
  assert.equal(rpcUrlRank('http://seed1.neo.org:10332'), 2);
  assert.equal(rpcUrlRank('https://anything.example'), 0);
});

test('uniqueRankedRpcUrls puts every https endpoint before any http endpoint', () => {
  const ranked = uniqueRankedRpcUrls([
    'http://seed1.neo.org:10332',
    'https://api.n3index.dev/mainnet',
    'http://seed2.neo.org:10332',
    'https://mainnet1.neo.coz.io:443',
  ]);
  const firstHttp = ranked.findIndex((url) => url.startsWith('http://'));
  const lastHttps = ranked.reduce(
    (acc, url, index) => (url.startsWith('https://') ? index : acc),
    -1
  );
  assert.ok(
    firstHttp === -1 || lastHttps < firstHttp,
    'no http:// endpoint precedes an https:// one'
  );
  // De-duplication and membership are preserved.
  assert.equal(new Set(ranked).size, ranked.length);
  assert.ok(ranked.includes('https://api.n3index.dev/mainnet'));
  assert.ok(ranked.includes('http://seed1.neo.org:10332'));
});
