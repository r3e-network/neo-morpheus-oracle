const MAINNET_MAGIC = 860833102;
const TESTNET_MAGIC = 894710606;

type DapiAccount = {
  hash?: string;
  address?: string;
  isDefault?: boolean;
};

type DapiProvider = {
  name?: string;
  network?: number;
  supportedNetworks?: number[];
  getAccounts?: () => Promise<DapiAccount[]>;
  authenticate?: (payload: {
    action: 'Authentication';
    grant_type: 'Signature';
    allowed_algorithms: ['ECDSA-P256'];
    domain: string;
    networks: number[];
    nonce: string;
    timestamp: number;
  }) => Promise<{ address?: string; network?: number; pubkey?: string }>;
  invoke?: (
    invocations: Array<{
      hash: string;
      operation: string;
      args?: Array<{ type: string; value: unknown }>;
      abortOnFail?: boolean;
    }>,
    signers?: Array<{ account: string; scopes: string }>
  ) => Promise<unknown>;
};

type DapiWindow = Window & {
  Neo?: { DapiProvider?: unknown };
  neoDapiProvider?: unknown;
  neoDapi?: unknown;
};

export type MorpheusOracleInvokeRequest = {
  oracleHash: string;
  requestType: string;
  payloadBase64: string;
  callbackHash: string;
  callbackMethod: string;
};

function isDapiProvider(value: unknown): value is DapiProvider {
  if (!value || typeof value !== 'object') return false;
  const provider = value as Partial<DapiProvider>;
  return typeof provider.getAccounts === 'function' || typeof provider.authenticate === 'function';
}

function readImmediateProvider(): DapiProvider | null {
  if (typeof window === 'undefined') return null;
  const win = window as DapiWindow;
  const candidates = [win.Neo?.DapiProvider, win.neoDapiProvider, win.neoDapi];
  return candidates.find(isDapiProvider) ?? null;
}

function createNonce() {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
}

function getAuthenticationDomain() {
  if (typeof window === 'undefined') return 'localhost';
  return window.location.host || window.location.hostname || 'localhost';
}

function normalizeTxResult(result: unknown) {
  if (typeof result === 'string') return { txid: result };
  if (result && typeof result === 'object') {
    const record = result as Record<string, unknown>;
    const txid = String(record.txid ?? record.tx ?? record.hash ?? '');
    return txid ? { ...record, txid } : record;
  }
  return {};
}

export function requestNeoDapiProvider(timeoutMs = 3000): Promise<DapiProvider> {
  const immediate = readImmediateProvider();
  if (immediate) return Promise.resolve(immediate);
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('NEP-21 dAPI requires a browser context'));
  }

  return new Promise((resolve, reject) => {
    let timeout: ReturnType<typeof setTimeout>;
    let settled = false;
    const finish = (provider: DapiProvider) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      window.removeEventListener('Neo.DapiProvider.ready', onReady);
      resolve(provider);
    };
    const onReady = (event: Event) => {
      const provider = (event as CustomEvent<{ provider?: unknown }>).detail?.provider;
      if (!isDapiProvider(provider)) return;
      finish(provider);
    };
    window.addEventListener('Neo.DapiProvider.ready', onReady);
    timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      window.removeEventListener('Neo.DapiProvider.ready', onReady);
      reject(new Error('NEP-21 dAPI wallet not detected'));
    }, timeoutMs);
    window.dispatchEvent(
      new CustomEvent('Neo.DapiProvider.request', {
        detail: { version: '1.0' },
      })
    );
  });
}

async function resolveAccount(provider: DapiProvider) {
  const accounts = (await provider.getAccounts?.().catch(() => [])) ?? [];
  const account = accounts.find((entry) => entry.isDefault) ?? accounts[0];
  if (account?.hash || account?.address) {
    return {
      address: account.address ?? account.hash ?? '',
      accountHash: account.hash,
    };
  }

  if (!provider.authenticate) {
    throw new Error('NEP-21 wallet did not return an account');
  }

  const authenticated = await provider.authenticate({
    action: 'Authentication',
    grant_type: 'Signature',
    allowed_algorithms: ['ECDSA-P256'],
    domain: getAuthenticationDomain(),
    networks: provider.supportedNetworks?.length
      ? provider.supportedNetworks
      : [TESTNET_MAGIC, MAINNET_MAGIC],
    nonce: createNonce(),
    timestamp: Date.now(),
  });

  const address = String(authenticated.address ?? '').trim();
  if (!address) throw new Error('NEP-21 wallet authentication did not return an address');
  const refreshedAccounts = (await provider.getAccounts?.().catch(() => [])) ?? [];
  const refreshedAccount =
    refreshedAccounts.find((entry) => entry.address === address) ?? refreshedAccounts[0];
  return { address, accountHash: refreshedAccount?.hash };
}

export async function invokeMorpheusOracleRequest(request: MorpheusOracleInvokeRequest) {
  const provider = await requestNeoDapiProvider();
  if (!provider.invoke) throw new Error('NEP-21 wallet does not support invoke');
  const account = await resolveAccount(provider);
  const signers = account.accountHash
    ? [{ account: account.accountHash, scopes: 'CalledByEntry' }]
    : undefined;

  const result = await provider.invoke(
    [
      {
        hash: request.oracleHash,
        operation: 'request',
        args: [
          { type: 'String', value: request.requestType },
          { type: 'ByteArray', value: request.payloadBase64 },
          { type: 'Hash160', value: request.callbackHash },
          { type: 'String', value: request.callbackMethod },
        ],
      },
    ],
    signers
  );

  return normalizeTxResult(result);
}
