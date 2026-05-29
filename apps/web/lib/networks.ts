import testnet from '../../../config/networks/testnet.json';
import mainnet from '../../../config/networks/mainnet.json';

export const networkRegistry = {
  testnet,
  mainnet,
} as const;

export function resolveSelectedNetworkKey(selectedEnv?: string | null) {
  return selectedEnv === 'mainnet' ? 'mainnet' : 'testnet';
}

function readSelectedEnv() {
  return process.env.NEXT_PUBLIC_MORPHEUS_NETWORK || process.env.MORPHEUS_NETWORK || 'mainnet';
}

export function getSelectedNetwork() {
  const selected = resolveSelectedNetworkKey(readSelectedEnv());
  return networkRegistry[selected];
}

export function getSelectedNetworkKey() {
  return resolveSelectedNetworkKey(readSelectedEnv());
}
