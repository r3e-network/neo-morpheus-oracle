import { getSelectedNetwork, getSelectedNetworkKey } from './networks';

const selectedNetworkKey = getSelectedNetworkKey();
const selectedNetwork = getSelectedNetwork();

const defaultNeoRpcUrl =
  selectedNetworkKey === 'mainnet'
    ? 'https://mainnet1.neo.coz.io:443'
    : 'https://testnet1.neo.coz.io:443';
const defaultNeoXRpcUrl =
  selectedNetworkKey === 'mainnet'
    ? 'https://mainnet-2.rpc.banelabs.org'
    : 'https://neoxt4seed1.ngd.network';
const defaultNeoXChainId = selectedNetworkKey === 'mainnet' ? '47763' : '12227332';
const defaultPhalaApiUrl = selectedNetwork.phala?.public_api_url || '';
const defaultPhalaApiCandidates = [
  process.env.PHALA_API_URL || '',
  process.env.NEXT_PUBLIC_PHALA_API_URL || '',
  defaultPhalaApiUrl,
  selectedNetworkKey === 'mainnet'
    ? 'https://morpheus-mainnet.meshmini.app'
    : 'https://morpheus-testnet.meshmini.app',
  `https://morpheus.meshmini.app/${selectedNetworkKey}`,
]
  .map((value) => value.trim())
  .filter(Boolean);

export const appConfig = {
  name: process.env.NEXT_PUBLIC_APP_NAME || 'Morpheus Oracle',
  appUrl: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  selectedNetworkKey,
  phalaApiUrl:
    process.env.PHALA_API_URL || process.env.NEXT_PUBLIC_PHALA_API_URL || defaultPhalaApiUrl,
  phalaApiUrls: [...new Set(defaultPhalaApiCandidates)],
  phalaToken: process.env.PHALA_API_TOKEN || process.env.PHALA_SHARED_SECRET || '',
  controlPlaneUrl:
    process.env.MORPHEUS_CONTROL_PLANE_URL ||
    process.env.NEXT_PUBLIC_MORPHEUS_CONTROL_PLANE_URL ||
    '',
  controlPlaneApiKey:
    process.env.MORPHEUS_CONTROL_PLANE_API_KEY ||
    process.env.MORPHEUS_PROVIDER_CONFIG_API_KEY ||
    process.env.MORPHEUS_OPERATOR_API_KEY ||
    process.env.ADMIN_CONSOLE_API_KEY ||
    '',
  feedProjectSlug: process.env.MORPHEUS_FEED_PROJECT_SLUG || 'demo',
  feedProvider: process.env.MORPHEUS_FEED_PROVIDER || 'twelvedata',
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  neoRpcUrl: process.env.NEO_RPC_URL || defaultNeoRpcUrl,
  neoXRpcUrl: process.env.NEOX_RPC_URL || defaultNeoXRpcUrl,
  neoXChainId: process.env.NEOX_CHAIN_ID || defaultNeoXChainId,
};
