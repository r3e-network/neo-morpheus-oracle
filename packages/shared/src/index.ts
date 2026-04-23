export type SupportedChain = 'neo_n3';
export type MorpheusNetwork = 'mainnet' | 'testnet';
export type ControlPlaneQueue =
  | 'oracle_request'
  | 'feed_tick'
  | 'callback_broadcast'
  | 'automation_execute';
export type ControlPlaneKernelLane =
  | 'request_dispatch'
  | 'shared_resource_sync'
  | 'callback_adapter_broadcast'
  | 'automation_orchestration';
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
export type ControlPlaneAuxRoute = '/feeds/tick' | '/callbacks/broadcast' | '/automation/execute';
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

// Public route paths and queue names remain compatibility-oriented. Internally these map to
// broader MiniApp OS runtime lanes so the same infrastructure can serve many miniapps.
export const controlPlaneQueueKernelLanes: Record<ControlPlaneQueue, ControlPlaneKernelLane> = {
  oracle_request: 'request_dispatch',
  feed_tick: 'shared_resource_sync',
  callback_broadcast: 'callback_adapter_broadcast',
  automation_execute: 'automation_orchestration',
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

export type WorkflowId =
  | 'oracle.query'
  | 'oracle.smart_fetch'
  | 'feed.sync'
  | 'automation.upkeep'
  | 'compute.execute'
  | 'neodid.bind'
  | 'neodid.action_ticket'
  | 'neodid.recovery_ticket'
  | 'paymaster.authorize';

export type WorkflowTriggerKind = 'request' | 'event' | 'scheduler';
export type WorkflowDeliveryMode =
  | 'api_response'
  | 'shared_resource_sync'
  | 'onchain_callback'
  | 'kernel_inbox';

export type WorkflowDefinition = {
  id: WorkflowId;
  version: number;
  trigger: {
    kind: WorkflowTriggerKind;
    supported?: string[];
  };
  allowedNetworks: MorpheusNetwork[];
  route: ControlPlaneRoute | '/paymaster/authorize';
  capabilityId?: string;
  confidentialSteps: string[];
  policies: string[];
  delivery: {
    mode: WorkflowDeliveryMode;
  };
};

export const RESULT_ENVELOPE_VERSION = '2026-04-tee-v1';

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

// Re-export utilities for TypeScript consumers
export { json, trimString, parseTimestampMs, getClientIp, stableStringify } from './utils.js';
export { applyUpstashRateLimit } from './rate-limit.js';
export type { UpstashRateLimitConfig, UpstashRateLimitResult } from './rate-limit.js';
export {
  RESULT_ENVELOPE_VERSION,
  getWorkflowDefinition,
  listWorkflowDefinitions,
} from './workflow-catalog.js';

export type PublicRuntimeCatalogSummary = {
  envelope: Record<string, unknown>;
  topology: Record<string, unknown>;
  risk: Record<string, unknown>;
  automation: Record<string, unknown>;
  workflows: {
    count: number;
    ids: string[];
  };
  links: {
    catalog: '/api/runtime/catalog';
    workflows: '/api/workflows';
    policies: '/api/policies';
  };
};

export type RuntimeProbeSnapshotInput = {
  ok: boolean;
  status: number;
  body: unknown;
};

export type PublicRuntimeStatusSnapshot = {
  checkedAt: string;
  catalog: PublicRuntimeCatalogSummary;
  runtime: {
    status: 'operational' | 'degraded' | 'down';
    health: {
      ok: boolean;
      statusCode: number;
      state: 'ok' | 'degraded' | 'down';
      detail: string | null;
    };
    info: {
      ok: boolean;
      statusCode: number;
      appId: string | null;
      composeHash: string | null;
      clientKind: string | null;
      version: string | null;
      detail: string | null;
    };
  };
};

export const PUBLIC_RUNTIME_DISCOVERY_LINKS: {
  catalog: '/api/runtime/catalog';
  workflows: '/api/workflows';
  policies: '/api/policies';
};

export function buildPublicRuntimeCatalogSummary(
  catalog: Record<string, unknown>
): PublicRuntimeCatalogSummary;

export function buildPublicRuntimeStatusSnapshot(input: {
  catalog: Record<string, unknown>;
  checkedAt?: string;
  health: RuntimeProbeSnapshotInput;
  info: RuntimeProbeSnapshotInput;
}): PublicRuntimeStatusSnapshot;

export function getPublicRuntimeStatusNotes(snapshot: PublicRuntimeStatusSnapshot): string[];

export {
  PUBLIC_RUNTIME_DISCOVERY_LINKS,
  buildPublicRuntimeCatalogSummary,
  buildPublicRuntimeStatusSnapshot,
  getPublicRuntimeStatusNotes,
} from './public-runtime.js';
