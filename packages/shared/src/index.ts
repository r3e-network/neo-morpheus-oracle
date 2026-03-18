export type SupportedChain = 'neo_n3' | 'neo_x';

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
