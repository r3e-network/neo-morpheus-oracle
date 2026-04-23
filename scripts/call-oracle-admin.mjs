#!/usr/bin/env node
/**
 * Call setUpdater and setOracleVerificationPublicKey on the MorpheusOracle contract
 * using the CVM's derived worker key (on-chain admin) via sign/payload endpoint.
 *
 * Usage:
 *   node scripts/call-oracle-admin.mjs [--network mainnet|testnet] [--dry-run]
 */

import neon from '@cityofzion/neon-js';
import crypto from 'crypto';

const CVM_URL = process.env.PHALA_CVM_URL || 'https://ddff154546fe22d15b65667156dd4b7c611e6093-3000.dstack-pha-prod5.phala.network';
const AUTH_TOKEN = process.env.PHALA_API_TOKEN || '';
const ORACLE_CONTRACT = process.env.ORACLE_CONTRACT || '0x5b492098fc094c760402e01f7e0b631b939d2bea';
const RPC_URL = process.env.NEO_RPC_URL || 'https://mainnet2.neo.coz.io:443';
const NETWORK_MAGIC = parseInt(process.env.NEO_NETWORK_MAGIC || '860833102');

// New updater address (script hash)
const NEW_UPDATER = '0x13314ea551ae127cb7ccc9a02f64106a34ff91eb';
// New verifier public key (compressed secp256r1)
const NEW_VERIFIER_PUBKEY = '03b8e849395076b0b17e204a86813e057d622acf9856ea8007287d5d4245b91318';

const DRY_RUN = process.argv.includes('--dry-run');

if (!AUTH_TOKEN) {
  console.error('ERROR: PHALA_API_TOKEN environment variable is required');
  process.exit(1);
}

