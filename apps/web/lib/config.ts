import { getSelectedNetwork, getSelectedNetworkKey } from "./networks";

const selectedNetworkKey = getSelectedNetworkKey();
const selectedNetwork = getSelectedNetwork();

const defaultNeoRpcUrl = selectedNetworkKey === "mainnet" ? "https://mainnet1.neo.coz.io:443" : "https://testnet1.neo.coz.io:443";
const defaultNeoXRpcUrl = selectedNetworkKey === "mainnet" ? "https://mainnet-2.rpc.banelabs.org" : "https://neoxt4seed1.ngd.network";
const defaultNeoXChainId = selectedNetworkKey === "mainnet" ? "47763" : "12227332";
const defaultPhalaApiUrl = selectedNetwork.phala?.public_api_url || "";

export const appConfig = {
  name: process.env.NEXT_PUBLIC_APP_NAME || "Morpheus Oracle",
  appUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  phalaApiUrl: process.env.PHALA_API_URL || process.env.NEXT_PUBLIC_PHALA_API_URL || defaultPhalaApiUrl,
  phalaToken: process.env.PHALA_API_TOKEN || process.env.PHALA_SHARED_SECRET || "",
  feedProjectSlug: process.env.MORPHEUS_FEED_PROJECT_SLUG || "demo",
  feedProvider: process.env.MORPHEUS_FEED_PROVIDER || "twelvedata",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.morpheus_SUPABASE_URL || "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_morpheus_SUPABASE_ANON_KEY || "",
  neoRpcUrl: process.env.NEO_RPC_URL || defaultNeoRpcUrl,
  neoXRpcUrl: process.env.NEOX_RPC_URL || defaultNeoXRpcUrl,
  neoXChainId: process.env.NEOX_CHAIN_ID || defaultNeoXChainId,
};
