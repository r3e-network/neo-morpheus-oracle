export const BUILTIN_FUNCTIONS = [
  {
    name: "hash.sha256",
    category: "Hash",
    desc: "Hashes any JSON-serializable payload with SHA-256.",
    params: "input: any",
    example: "const digest = await morpheus.hash.sha256({ data: '...' });"
  },
  {
    name: "hash.keccak256",
    category: "Hash",
    desc: "Hashes any JSON-serializable payload with Keccak-256.",
    params: "input: any",
    example: "const digest = await morpheus.hash.keccak256({ data: '...' });"
  },
  {
    name: "crypto.rsa_verify",
    category: "Crypto",
    desc: "Verifies an RSA-SHA256 signature (computationally efficient in TEE).",
    params: "public_key: string, signature: string, payload: string",
    example: "const isValid = await morpheus.crypto.rsa_verify(input);"
  },
  {
    name: "math.modexp",
    category: "Math",
    desc: "Performs big integer modular exponentiation.",
    params: "base: string, exponent: string, modulus: string",
    example: "const result = await morpheus.math.modexp({ base: '2', exponent: '10', modulus: '100' });"
  },
  {
    name: "math.polynomial",
    category: "Math",
    desc: "Evaluates a polynomial of arbitrary degree.",
    params: "coefficients: string[], x: string, modulus?: string",
    example: "const y = await morpheus.math.polynomial({ coefficients: ['1', '0', '1'], x: '2' });"
  },
  {
    name: "matrix.multiply",
    category: "Linear Algebra",
    desc: "Multiplies two dense matrices.",
    params: "left: number[][], right: number[][]",
    example: "const matrix = await morpheus.matrix.multiply({ left: [[1,2]], right: [[3],[4]] });"
  },
  {
    name: "vector.cosine_similarity",
    category: "Linear Algebra",
    desc: "Computes cosine similarity between two vectors.",
    params: "left: number[], right: number[]",
    example: "const sim = await morpheus.vector.cosine_similarity({ left: [1,0], right: [0,1] });"
  },
  {
    name: "merkle.root",
    category: "Merkle",
    desc: "Builds a SHA-256 Merkle root from a list of leaves.",
    params: "leaves: string[]",
    example: "const root = await morpheus.merkle.root({ leaves: ['a', 'b', 'c'] });"
  },
  {
    name: "zkp.public_signal_hash",
    category: "ZKP",
    desc: "Computes a deterministic digest over public signals.",
    params: "circuit_id: string, signals: any[]",
    example: "const hash = await morpheus.zkp.public_signal_hash({ circuit_id: '...', signals: [] });"
  },
  {
    name: "privacy.mask",
    category: "Privacy",
    desc: "Masks a sensitive string, leaving edges visible.",
    params: "value: string, unmasked_left: number, unmasked_right: number",
    example: "const masked = await morpheus.privacy.mask({ value: 'secret_key', unmasked_left: 2, unmasked_right: 2 });"
  },
  {
    name: "privacy.add_noise",
    category: "Privacy",
    desc: "Adds simulated Laplace noise for differential privacy.",
    params: "value: number, scale: number",
    example: "const noisy = await morpheus.privacy.add_noise({ value: 100, scale: 1.0 });"
  }
];

export const AUTOMATION_PATTERNS = [
  {
    title: "Price Threshold Trigger",
    desc: "Execute a contract call when a specific asset price crosses a defined limit.",
    trigger: "PriceFeed (On-chain)",
    steps: [
      "1. TEE periodically fetches Price from TwelveData",
      "2. Compares with on-chain threshold",
      "3. Executes transaction if condition is met"
    ],
    config: {
      type: "price_threshold",
      pair: "NEO-USD",
      operator: "lt",
      value: "15.00"
    }
  },
  {
    title: "Scheduled Maintenance",
    desc: "Run a task every fixed number of blocks (e.g., rebalancing, daily payouts).",
    trigger: "Block Interval",
    steps: [
      "1. Relayer tracks block height",
      "2. Triggers Morpheus job every N blocks",
      "3. TEE executes and signs result"
    ],
    config: {
      type: "interval",
      interval_blocks: 1000
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
  neo_x: `// Neo X (Solidity) Example
interface IMorpheusDataFeed {
    function latestPrice(string calldata pair) external view returns (int256, uint256);
}

contract DeFiApp {
    function checkPrice(string memory pair) public view returns (int256) {
        (int256 price, ) = IMorpheusDataFeed(0x2E35...).latestPrice(pair);
        return price;
    }
}`,
  neo_n3: `// Neo N3 (C#) Example
[ContractHash("0x03013f49c42a14546c8bbe58f9d434c3517fccab")]
public class MorpheusFeed {
    public static extern Map GetLatestPrice(string pair);
}

public class MyContract : SmartContract {
    public static void Execute() {
        var result = (Map)MorpheusFeed.GetLatestPrice("NEO-USD");
        BigInteger price = (BigInteger)result["price"];
    }
}`
};
