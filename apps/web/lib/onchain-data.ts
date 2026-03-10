import { ethers } from "ethers";

export const DEFAULT_PAIRS = [
  "NEO-USD", "GAS-USD", "FLM-USD", "BTC-USD", 
  "ETH-USD", "SOL-USD", "TRX-USD", "PAXG-USD", 
  "WTI-USD", "USDT-USD", "USDC-USD", "BNB-USD", 
  "XRP-USD", "DOGE-USD"
];

export const NETWORKS = {
  neo_x: {
    name: "Neo X (Soon)",
    rpc: "https://mainnet-2.rpc.banelabs.org",
    datafeed: "",
    explorer: "https://xexplorer.neo.org/address/",
  },
  neo_n3: {
    name: "Neo N3 Mainnet",
    rpc: "https://mainnet1.neo.coz.io:443",
    datafeed: "0x03013f49c42a14546c8bbe58f9d434c3517fccab",
    explorer: "https://neotube.io/contract/",
  }
};

const EVM_DATAFEED_ABI = ["function latestPrice(string pair) view returns (int256, uint256)"];

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
      price: (Number(price) / 100).toFixed(2),
      timestamp: Number(timestamp) * 1000,
      pair,
      network: "Neo X",
      contractLink: `${NETWORKS.neo_x.explorer}${NETWORKS.neo_x.datafeed}`
    };
  } catch { return null; }
}

export async function fetchNeoN3Price(pair: string): Promise<OnChainPrice | null> {
  try {
    const encodedPair = typeof window !== 'undefined' ? window.btoa(pair) : Buffer.from(pair).toString('base64');
    const url = `https://api.n3index.dev/rest/v1/contract_notifications?network=eq.mainnet&contract_hash=eq.${NETWORKS.neo_n3.datafeed}&event_name=eq.FeedUpdated&state_json->value->0->>value=eq.${encodedPair}&limit=1&order=block_index.desc`;
    const response = await fetch(url, { headers: { "Accept": "application/json" }});
    const body = await response.json();
    
    if (body && body.length > 0) {
      const stateArray = body[0].state_json.value;
      const priceItem = stateArray[2];
      const tsItem = stateArray[3];
      
      return {
        price: (Number(priceItem.value) / 100).toFixed(2),
        timestamp: Number(tsItem.value) * 1000,
        pair,
        network: "Neo N3",
        contractLink: `${NETWORKS.neo_n3.explorer}${NETWORKS.neo_n3.datafeed}`
      };
    }
    return null;
  } catch { return null; }
}
