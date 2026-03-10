export const BUILTIN_FUNCTIONS = [
  {
    name: "morpheus.http_request",
    category: "Networking",
    desc: "Performs a secure outbound HTTP call. The TEE handles TLS termination, ensuring zero-visibility for nodes.",
    params: "url: string, config?: RequestConfig",
    example: "const response = await morpheus.http_request('https://api.gold.com/price');"
  },
  {
    name: "morpheus.get_vrf_random",
    category: "Entropy",
    desc: "Generates a cryptographically secure random number tied to the TEE hardware entropy source.",
    params: "seed?: string",
    example: "const { random_value, proof } = await morpheus.get_vrf_random();"
  },
  {
    name: "morpheus.sign_neo",
    category: "Chains",
    desc: "Signs a payload using the TEE's private identity for Neo N3. Compatible with contract verification.",
    params: "tx_data: any",
    example: "const signature = await morpheus.sign_neo({ intent: 'withdraw', amount: 100 });"
  },
  {
    name: "morpheus.aes_encrypt",
    category: "Privacy",
    desc: "Uses the instance-specific hardware key to encrypt temporary state for off-chain storage.",
    params: "data: string | Uint8Array",
    example: "const encrypted = morpheus.aes_encrypt(sensitive_results);"
  }
];

export const AUTOMATION_PATTERNS = [
  {
    title: "Price-Based Liquidation",
    desc: "Monitor Neo X prices and trigger a contract call if a collateral ratio falls below 150%.",
    trigger: "Condition: Price < Threshold",
    steps: [
      "1. TEE periodically fetches NEO-USD from TwelveData",
      "2. Compares with on-chain user debt",
      "3. If condition met, signs a liquidation transaction"
    ],
    config: {
      type: "automation",
      trigger: "pricefeed",
      pair: "NEO-USD",
      threshold: "12.50",
      action: "contract_call"
    }
  },
  {
    title: "Scheduled Rebalancing",
    desc: "Automatically adjust portfolio weights across Neo N3 every 24 hours (approx. 5760 blocks).",
    trigger: "Block Interval: 5760",
    steps: [
      "1. Relayer triggers worker every 5760 blocks",
      "2. TEE calculates optimal weights",
      "3. Executes swaps on NeoBurger or Flamingo"
    ],
    config: {
      type: "automation",
      trigger: "interval",
      blocks: 5760,
      action: "portfolio_sync"
    }
  }
];

export const SECURITY_CONCEPTS = [
  {
    title: "Remote Attestation",
    desc: "The process by which a user verifies that the Oracle code is running on genuine Intel SGX hardware without tampering."
  },
  {
    title: "RSA-OAEP Encryption",
    desc: "Morpheus uses 2048-bit RSA with Optimal Asymmetric Encryption Padding to protect user inputs before they leave the browser."
  },
  {
    title: "Instance Key Isolation",
    desc: "Each TEE worker generates a unique ephemeral key pair that never leaves the hardware enclave."
  }
];

export const CONTRACT_EXAMPLES = {
  neo_x: `// Neo X (Solidity) - Direct Consumption
// Address: 0x2E35a79BEA7808EBb8B72279cB34c1A73F80339C
interface IMorpheusDataFeed {
    function latestPrice(string calldata pair) external view returns (int256 price, uint256 timestamp);
}

contract PriceConsumer {
    function getNeoPrice() public view returns (int256) {
        (int256 price, ) = IMorpheusDataFeed(0x2E35...).latestPrice("NEO-USD");
        return price;
    }
}`,
  neo_n3: `// Neo N3 (C#) - Oracle Callback Integration
// Hash: 0x4b882e94ed766807c4fd728768f972e13008ad52
public class MyContract : SmartContract {
    public static void RequestData() {
        // High-level request to Morpheus Oracle
        Oracle.Request("https://api.com", "price", "callback", null, 1000000);
    }

    public static void OnCallback(string url, string userdata, int code, byte[] result) {
        // TEE-Verified result arrives here
    }
}`
};
