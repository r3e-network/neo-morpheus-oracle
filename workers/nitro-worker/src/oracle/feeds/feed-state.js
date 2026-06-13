import fs from 'node:fs/promises';
import path from 'node:path';
import { env, trimString } from '../../platform/core.js';
import {
  DEFAULT_FEED_STATE_PATH,
  isEnabled,
  resolveFeedScope,
} from './shared.js';

const feedStateCache = new Map();

export function getSupabaseRestConfig() {
  const baseUrl = trimString(
    env('SUPABASE_URL') || env('NEXT_PUBLIC_SUPABASE_URL') || env('morpheus_SUPABASE_URL') || ''
  );
  const apiKey = trimString(
    env('SUPABASE_SECRET_KEY') ||
      env('morpheus_SUPABASE_SECRET_KEY') ||
      env('SUPABASE_SERVICE_ROLE_KEY') ||
      env('morpheus_SUPABASE_SERVICE_ROLE_KEY') ||
      env('SUPABASE_SERVICE_KEY') ||
      ''
  );
  if (!baseUrl || !apiKey) return null;
  return {
    restUrl: `${baseUrl.replace(/\/$/, '')}/rest/v1`,
    apiKey,
  };
}

export async function fetchLatestFeedSnapshots(limit = 250, scope = {}) {
  const restConfig = getSupabaseRestConfig();
  if (!restConfig) return [];
  const resolvedScope = resolveFeedScope(scope);
  const url = new URL(`${restConfig.restUrl}/morpheus_feed_snapshots`);
  url.searchParams.set(
    'select',
    'symbol,target_chain,price,payload,attestation_hash,created_at,network'
  );
  url.searchParams.set('network', `eq.${resolvedScope.network}`);
  url.searchParams.set('target_chain', `eq.${resolvedScope.targetChain}`);
  url.searchParams.set('order', 'created_at.desc');
  url.searchParams.set('limit', String(Math.max(limit, 1)));
  const response = await fetch(url.toString(), {
    headers: {
      apikey: restConfig.apiKey,
      authorization: `Bearer ${restConfig.apiKey}`,
      accept: 'application/json',
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(
      `supabase morpheus_feed_snapshots GET failed: ${response.status} ${await response.text()}`
    );
  }
  const text = await response.text();
  if (!text) return [];
  try {
    return JSON.parse(text);
  } catch {
    return [];
  }
}

export async function persistFeedSnapshots(rows) {
  const restConfig = getSupabaseRestConfig();
  if (!restConfig || !Array.isArray(rows) || rows.length === 0) return false;
  const response = await fetch(`${restConfig.restUrl}/morpheus_feed_snapshots`, {
    method: 'POST',
    headers: {
      apikey: restConfig.apiKey,
      authorization: `Bearer ${restConfig.apiKey}`,
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify(rows),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(
      `supabase morpheus_feed_snapshots POST failed: ${response.status} ${await response.text()}`
    );
  }
  return true;
}

function applySnapshotRowsToFeedState(state, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return state;
  const seenStoragePairs = new Set();
  for (const row of rows) {
    const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
    const storagePair = trimString(payload.storage_pair || row?.symbol || '');
    if (!storagePair || seenStoragePairs.has(storagePair)) continue;
    seenStoragePairs.add(storagePair);
    state.records[storagePair] = {
      ...(state.records[storagePair] || {}),
      ...payload,
      storage_pair: storagePair,
      pair: trimString(payload.pair || row?.symbol || storagePair),
      price:
        payload.price !== undefined && payload.price !== null && trimString(payload.price) !== ''
          ? payload.price
          : (row?.price ?? null),
      attestation_hash: trimString(payload.attestation_hash || row?.attestation_hash || ''),
      snapshot_created_at: trimString(row?.created_at || ''),
    };
  }
  return state;
}

function getFeedStatePathBase() {
  return trimString(env('MORPHEUS_FEED_STATE_PATH')) || DEFAULT_FEED_STATE_PATH;
}

function buildScopedFeedStatePath(basePath, network, targetChain) {
  const ext = path.extname(basePath);
  if (!ext) return `${basePath}.${network}.${targetChain}`;
  return `${basePath.slice(0, -ext.length)}.${network}.${targetChain}${ext}`;
}

export function getFeedStatePath(scope = {}) {
  const resolvedScope = resolveFeedScope(scope);
  return buildScopedFeedStatePath(
    getFeedStatePathBase(),
    resolvedScope.network,
    resolvedScope.targetChain
  );
}

function normalizeFeedState(state) {
  const normalized = state && typeof state === 'object' ? state : {};
  if (!normalized.records || typeof normalized.records !== 'object') {
    normalized.records = {};
  }
  return normalized;
}

async function readFeedStateFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return normalizeFeedState(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function loadFeedState(scope = {}) {
  const resolvedScope = resolveFeedScope(scope);
  const statePath = getFeedStatePath(resolvedScope);
  if (feedStateCache.has(statePath)) return feedStateCache.get(statePath);

  let state = await readFeedStateFile(statePath);
  if (!state) {
    const legacyPath = getFeedStatePathBase();
    if (legacyPath != statePath) {
      state = await readFeedStateFile(legacyPath);
    }
  }
  state = normalizeFeedState(state);

  if (
    isEnabled(env('MORPHEUS_FEED_BOOTSTRAP_SUPABASE_ENABLED'), true) &&
    Object.keys(state.records).length === 0
  ) {
    try {
      const rows = await fetchLatestFeedSnapshots(250, resolvedScope);
      state = applySnapshotRowsToFeedState(state, rows);
    } catch {
      // keep pricefeed startup independent from Supabase health
    }
  }

  feedStateCache.set(statePath, state);
  return state;
}

export async function saveFeedState(state, scope = {}) {
  const resolvedScope = resolveFeedScope(scope);
  const statePath = getFeedStatePath(resolvedScope);
  feedStateCache.set(statePath, state);
  try {
    await fs.mkdir(path.dirname(statePath), { recursive: true });
    await fs.writeFile(
      statePath,
      `${JSON.stringify(state, null, 2)}
`,
      'utf8'
    );
  } catch {
    // best effort only; feed sync still works without persistence
  }
}

export function resetFeedStateCache() {
  feedStateCache.clear();
}
