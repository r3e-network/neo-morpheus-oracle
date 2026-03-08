import testnet from "../../../config/networks/testnet.json";
import mainnet from "../../../config/networks/mainnet.json";

export const networkRegistry = {
  testnet,
  mainnet,
} as const;

export function getSelectedNetwork() {
  const selected = process.env.NEXT_PUBLIC_MORPHEUS_NETWORK === "mainnet" ? "mainnet" : "testnet";
  return networkRegistry[selected];
}
