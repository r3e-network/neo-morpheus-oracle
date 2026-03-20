export type SupportedChain = 'neo_n3' | 'neo_x';
export type MorpheusNetwork = 'mainnet' | 'testnet';
export type ControlPlaneQueue =
  | 'oracle_request'
  | 'feed_tick'
  | 'callback_broadcast'
  | 'automation_execute';
export type ControlPlaneJobStatus =
  | 'queued'
  | 'dispatching'
  | 'dispatched'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'dead_lettered'
  | 'cancelled';
export type ControlPlaneExecutionRoute =
  | '/oracle/query'
  | '/oracle/smart-fetch'
  | '/compute/execute'
  | '/neodid/bind'
  | '/neodid/action-ticket'
  | '/neodid/recovery-ticket';
export type ControlPlaneAuxRoute =
  | '/feeds/tick'
  | '/callbacks/broadcast'
  | '/automation/execute';
export type ControlPlaneRoute = ControlPlaneExecutionRoute | ControlPlaneAuxRoute;

export type ControlPlaneJobRecord = {
  id: string;
  network: MorpheusNetwork;
  queue: ControlPlaneQueue;
  route: ControlPlaneRoute;
  target_chain?: SupportedChain | null;
  project_slug?: string | null;
  request_id?: string | null;
  status: ControlPlaneJobStatus;
  dedupe_key?: string | null;
  payload: Record<string, unknown>;
  result?: Record<string, unknown> | null;
  error?: string | null;
  retry_count: number;
  run_after?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  metadata: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

export const controlPlaneRouteQueues: Record<ControlPlaneRoute, ControlPlaneQueue> = {
  '/oracle/query': 'oracle_request',
  '/oracle/smart-fetch': 'oracle_request',
  '/compute/execute': 'oracle_request',
  '/neodid/bind': 'oracle_request',
  '/neodid/action-ticket': 'oracle_request',
  '/neodid/recovery-ticket': 'oracle_request',
  '/feeds/tick': 'feed_tick',
  '/callbacks/broadcast': 'callback_broadcast',
  '/automation/execute': 'automation_execute',
};

export type OraclePayload = {
  project_slug?: string;
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  json_path?: string;
  encrypted_token?: string;
  encrypted_payload?: string;
  encrypted_params?: string;
  encrypted_input?: string;
  encrypted_inputs?: Record<string, string>;
  token_header?: string;
  script?: string;
  script_base64?: string;
  provider?: BuiltinProviderId | string;
  provider_params?: Record<string, unknown>;
  symbol?: string;
  target_chain?: SupportedChain;
  target_chain_id?: string;
};

export type ComputeBuiltinFunction =
  | 'hash.sha256'
  | 'hash.keccak256'
  | 'crypto.rsa_verify'
  | 'math.modexp'
  | 'math.polynomial'
  | 'matrix.multiply'
  | 'vector.cosine_similarity'
  | 'merkle.root'
  | 'zkp.public_signal_hash'
  | 'zkp.proof_digest'
  | 'zkp.witness_digest'
  | 'zkp.groth16.verify'
  | 'zkp.groth16.prove.plan'
  | 'zkp.plonk.prove.plan'
  | 'zkp.zerc20.single_withdraw.verify'
  | 'fhe.batch_plan'
  | 'fhe.noise_budget_estimate'
  | 'fhe.rotation_plan'
  | 'privacy.mask'
  | 'privacy.add_noise';

export type BuiltinProviderId = 'twelvedata' | 'binance-spot' | 'coinbase-spot';

export type ProviderConfig = {
  provider_id: BuiltinProviderId | string;
  enabled: boolean;
  config: Record<string, unknown>;
};

export const providerConfigSchemaHints: Record<string, unknown> = {
  twelvedata: {
    endpoint: 'price',
    symbol: 'NEO-USD',
    interval: '1min',
  },
  'binance-spot': {
    symbol: 'NEOUSDT',
  },
  'coinbase-spot': {
    symbol: 'NEO-USD',
  },
};
