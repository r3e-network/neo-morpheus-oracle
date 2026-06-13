import { trimString } from '@neo-morpheus-oracle/shared/utils';
import testnet from '../../../config/networks/testnet.json';
import mainnet from '../../../config/networks/mainnet.json';

export const networkRegistry = {
  testnet,
  mainnet,
} as const;

export type NetworkKey = keyof typeof networkRegistry;

export function normalizeNetworkKey(value?: string | null): NetworkKey | null {
  const normalized = trimString(value).toLowerCase();
  return normalized === 'mainnet' || normalized === 'testnet' ? normalized : null;
}

export function isKnownNetworkKey(value?: string | null) {
  return normalizeNetworkKey(value) !== null;
}

export function resolveSelectedNetworkKey(selectedEnv?: string | null) {
  return normalizeNetworkKey(selectedEnv) === 'mainnet' ? 'mainnet' : 'testnet';
}

function readSelectedEnv() {
  const raw =
    trimString(process.env.NEXT_PUBLIC_MORPHEUS_NETWORK) ||
    trimString(process.env.MORPHEUS_NETWORK);
  if (!raw) return 'mainnet';
  const normalized = normalizeNetworkKey(raw);
  if (!normalized) {
    // Fail fast: a typo like MORPHEUS_NETWORK=mainet must not silently select
    // testnet on what the operator believes is a mainnet deployment.
    throw new Error(
      `Invalid MORPHEUS_NETWORK/NEXT_PUBLIC_MORPHEUS_NETWORK value "${raw}"; expected "mainnet" or "testnet"`
    );
  }
  return normalized;
}

export function getSelectedNetwork(networkOverride?: string | null) {
  const selected = resolveSelectedNetworkKey(networkOverride || readSelectedEnv());
  return networkRegistry[selected];
}

export function getSelectedNetworkKey(networkOverride?: string | null) {
  return resolveSelectedNetworkKey(networkOverride || readSelectedEnv());
}