async function signWithDerivedKey(dataHex) {
  const resp = await fetch(`${CVM_URL}/sign/payload`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${AUTH_TOKEN}`,
      'Content-Type': 'application/json',
      'X-Morpheus-Network': 'mainnet',
    },
    body: JSON.stringify({
      target_chain: 'neo_n3',
      data_hex: dataHex,
      use_derived_keys: true,
      dstack_key_role: 'worker',
    }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`sign/payload failed: ${resp.status} ${body}`);
  }
  return resp.json();
}

async function broadcastRawTx(signedTxBase64) {
  const resp = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'sendrawtransaction', params: [signedTxBase64], id: 1 }),
  });
  const json = await resp.json();
  if (json.error) throw new Error(`RPC error: ${JSON.stringify(json.error)}`);
  return json.result;
}

async function buildAndSignTx(method, args) {
  const { sc, tx, wallet, u, rpc } = neon;

  // Build script using createScript
  const script = sc.createScript({
    scriptHash: ORACLE_CONTRACT.replace('0x', ''),
    operation: method,
    args: args,
  });

  console.log(`  Script: ${script.toString().substring(0, 60)}...`);

  const rpcClient = new rpc.RPCClient(RPC_URL);
  const blockCount = await rpcClient.getBlockCount();

  // Create transaction
  const signerHash = wallet.getScriptHashFromAddress('NUVmRwZDoSZMKcPj9UCQLHkpno2TPqYVxC');
  const t = new tx.Transaction({
    version: 0,
    nonce: Math.floor(Math.random() * 2**32),
    systemFee: 200000000, // 2 GAS default
    networkFee: 100000000, // 1 GAS default
    validUntilBlock: blockCount + 100,
    script: u.HexString.fromHex(script),
    signers: [{
      account: u.HexString.fromHex(signerHash),
      scopes: tx.WitnessScope.CalledByEntry,
    }],
    attributes: [],
    witnesses: [],
  });

  // Estimate fees using testInvoke
  try {
    const result = await rpcClient.invokeScript(
      u.HexString.fromHex(script),
      [{ account: signerHash, scopes: 'CalledByEntry' }]
    );
    if (result.state === 'FAULT') {
      throw new Error(`VM FAULT: ${result.exception}`);
    }
    console.log(`  VM state: ${result.state}`);
    const gasConsumed = parseInt(result.gas_consumed || '0');
    t.systemFee = new neon.u.BigInteger(Math.max(gasConsumed * 2, 200000000));
  } catch (e) {
    console.log(`  Warning: testInvoke failed: ${e.message}, using default fees`);
  }

  // Serialize transaction (without witnesses) for signing
  const txHex = t.serialize(false);
  const txBytes = Buffer.from(txHex, 'hex');

  // Compute signing message: magic_LE + SHA256(tx_bytes)_BE
  const txHash = crypto.createHash('sha256').update(txBytes).digest();
  const magicBytes = Buffer.alloc(4);
  magicBytes.writeUInt32LE(NETWORK_MAGIC);
  const signingMessage = Buffer.concat([magicBytes, txHash]);
  const signingMessageHex = signingMessage.toString('hex');
  console.log(`  Transaction hash: ${txHash.toString('hex')}`);

  // Sign with derived key
  const signResult = await signWithDerivedKey(signingMessageHex);
  console.log(`  Signed by: ${signResult.address}`);
  console.log(`  Public key: ${signResult.public_key}`);

  // Build witness
  const invocationScript = buildInvocationScript(signResult.signature);
  const verificationScript = buildVerificationScript(signResult.public_key);

  t.witnesses = [new tx.Witness({
    invocationScript: u.HexString.fromHex(invocationScript),
    verificationScript: u.HexString.fromHex(verificationScript),
  })];

  // Serialize signed transaction
  const signedHex = t.serialize(true);
  return Buffer.from(signedHex, 'hex').toString('base64');
}

function buildInvocationScript(signature) {
  // PUSH signature (64 bytes)
  const sigBytes = Buffer.from(signature, 'hex');
  return `0c40${sigBytes.toString('hex')}`;
}

function buildVerificationScript(publicKey) {
  // PUSH public key (33 bytes) + SYSCALL System.Crypto.CheckSig
  const pubBytes = Buffer.from(publicKey, 'hex');
  return `0c21${pubBytes.toString('hex')}4156e7b327`;
}

async function main() {
  console.log('=== Oracle Admin Key Rotation ===\n');

  // Step 1: Call setUpdater
  console.log('Step 1: Calling setUpdater...');
  console.log(`  New updater: ${NEW_UPDATER}`);
  try {
    const updaterTx = await buildAndSignTx('setUpdater', [
      neon.sc.ContractParam.hash160(NEW_UPDATER),
    ]);
    console.log(`  Signed transaction (base64): ${updaterTx.substring(0, 40)}...`);

    if (DRY_RUN) {
      console.log('  [DRY RUN] Skipping broadcast');
    } else {
      console.log('  Broadcasting...');
      const result = await broadcastRawTx(updaterTx);
      console.log(`  Result: ${JSON.stringify(result)}`);
    }
  } catch (e) {
    console.error(`  ERROR: ${e.message}`);
  }

  console.log('');

  // Step 2: Call setOracleVerificationPublicKey
  console.log('Step 2: Calling setOracleVerificationPublicKey...');
  console.log(`  New verifier: ${NEW_VERIFIER_PUBKEY}`);
  try {
    const verifierTx = await buildAndSignTx('setOracleVerificationPublicKey', [
      neon.sc.ContractParam.publicKey(NEW_VERIFIER_PUBKEY),
    ]);
    console.log(`  Signed transaction (base64): ${verifierTx.substring(0, 40)}...`);

    if (DRY_RUN) {
      console.log('  [DRY RUN] Skipping broadcast');
    } else {
      console.log('  Broadcasting...');
      const result = await broadcastRawTx(verifierTx);
      console.log(`  Result: ${JSON.stringify(result)}`);
    }
  } catch (e) {
    console.error(`  ERROR: ${e.message}`);
  }

  console.log('\nDone.');
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
