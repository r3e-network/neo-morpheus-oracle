// API path constants for the web app
export const API_PATHS = {
  // Attestation APIs
  attestation: {
    verify: '/api/attestation/verify',
    lookup: '/api/attestation/lookup',
    demo: '/api/attestation/demo',
  },

  // Provider configuration APIs
  providerConfigs: {
    list: '/api/provider-configs',
    byId: '/api/provider-configs',
  },
  providers: '/api/providers',

  // Relayer APIs
  relayer: {
    metrics: '/api/relayer/metrics',
    jobs: '/api/relayer/jobs',
    deadLetters: '/api/relayer/dead-letters',
    retry: '/api/relayer/jobs/retry',
    replay: '/api/relayer/jobs/replay',
  },

  // Oracle APIs
  oracle: {
    publicKey: '/api/oracle/public-key',
  },

  // Onchain APIs
  onchain: {
    state: '/api/onchain/state',
  },

  // Feeds APIs
  feeds: {
    catalog: '/api/feeds/catalog',
    status: '/api/feeds/status',
    bySymbol: (symbol: string) => `/api/feeds/${encodeURIComponent(symbol)}`,
  },

  // Runtime APIs
  runtime: {
    info: '/api/runtime/info',
    health: '/api/runtime/health',
  },

  // NeoDID APIs
  neodid: {
    providers: '/api/neodid/providers',
    runtime: '/api/neodid/runtime',
    resolve: '/api/neodid/resolve',
    bind: '/api/neodid/bind',
    actionTicket: '/api/neodid/action-ticket',
    recoveryTicket: '/api/neodid/recovery-ticket',
    zkLoginTicket: '/api/neodid/zklogin-ticket',
  },

  // Confidential APIs
  confidential: {
    store: '/api/confidential/store',
  },

  // Web3Auth APIs
  web3auth: {
    originData: (origin: string) =>
      `/api/web3auth/origin-data?origin=${encodeURIComponent(origin)}`,
  },
} as const;
