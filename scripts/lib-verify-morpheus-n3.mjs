function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function firstNonEmpty(values) {
  for (const value of values) {
    const trimmed = trimString(value);
    if (trimmed) return trimmed;
  }
  return '';
}

export function snapshotEnv(keys, env = process.env) {
  const snapshot = {};
  for (const key of keys) {
    const value = trimString(env[key]);
    if (value) snapshot[key] = value;
  }
  return snapshot;
}

export function resolveNetworkScopedValue({
  network,
  explicitEnv = {},
  selectedEnv = {},
  loadedEnv = process.env,
  genericKey,
  mainnetKey,
  testnetKey,
  registryValue = '',
}) {
  const networkKey = network === 'mainnet' ? mainnetKey : testnetKey;
  return firstNonEmpty([
    explicitEnv[networkKey],
    explicitEnv[genericKey],
    selectedEnv[networkKey],
    selectedEnv[genericKey],
    registryValue,
    loadedEnv[networkKey],
    loadedEnv[genericKey],
  ]);
}

export function detectMorpheusOracleInterface(methods) {
  const methodSet = methods instanceof Set ? methods : new Set(methods || []);
  const supportsMiniAppRuntime =
    methodSet.has('submitMiniAppRequest/4') ||
    methodSet.has('submitMiniAppRequestFromIntegration/5') ||
    methodSet.has('getMiniAppCount/0');
  const supportsLegacyCallbackAllowlist =
    methodSet.has('isAllowedCallback/1') ||
    methodSet.has('addAllowedCallback/1') ||
    methodSet.has('removeAllowedCallback/1');

  if (supportsMiniAppRuntime) return 'miniapp_runtime';
  if (supportsLegacyCallbackAllowlist) return 'legacy_callback';
  return 'unknown';
}
