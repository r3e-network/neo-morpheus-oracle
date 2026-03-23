import {
  RpcClient as CoreRpcClient,
  Signer as CoreSigner,
  WitnessScope,
  bytesToHex,
  deserialize,
  gasContractHash,
  hexToBytes,
  mainNetworkId,
  neoContractHash,
  oracleContractHash,
  policyContractHash,
  testNetworkId,
} from "@r3e/neo-js-sdk";
import { Account as BrowserAccount } from "@r3e/neo-js-sdk/wallet/browser";
import { ContractParam } from "@r3e/neo-js-sdk/compat/contract-param";
import { HexString } from "@r3e/neo-js-sdk/compat/u";
import { createScript, ScriptBuilder } from "@r3e/neo-js-sdk/compat/sc";
import { Transaction as BaseTransaction, Witness } from "@r3e/neo-js-sdk/compat/tx";
import {
  getAddressFromScriptHash,
  getPrivateKeyFromWIF,
  getScriptHashFromAddress,
  getWIFFromPrivateKey,
  isAddress,
  isPrivateKey,
  isPublicKey,
  isWIF,
  publicKeyFromPrivateKey,
  randomPrivateKeyHex,
  signHex,
  verifyHex,
} from "@r3e/neo-js-sdk/compat/wallet-helpers";
import { hash160, reverseHex } from "@r3e/neo-js-sdk";

const CONTRACT_MANAGEMENT_HASH = "0xfffdc93764dbaddd97c48f252a53ea4643faa3fd";

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function strip0x(value) {
  return trimString(value).replace(/^0x/i, "");
}

function normalizeHash(value) {
  const raw = trimString(String(value ?? ""));
  if (!raw) return raw;
  return raw.startsWith("0x") ? raw : `0x${raw}`;
}

function normalizeSignerAccount(account) {
  return strip0x(String(account ?? ""));
}

function normalizeParam(param) {
  if (param && typeof param?.toJSON === "function") return param.toJSON();
  if (param && typeof param?.toJson === "function") return param.toJson();
  return param;
}

function normalizeParams(params = []) {
  return params.map((param) => normalizeParam(param));
}

function normalizeSigners(signers = []) {
  return signers.map((signer) => {
    if (signer instanceof CoreSigner && typeof signer.toJSON === "function") {
      const json = signer.toJSON();
      return {
        ...json,
        account: normalizeSignerAccount(json.account),
      };
    }
    return {
      ...signer,
      account: normalizeSignerAccount(signer.account),
    };
  });
}

function defaultSigners(account) {
  if (!account) return [];
  return [{ account: account.scriptHash, scopes: "CalledByEntry" }];
}

function resolveSigningKey(account) {
  if (!account) throw new Error("account is required");
  return account.WIF || account.privateKey;
}

function buildFeeProbeWitness(account) {
  const verificationScript = account?.contract?.script
    ? Buffer.from(account.contract.script, "base64").toString("hex")
    : `21${String(account.publicKey)}ac`;
  return new Witness({
    invocationScript: `0c40${"00".repeat(64)}`,
    verificationScript,
  });
}

async function estimateNetworkFee(rpcClient, transaction, account) {
  try {
    const probe = Transaction.deserialize(transaction.serialize(true));
    probe.witnesses = probe.signers.map((signer) =>
      normalizeSignerAccount(signer.account) === normalizeSignerAccount(account.scriptHash)
        ? buildFeeProbeWitness(account)
        : new Witness({ invocationScript: "", verificationScript: "" }),
    );
    const result = await rpcClient.inner.calculateNetworkFee({ tx: probe.serialize(true) });
    return BigInt(result?.networkfee || 0);
  } catch {
    return 5000000n;
  }
}

function resolveScriptHex(value) {
  if (value instanceof HexString) return value.toBigEndian();
  const text = trimString(String(value ?? ""));
  if (!text) return "";
  if (/^(0x)?[0-9a-f]+$/i.test(text)) return strip0x(text);
  return Buffer.from(text, "base64").toString("hex");
}

class Query {
  constructor({ method, params = [] } = {}) {
    this.method = method;
    this.params = params;
  }
}

