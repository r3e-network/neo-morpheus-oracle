import { getSelectedNetwork, getSelectedNetworkKey } from './networks';

const selectedNetworkKey = getSelectedNetworkKey();
const selectedNetwork = getSelectedNetwork();

const defaultNeoRpcUrl = selectedNetwork.neo_n3?.rpc_url || '';
const defaultControlPlaneUrl =
  process.env.NODE_ENV === 'production' ? 'https://control.meshmini.app' : '';
const defaultPhalaApiUrl = selectedNetwork.phala?.public_api_url || '';

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function networkScopedEnv(baseKey: string) {
  const upper = selectedNetworkKey === 'mainnet' ? 'MAINNET' : 'TESTNET';
  return trimString(process.env[`${baseKey}_${upper}` as keyof NodeJS.ProcessEnv]);
}

const defaultPhalaApiCandidates = [
  networkScopedEnv('MORPHEUS_RUNTIME_URL'),
  trimString(process.env.MORPHEUS_RUNTIME_URL || ''),
  networkScopedEnv('NEXT_PUBLIC_MORPHEUS_RUNTIME_URL'),
  trimString(process.env.NEXT_PUBLIC_MORPHEUS_RUNTIME_URL || ''),
  defaultPhalaApiUrl,
  `https://oracle.meshmini.app/${selectedNetworkKey}`,
  `https://edge.meshmini.app/${selectedNetworkKey}`,
]
  .map((value) => value.trim())
  .filter(Boolean);

export const appConfig = {
  name: process.env.NEXT_PUBLIC_APP_NAME || 'Morpheus Oracle',
  appUrl: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  selectedNetworkKey,
  phalaApiUrl:
    networkScopedEnv('MORPHEUS_RUNTIME_URL') ||
    trimString(process.env.MORPHEUS_RUNTIME_URL || '') ||
    networkScopedEnv('NEXT_PUBLIC_MORPHEUS_RUNTIME_URL') ||
    trimString(process.env.NEXT_PUBLIC_MORPHEUS_RUNTIME_URL || '') ||
    defaultPhalaApiUrl,
  phalaApiUrls: [...new Set(defaultPhalaApiCandidates)],
  phalaToken:
    trimString(process.env.MORPHEUS_RUNTIME_TOKEN || '') ||
    trimString(process.env.PHALA_API_TOKEN || '') ||
    trimString(process.env.PHALA_SHARED_SECRET || '') ||
    trimString(process.env.NEXT_PUBLIC_MORPHEUS_RUNTIME_TOKEN || '') ||
    '',
  controlPlaneUrl:
    process.env.MORPHEUS_CONTROL_PLANE_URL ||
    process.env.NEXT_PUBLIC_MORPHEUS_CONTROL_PLANE_URL ||
    defaultControlPlaneUrl,
  controlPlaneApiKey:
    process.env.MORPHEUS_CONTROL_PLANE_API_KEY ||
    process.env.MORPHEUS_PROVIDER_CONFIG_API_KEY ||
    process.env.MORPHEUS_OPERATOR_API_KEY ||
    process.env.ADMIN_CONSOLE_API_KEY ||
    process.env.PHALA_API_TOKEN ||
    process.env.PHALA_SHARED_SECRET ||
    '',
  feedProjectSlug: process.env.MORPHEUS_FEED_PROJECT_SLUG || 'morpheus',
  feedProvider: process.env.MORPHEUS_FEED_PROVIDER || 'twelvedata',
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  neoRpcUrl: process.env.NEO_RPC_URL || defaultNeoRpcUrl,
};
