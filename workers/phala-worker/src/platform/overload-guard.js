import { env, json, trimString } from './core.js';

const inFlightByRoute = new Map();

function normalizeRouteName(path = '') {
  if (path.endsWith('/paymaster/authorize')) return 'paymaster_authorize';
  if (path.endsWith('/relay/transaction')) return 'relay_transaction';
  if (path.endsWith('/txproxy/invoke')) return 'txproxy_invoke';
  if (path.endsWith('/compute/execute')) return 'compute_execute';
  if (path.endsWith('/vrf/random')) return 'vrf_random';
  if (path.endsWith('/oracle/query')) return 'oracle_query';
  if (path.endsWith('/oracle/smart-fetch')) return 'oracle_smart_fetch';
  if (path.endsWith('/oracle/feed')) return 'oracle_feed';
  if (path.endsWith('/neodid/bind')) return 'neodid_bind';
  if (path.endsWith('/neodid/action-ticket')) return 'neodid_action_ticket';
  if (path.endsWith('/neodid/recovery-ticket')) return 'neodid_recovery_ticket';
  if (path.endsWith('/neodid/zklogin-ticket')) return 'neodid_zklogin_ticket';
  return '';
}

function defaultLimit(routeName) {
  switch (routeName) {
    case 'compute_execute':
      return 4;
    case 'vrf_random':
      return 4;
    case 'relay_transaction':
      return 6;
    case 'paymaster_authorize':
      return 8;
    case 'neodid_recovery_ticket':
      return 4;
    case 'neodid_bind':
      return 6;
    case 'neodid_action_ticket':
      return 6;
    case 'neodid_zklogin_ticket':
      return 6;
    case 'oracle_feed':
      return 0;
    case 'oracle_smart_fetch':
      return 12;
    case 'oracle_query':
      return 16;
    case 'txproxy_invoke':
      return 12;
    default:
      return 0;
  }
}

function resolveLimit(routeName) {
  if (!routeName) return 0;
  const explicit = Number(
    env(`MORPHEUS_MAX_INFLIGHT_${routeName.toUpperCase()}`) || defaultLimit(routeName)
  );
  return Number.isFinite(explicit) ? Math.max(Math.trunc(explicit), 0) : 0;
}

function currentInFlight(routeName) {
  return Number(inFlightByRoute.get(routeName) || 0);
}

function setInFlight(routeName, value) {
  if (value <= 0) {
    inFlightByRoute.delete(routeName);
    return;
  }
  inFlightByRoute.set(routeName, value);
}

export function snapshotOverloadState() {
  return Object.fromEntries([...inFlightByRoute.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

export function acquireOverloadSlot(pathname = '') {
  const routeName = normalizeRouteName(trimString(pathname));
  const limit = resolveLimit(routeName);
  if (!routeName || limit <= 0) {
    return {
      ok: true,
      routeName,
      limit,
      inFlight: currentInFlight(routeName),
      release() {},
    };
  }

  const inFlight = currentInFlight(routeName);
  if (inFlight >= limit) {
    return {
      ok: false,
      routeName,
      limit,
      inFlight,
      response: json(
        503,
        {
          error: 'overloaded',
          route: routeName,
          limit,
          in_flight: inFlight,
        },
        { 'retry-after': '1' }
      ),
      release() {},
    };
  }

  setInFlight(routeName, inFlight + 1);
  let released = false;
  return {
    ok: true,
    routeName,
    limit,
    inFlight: inFlight + 1,
    release() {
      if (released) return;
      released = true;
      setInFlight(routeName, currentInFlight(routeName) - 1);
    },
  };
}