class CompatAccount extends BrowserAccount {
  static fromWIF(wif) {
    return new CompatAccount(wif);
  }

  static createMultiSig(signingThreshold, publicKeys) {
    const base = BrowserAccount.createMultiSig(signingThreshold, publicKeys);
    return new CompatAccount({
      address: base.address,
      contract: base.contract,
    });
  }

  get publicKey() {
    const value = super.publicKey;
    return typeof value?.toString === "function" ? value.toString() : value;
  }
}

class RPCClient {
  constructor(rpcAddress) {
    this.inner = new CoreRpcClient(rpcAddress);
  }

  async send(method, params = []) {
    return this.inner.send(method, params);
  }

  async execute(query) {
    return this.send(query.method, query.params);
  }

  async getApplicationLog(txid, trigger) {
    return this.inner.getApplicationLog({ hash: normalizeHash(txid), trigger });
  }

  async getBlockCount() {
    return this.inner.getBlockCount();
  }

  async getVersion() {
    return this.inner.getVersion();
  }

  async invokeFunction(scriptHash, operation, args = [], signers = undefined) {
    const params = [normalizeHash(scriptHash), operation, normalizeParams(args)];
    if (Array.isArray(signers) && signers.length > 0) {
      params.push(normalizeSigners(signers));
    }
    return this.inner.send("invokefunction", params);
  }

  async invokeScript(script, signers = undefined) {
    const params = [resolveScriptHex(script)];
    if (Array.isArray(signers) && signers.length > 0) {
      params.push(normalizeSigners(signers));
    }
    return this.inner.send("invokescript", params);
  }

  async sendRawTransaction(input) {
    const tx =
      typeof input === "string"
        ? input
        : typeof input?.serialize === "function"
          ? input.serialize(true)
          : input?.tx;
    return this.inner.sendRawTransaction({ tx });
  }
}

class Transaction extends BaseTransaction {
  static deserialize(value) {
    const raw = trimString(String(value ?? ""));
    if (!raw) throw new Error("transaction payload required");
    if (/^(0x)?[0-9a-f]+$/i.test(raw) && strip0x(raw).length % 2 === 0) {
      return BaseTransaction.deserialize(strip0x(raw));
    }
    return BaseTransaction.deserialize(Buffer.from(raw, "base64").toString("hex"));
  }
}

class NefFileCompat {
  constructor(bytes) {
    this.bytes = Buffer.from(bytes);
  }

  static fromBuffer(bytes) {
    return new NefFileCompat(bytes);
  }

  serialize() {
    return this.bytes.toString("hex");
  }
}

class ContractManifestCompat {
  constructor(json) {
    this.json = json;
  }

  static fromJson(json) {
    return new ContractManifestCompat(json);
  }

  toJson() {
    return this.json;
  }
}

class SmartContract {
  constructor(scriptHash, { rpcAddress, networkMagic, account } = {}) {
    this.scriptHash = normalizeHash(String(scriptHash ?? ""));
    this.rpcAddress = rpcAddress;
    this.networkMagic = Number(networkMagic || testNetworkId());
    this.account = account || null;
    this.rpc = new RPCClient(rpcAddress);
  }

  async testInvoke(operation, params = [], signers = undefined) {
    const invokeSigners =
      Array.isArray(signers) && signers.length > 0 ? normalizeSigners(signers) : defaultSigners(this.account);
    return this.rpc.invokeFunction(this.scriptHash, operation, params, invokeSigners);
  }

  async invoke(operation, params = [], signers = undefined) {
    const invokeSigners =
      Array.isArray(signers) && signers.length > 0 ? normalizeSigners(signers) : defaultSigners(this.account);
    const preview = await this.rpc.invokeFunction(this.scriptHash, operation, params, invokeSigners);
    if (String(preview?.state || "").toUpperCase() === "FAULT") {
      throw new Error(preview?.exception || `${operation} preview failed`);
    }
    if (!preview?.script) {
      throw new Error(`${operation} preview did not return a script`);
    }
    const currentHeight = await this.rpc.getBlockCount();
    const tx = new Transaction({
      signers: invokeSigners,
      validUntilBlock: currentHeight + 100,
      script: Buffer.from(preview.script, "base64").toString("hex"),
      systemFee: BigInt(Math.ceil(Number(preview.gasconsumed || 0) * 1.5)),
      networkFee: 0n,
    });
    tx.networkFee = await estimateNetworkFee(this.rpc, tx, this.account);
    tx.sign(resolveSigningKey(this.account), this.networkMagic);
    const result = await this.rpc.sendRawTransaction(tx);
    return typeof result === "string" ? result : result?.hash;
  }
}

