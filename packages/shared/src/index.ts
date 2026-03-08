export type SupportedChain = "neo_n3" | "neo_x";

export type OraclePayload = {
  project_slug?: string;
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  json_path?: string;
  encrypted_token?: string;
  encrypted_payload?: string;
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
  | "hash.sha256"
  | "hash.keccak256"
  | "math.modexp"
  | "matrix.multiply"
  | "vector.cosine_similarity"
  | "merkle.root"
  | "zkp.public_signal_hash"
  | "zkp.proof_digest"
  | "zkp.witness_digest"
  | "zkp.groth16.prove.plan"
  | "zkp.plonk.prove.plan"
  | "fhe.batch_plan"
  | "fhe.noise_budget_estimate"
  | "fhe.rotation_plan";

export type BuiltinProviderId = "twelvedata" | "coinbase-spot";

export type ProviderConfig = {
  provider_id: BuiltinProviderId | string;
  enabled: boolean;
  config: Record<string, unknown>;
};

export const providerConfigSchemaHints: Record<string, unknown> = {
  twelvedata: {
    endpoint: "price",
    symbol: "NEO-USD",
    interval: "1min",
  },
  "coinbase-spot": {
    symbol: "NEO-USD",
  },
};
