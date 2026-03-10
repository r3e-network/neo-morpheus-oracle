import testnet from "../../../config/networks/testnet.json";
import mainnet from "../../../config/networks/mainnet.json";

export const networkRegistry = {
  testnet,
  mainnet,
} as const;

export function getSelectedNetwork() {
  const selectedEnv = process.env.NEXT_PUBLIC_MORPHEUS_NETWORK || process.env.MORPHEUS_NETWORK || "testnet";
  const selected = selectedEnv === "mainnet" ? "mainnet" : "testnet";
  return networkRegistry[selected];
}
