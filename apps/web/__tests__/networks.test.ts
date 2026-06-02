import { afterEach, describe, expect, it, vi } from 'vitest';

describe('network selection', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('lets explicit URL/network overrides win over env defaults', async () => {
    vi.stubEnv('MORPHEUS_NETWORK', 'mainnet');
    const { getSelectedNetwork, getSelectedNetworkKey } = await import('../lib/networks');

    expect(getSelectedNetworkKey()).toBe('mainnet');
    expect(getSelectedNetworkKey('testnet')).toBe('testnet');
    expect(getSelectedNetwork('testnet').network).toBe('testnet');
  });
});
