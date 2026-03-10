import { ethers } from "ethers";

export const DEFAULT_PAIRS = ["NEO-USD", "GAS-USD", "BTC-USD", "ETH-USD", "BNB-USD"];

export const NETWORKS = {
  neo_x: {
    name: "Neo X Testnet",
    rpc: "https://neoxt4seed1.ngd.network",
    datafeed: "0x2E35a79BEA7808EBb8B72279cB34c1A73F80339C",
    explorer: "https://xt4scan.ngd.network/address/",
  },
  neo_n3: {
    name: "Neo N3 Testnet",
    rpc: "https://testnet1.neo.coz.io:443",
    datafeed: "0x9bea75cf702f6afc09125aa6d22f082bfd2ee064",
    explorer: "https://testnet.neotube.io/contract/",
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
    const response = await fetch(NETWORKS.neo_n3.rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "invokefunction",
        params: [NETWORKS.neo_n3.datafeed, "getLatestPrice", [{ type: "String", value: pair }]]
      })
    });
    const body = await response.json();
    if (body.result?.state === "HALT") {
      const stack = body.result.stack[0];
      if (stack.type === "Map") {
        const priceItem = stack.value.find((v: any) => atob(v.key.value) === "price");
        const tsItem = stack.value.find((v: any) => atob(v.key.value) === "timestamp");
        return {
          price: (Number(priceItem.value.value) / 100).toFixed(2),
          timestamp: Number(tsItem.value.value),
          pair,
          network: "Neo N3",
          contractLink: `${NETWORKS.neo_n3.explorer}${NETWORKS.neo_n3.datafeed}`
        };
      }
    }
    return null;
  } catch { return null; }
}
