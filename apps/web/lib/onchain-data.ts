import { ethers } from 'ethers';
import { DEFAULT_FEED_SYMBOLS, getFeedDisplaySymbol, normalizeFeedSymbol } from './feed-defaults';
import { getSelectedNetwork, getSelectedNetworkKey } from './networks';

export const DEFAULT_PAIRS = [...DEFAULT_FEED_SYMBOLS];
const selectedNetwork = getSelectedNetwork();
export const SELECTED_NETWORK = selectedNetwork;
export const SELECTED_NETWORK_KEY = getSelectedNetworkKey();
export const SELECTED_NETWORK_LABEL = SELECTED_NETWORK_KEY === 'mainnet' ? 'Mainnet' : 'Testnet';
export const NETWORKS = {
  selected: {
    key: SELECTED_NETWORK_KEY,
    label: SELECTED_NETWORK_LABEL,
    phalaApiUrl: selectedNetwork.phala?.public_api_url || '',
    phalaCvmId: selectedNetwork.phala?.cvm_id || '',
  },
  neo_x: {
    name: selectedNetwork.network === 'mainnet' ? 'Neo X Mainnet' : 'Neo X Testnet',
    rpc: selectedNetwork.neo_x?.rpc_url || '',
    oracle: selectedNetwork.neo_x?.contracts?.morpheus_oracle_x || '',
    datafeed: selectedNetwork.neo_x?.contracts?.morpheus_datafeed_x || '',
    explorer:
      selectedNetwork.network === 'mainnet'
        ? 'https://xexplorer.neo.org/address/'
        : 'https://xt4scan.ngd.network/address/',
    domains: {
      oracle: '',
      datafeed: '',
      aa: '',
      neodid: '',
    },
  },
  neo_n3: {
    name: selectedNetwork.network === 'mainnet' ? 'Neo N3 Mainnet' : 'Neo N3 Testnet',
    networkKey: SELECTED_NETWORK_KEY,
    environmentLabel: SELECTED_NETWORK_LABEL,
    rpc: selectedNetwork.neo_n3?.rpc_url || '',
    oracle: selectedNetwork.neo_n3?.contracts?.morpheus_oracle || '',
    callbackConsumer: selectedNetwork.neo_n3?.contracts?.oracle_callback_consumer || '',
    datafeed: selectedNetwork.neo_n3?.contracts?.morpheus_datafeed || '',
    aa: selectedNetwork.neo_n3?.contracts?.abstract_account || '',
    neodid: selectedNetwork.neo_n3?.contracts?.morpheus_neodid || '',
    exampleConsumer: selectedNetwork.neo_n3?.examples?.oracle_callback_consumer || '',
    exampleFeedReader: selectedNetwork.neo_n3?.examples?.feed_reader || '',
    phalaApiUrl: selectedNetwork.phala?.public_api_url || '',
    phalaCvmId: selectedNetwork.phala?.cvm_id || '',
    explorer:
      selectedNetwork.network === 'mainnet'
        ? 'https://neotube.io/contract/'
        : 'https://testnet.neotube.io/contract/',
    domains: {
      oracle: selectedNetwork.neo_n3?.domains?.morpheus_oracle || '',
      datafeed: selectedNetwork.neo_n3?.domains?.morpheus_datafeed || '',
      aa: selectedNetwork.neo_n3?.domains?.morpheus_aa || '',
      neodid: selectedNetwork.neo_n3?.domains?.morpheus_neodid || '',
    },
  },
};

const EVM_DATAFEED_ABI = ['function latestPrice(string pair) view returns (int256, uint256)'];
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
      network: 'Neo X',
      contractLink: `${NETWORKS.neo_x.explorer}${NETWORKS.neo_x.datafeed}`,
    };
  } catch {
    return null;
  }
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
      const n3IndexNetwork = selectedNetwork.network === 'mainnet' ? 'mainnet' : 'testnet';
      const url = `https://api.n3index.dev/rest/v1/contract_notifications?network=eq.${n3IndexNetwork}&contract_hash=eq.${NETWORKS.neo_n3.datafeed}&event_name=eq.FeedUpdated&limit=100&order=block_index.desc`;
      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      body = await response.json();
      n3IndexCache = body;
      n3IndexCacheTime = now;
    }

    if (body && Array.isArray(body)) {
      const event = body.find((b: any) => {
        const pairB64 = b.state_json?.value?.[0]?.value;
        if (!pairB64) return false;

        let decoded = '';
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
          network: 'Neo N3',
          contractLink: `${NETWORKS.neo_n3.explorer}${NETWORKS.neo_n3.datafeed}`,
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}
