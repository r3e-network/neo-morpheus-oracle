export const appConfig = {
  name: process.env.NEXT_PUBLIC_APP_NAME || "Morpheus Oracle",
  appUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  phalaApiUrl: process.env.PHALA_API_URL || "",
  phalaToken: process.env.PHALA_API_TOKEN || process.env.PHALA_SHARED_SECRET || "",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.morpheus_SUPABASE_URL || "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_morpheus_SUPABASE_ANON_KEY || "",
  neoRpcUrl: process.env.NEO_RPC_URL || "https://testnet1.neo.coz.io:443",
  neoXRpcUrl: process.env.NEOX_RPC_URL || "https://neoxt4seed1.ngd.network",
  neoXChainId: process.env.NEOX_CHAIN_ID || "12227332",
};
