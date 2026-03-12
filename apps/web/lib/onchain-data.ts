import { ethers } from "ethers";
import { DEFAULT_FEED_SYMBOLS, getFeedDisplaySymbol, normalizeFeedSymbol } from "./feed-defaults";

export const DEFAULT_PAIRS = [...DEFAULT_FEED_SYMBOLS];

export const NETWORKS = {
  neo_x: {
    name: "Neo X (Reference Only)",
    rpc: "https://mainnet-2.rpc.banelabs.org",
    oracle: "",
    datafeed: "",
    explorer: "https://xexplorer.neo.org/address/",
    domains: {
      oracle: "",
      datafeed: "",
    },
  },
  neo_n3: {
    name: "Neo N3 Mainnet",
    rpc: "https://mainnet1.neo.coz.io:443",
    oracle: "0x017520f068fd602082fe5572596185e62a4ad991",
    datafeed: "0x03013f49c42a14546c8bbe58f9d434c3517fccab",
    explorer: "https://neotube.io/contract/",
    domains: {
      oracle: "oracle.morpheus.neo",
      datafeed: "pricefeed.morpheus.neo",
    },
  }
};

const EVM_DATAFEED_ABI = ["function latestPrice(string pair) view returns (int256, uint256)"];
const PRICE_SCALE = 1_000_000;
const PRICE_SCALE_DECIMALS = 6;

export interface OnChainPrice {
  price: string;
  timestamp: number;
  pair: string;
  network: string;
  contractLink: string;
}

export async function fetchNeoXPrice(pair: string): Promise<OnChainPrice | null> {
  if (!NETWORKS.neo_x.datafeed) return null;
  try {
    const provider = new ethers.JsonRpcProvider(NETWORKS.neo_x.rpc);
    const contract = new ethers.Contract(NETWORKS.neo_x.datafeed, EVM_DATAFEED_ABI, provider);
    const [price, timestamp] = await contract.latestPrice(pair);
    return {
      price: (Number(price) / PRICE_SCALE).toFixed(PRICE_SCALE_DECIMALS),
      timestamp: Number(timestamp) * 1000,
      pair,
      network: "Neo X",
      contractLink: `${NETWORKS.neo_x.explorer}${NETWORKS.neo_x.datafeed}`
    };
  } catch { return null; }
}

let n3IndexCache: any = null;
let n3IndexCacheTime = 0;

export async function fetchNeoN3Price(pair: string): Promise<OnChainPrice | null> {
  try {
    const canonicalPair = normalizeFeedSymbol(pair);
    const now = Date.now();
    let body = n3IndexCache;

    // Cache for 10 seconds to deduplicate the 14 parallel frontend fetch calls
    if (!body || now - n3IndexCacheTime > 10000) {
      const url = `https://api.n3index.dev/rest/v1/contract_notifications?network=eq.mainnet&contract_hash=eq.${NETWORKS.neo_n3.datafeed}&event_name=eq.FeedUpdated&limit=100&order=block_index.desc`;
      const response = await fetch(url, { headers: { "Accept": "application/json" }});
      body = await response.json();
      n3IndexCache = body;
      n3IndexCacheTime = now;
    }
    
    if (body && Array.isArray(body)) {
      const event = body.find((b: any) => {
        const pairB64 = b.state_json?.value?.[0]?.value;
        if (!pairB64) return false;
        
        let decoded = "";
        if (typeof window !== 'undefined') {
          decoded = window.atob(pairB64);
        } else {
          decoded = Buffer.from(pairB64, 'base64').toString('utf8');
        }
        
        return normalizeFeedSymbol(decoded) === canonicalPair;
      });

      if (event) {
        const stateArray = event.state_json.value;
        const priceItem = stateArray[2];
        const tsItem = stateArray[3];
        
        return {
          price: (Number(priceItem.value) / PRICE_SCALE).toFixed(PRICE_SCALE_DECIMALS),
          timestamp: Number(tsItem.value) * 1000,
          pair: getFeedDisplaySymbol(canonicalPair),
          network: "Neo N3",
          contractLink: `${NETWORKS.neo_n3.explorer}${NETWORKS.neo_n3.datafeed}`
        };
      }
    }
    return null;
  } catch { return null; }
}
