import { afterEach, describe, expect, it, vi } from 'vitest';

import { invokeMorpheusOracleRequest, requestNeoDapiProvider } from './nep21';

class TestCustomEvent<T> extends Event {
  detail: T;

  constructor(type: string, init?: { detail?: T }) {
    super(type);
    this.detail = init?.detail as T;
  }
}

function installWindow() {
  const target = new EventTarget() as EventTarget & {
    location: { host: string; hostname: string };
    Neo?: { DapiProvider?: unknown };
  };
  target.location = { host: 'morpheus.test', hostname: 'morpheus.test' };
  vi.stubGlobal('CustomEvent', TestCustomEvent);
  vi.stubGlobal('window', target);
  return target;
}

describe('Morpheus NEP-21 wallet helper', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('dispatches the standard provider request event and resolves the ready provider', async () => {
    const target = installWindow();
    const provider = { getAccounts: vi.fn(async () => []) };
    const requestedVersions: string[] = [];

    target.addEventListener('Neo.DapiProvider.request', (event) => {
      requestedVersions.push((event as CustomEvent<{ version?: string }>).detail?.version ?? '');
    });

    const pending = requestNeoDapiProvider(250);
    await Promise.resolve();

    expect(requestedVersions).toEqual(['1.0']);

    target.dispatchEvent(
      new CustomEvent('Neo.DapiProvider.ready', {
        detail: { provider },
      })
    );

    await expect(pending).resolves.toBe(provider);
  });

  it('submits oracle requests with NEP-21 invoke after NEP-20 authentication', async () => {
    const target = installWindow();
    const provider = {
      supportedNetworks: [894710606],
      getAccounts: vi.fn(async () => []),
      authenticate: vi.fn(async () => ({
        address: 'NUserAddress',
        pubkey: '03pub',
      })),
      invoke: vi.fn(async () => ({ txid: '0xoracletx' })),
    };
    target.Neo = { DapiProvider: provider };

    await expect(
      invokeMorpheusOracleRequest({
        oracleHash: '0xoracle',
        requestType: 'privacy_oracle',
        payloadBase64: 'eyJ4IjoxfQ==',
        callbackHash: '0xcallback',
        callbackMethod: 'onOracleResult',
      })
    ).resolves.toEqual({ txid: '0xoracletx' });

    expect(provider.authenticate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'Authentication',
        grant_type: 'Signature',
        allowed_algorithms: ['ECDSA-P256'],
        domain: 'morpheus.test',
        networks: [894710606],
      })
    );
    expect(provider.invoke).toHaveBeenCalledWith(
      [
        {
          hash: '0xoracle',
          operation: 'request',
          args: [
            { type: 'String', value: 'privacy_oracle' },
            { type: 'ByteArray', value: 'eyJ4IjoxfQ==' },
            { type: 'Hash160', value: '0xcallback' },
            { type: 'String', value: 'onOracleResult' },
          ],
        },
      ],
      undefined
    );
  });
});
