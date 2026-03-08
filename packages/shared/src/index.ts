export type SupportedChain = "neo_n3" | "neo_x";

export type OraclePayload = {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  json_path?: string;
  encrypted_token?: string;
  encrypted_payload?: string;
  token_header?: string;
  script?: string;
  script_base64?: string;
  target_chain?: SupportedChain;
  target_chain_id?: string;
};

export type ComputeBuiltinFunction =
  | "hash.sha256"
  | "math.modexp"
  | "matrix.multiply"
  | "vector.cosine_similarity"
  | "zkp.public_signal_hash"
  | "zkp.proof_digest"
  | "fhe.batch_plan"
  | "fhe.noise_budget_estimate";

export type BuiltinProviderId = "twelvedata" | "coinbase-spot";

export type ProviderConfig = {
  provider_id: BuiltinProviderId | string;
  enabled: boolean;
  config: Record<string, unknown>;
};