async function deployContract(nef, manifest, config = {}) {
  const account = config.account;
  const rpcClient = new RPCClient(config.rpcAddress);
  const signers = defaultSigners(account);
  const nefBytes =
    nef?.bytes instanceof Uint8Array || Buffer.isBuffer(nef?.bytes)
      ? Buffer.from(nef.bytes)
      : Buffer.from(strip0x(typeof nef?.serialize === "function" ? nef.serialize() : String(nef || "")), "hex");
  const manifestJson =
    typeof manifest?.toJson === "function"
      ? manifest.toJson()
      : typeof manifest?.toJSON === "function"
        ? manifest.toJSON()
        : manifest;
  const preview = await rpcClient.invokeFunction(
    CONTRACT_MANAGEMENT_HASH,
    "deploy",
    [
      { type: "ByteArray", value: nefBytes.toString("base64") },
      { type: "String", value: JSON.stringify(manifestJson) },
    ],
    signers,
  );
  if (String(preview?.state || "").toUpperCase() === "FAULT") {
    throw new Error(preview?.exception || "deploy preview failed");
  }
  if (!preview?.script) {
    throw new Error("deploy preview did not return a script");
  }
  const currentHeight = await rpcClient.getBlockCount();
  const tx = new Transaction({
    signers,
    validUntilBlock: currentHeight + 100,
    script: Buffer.from(preview.script, "base64").toString("hex"),
    systemFee: BigInt(Math.ceil(Number(preview.gasconsumed || 0) * 1.5)),
    networkFee: 0n,
  });
  tx.networkFee = await estimateNetworkFee(rpcClient, tx, account);
  tx.sign(resolveSigningKey(account), Number(config.networkMagic || testNetworkId()));
  const result = await rpcClient.sendRawTransaction(tx);
  return typeof result === "string" ? result : result?.hash;
}

const wallet = {
  Account: CompatAccount,
  getAddressFromScriptHash,
  getScriptHashFromAddress,
  getPrivateKeyFromWIF,
  getWIFFromPrivateKey,
  getPublicKeyFromPrivateKey: publicKeyFromPrivateKey,
  isAddress,
  isWIF,
  isPrivateKey,
  isPublicKey,
  sign: signHex,
  generateSignature: signHex,
  generatePrivateKey: randomPrivateKeyHex,
  verify: verifyHex,
};

ContractParam.bool = ContractParam.boolean;

const sc = {
  ContractParam,
  ScriptBuilder,
  createScript,
  NEF: NefFileCompat,
  ContractManifest: ContractManifestCompat,
};

const u = {
  HexString,
  reverseHex,
  hash160,
  BigInteger: {
    fromNumber(value) {
      return BigInt(Math.trunc(Number(value)));
    },
    fromString(value) {
      return BigInt(String(value));
    },
  },
};

const tx = {
  Transaction,
  Witness,
  Signer: CoreSigner,
  WitnessScope,
};

const experimental = {
  SmartContract,
  deployContract,
};

const rpc = {
  RPCClient,
  Query,
};

const CONST = {
  MAGIC_NUMBER: {
    TestNet: testNetworkId(),
    MainNet: mainNetworkId(),
  },
  NATIVE_CONTRACT_HASH: {
    GasToken: gasContractHash().toString(),
    NeoToken: neoContractHash().toString(),
    OracleContract: oracleContractHash().toString(),
    PolicyContract: policyContractHash().toString(),
    ManagementContract: CONTRACT_MANAGEMENT_HASH,
  },
};

export { CONST, experimental, rpc, sc, tx, u, wallet };
export default { CONST, experimental, rpc, sc, tx, u, wallet };
