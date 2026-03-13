import testnet from "../../../config/networks/testnet.json";
import mainnet from "../../../config/networks/mainnet.json";

export const networkRegistry = {
  testnet,
  mainnet,
} as const;

export function resolveSelectedNetworkKey(selectedEnv?: string | null) {
  return selectedEnv === "mainnet" ? "mainnet" : "testnet";
}

export function getSelectedNetwork() {
  const selectedEnv = process.env.NEXT_PUBLIC_MORPHEUS_NETWORK || process.env.MORPHEUS_NETWORK || "mainnet";
  const selected = resolveSelectedNetworkKey(selectedEnv);
  return networkRegistry[selected];
}

export function getSelectedNetworkKey() {
  const selectedEnv = process.env.NEXT_PUBLIC_MORPHEUS_NETWORK || process.env.MORPHEUS_NETWORK || "mainnet";
  return resolveSelectedNetworkKey(selectedEnv);
}
