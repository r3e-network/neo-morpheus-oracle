import test from 'node:test';
import assert from 'node:assert/strict';
import { ethers } from 'ethers';
import {
  hasNeoXRelayerConfig,
  resolveResultBytesHex,
  buildNeoXDigest,
  signNeoXFulfillment,
  normalizeNeoXRevert,
} from './neox.js';
import { classifyError, isAlreadyFulfilledError, isTerminalConfigurationError } from './fulfillment.js';

// Deterministic throwaway test key (not used anywhere live).
const TEST_PK = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const TEST_ADDR = new ethers.Wallet(TEST_PK).address;

const baseConfig = {
  neox: {
    chainId: 47763,
    oracleContract: '0xeCFC1C652B5cCdBfe3E9314a83156787D92a3fD2',
    updaterPrivateKey: TEST_PK,
  },
};

test('hasNeoXRelayerConfig requires rpc, oracle, and updater key', () => {
  assert.equal(hasNeoXRelayerConfig({}), false);
  assert.equal(hasNeoXRelayerConfig({ neox: { rpcUrl: 'x', oracleContract: 'y' } }), false);
  assert.equal(
    hasNeoXRelayerConfig({ neox: { rpcUrl: 'x', oracleContract: 'y', updaterPrivateKey: 'z' } }),
    true
  );
});

test('resolveResultBytesHex prefers compact bytes, falls back to utf8', () => {
  // 32-byte VRF randomness as base64 -> 0x + 64 hex chars
  const randomness = Buffer.from('a'.repeat(64), 'hex');
  const b64 = randomness.toString('base64');
  assert.equal(resolveResultBytesHex('', b64), `0x${randomness.toString('hex')}`);
  // No compact bytes -> utf8 encode of the result string
  assert.equal(resolveResultBytesHex('hello', ''), `0x${Buffer.from('hello', 'utf8').toString('hex')}`);
  // Empty -> 0x
  assert.equal(resolveResultBytesHex('', ''), '0x');
});

test('buildNeoXDigest matches the contract ABI encoding spec', () => {
  const fulfillment = {
    requestId: '7',
    appId: 'vrf-e2e',
    moduleId: 'random.generate',
    operation: 'random',
    success: true,
    error: '',
  };
  const resultHex = `0x${'ab'.repeat(32)}`;
  const digest = buildNeoXDigest(baseConfig, fulfillment, resultHex);

  // Independent reference computation of MorpheusOracleEVM.fulfillmentDigest.
  const ref = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['string', 'uint256', 'address', 'uint256', 'bytes32', 'bytes32', 'bytes32', 'bool', 'bytes32', 'bytes32'],
      [
        'morpheus-evm-fulfillment-v1',
        47763n,
        '0xeCFC1C652B5cCdBfe3E9314a83156787D92a3fD2',
        7n,
        ethers.keccak256(ethers.toUtf8Bytes('vrf-e2e')),
        ethers.keccak256(ethers.toUtf8Bytes('random.generate')),
        ethers.keccak256(ethers.toUtf8Bytes('random')),
        true,
        ethers.keccak256(resultHex),
        ethers.keccak256(ethers.toUtf8Bytes('')),
      ]
    )
  );
  assert.equal(digest, ref);
});

test('signNeoXFulfillment produces an EIP-191 signature recoverable to the verifier', async () => {
  const fulfillment = {
    requestId: '7',
    appId: 'vrf-e2e',
    moduleId: 'random.generate',
    operation: 'random',
    success: true,
    result: '',
    result_bytes_base64: Buffer.from('cd'.repeat(32), 'hex').toString('base64'),
    error: '',
  };
  const out = await signNeoXFulfillment(baseConfig, fulfillment);
  assert.equal(out.source, 'relayer_local_evm');
  assert.equal(out.address, TEST_ADDR);

  // Recompute the digest exactly as the contract would and verify EIP-191 recovery.
  const resultHex = resolveResultBytesHex(fulfillment.result, fulfillment.result_bytes_base64);
  const digest = buildNeoXDigest(baseConfig, fulfillment, resultHex);
  const recovered = ethers.verifyMessage(ethers.getBytes(digest), out.signature);
  assert.equal(recovered, TEST_ADDR);
});

test('normalizeNeoXRevert maps decoded custom errors to the classifier vocabulary', () => {
  // ethers surfaces a decoded custom error as error.revert.name (needs error
  // fragments in the ABI, which neox.js now includes for the staticCall path).
  const notPending = normalizeNeoXRevert({ revert: { name: 'RequestNotPending' }, shortMessage: 'execution reverted' });
  assert.ok(isAlreadyFulfilledError(notPending.message), 'RequestNotPending -> already fulfilled (settled)');
  assert.equal(classifyError(notPending), 'settled');

  const badSig = normalizeNeoXRevert({ revert: { name: 'BadSignature' }, shortMessage: 'execution reverted' });
  assert.ok(isTerminalConfigurationError(badSig.message), 'BadSignature -> terminal config');
  assert.equal(classifyError(badSig), 'permanent');

  const notUpdater = normalizeNeoXRevert({ revert: { name: 'NotUpdater' } });
  assert.equal(classifyError(notUpdater), 'permanent');

  // Fallback: name absent but present in the message text still classifies.
  const textOnly = normalizeNeoXRevert({ message: 'execution reverted: RequestNotPending()' });
  assert.equal(classifyError(textOnly), 'settled');
});

test('signNeoXFulfillment honours a separate verifier key', async () => {
  const verifierPk = '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba';
  const cfg = { neox: { ...baseConfig.neox, verifierPrivateKey: verifierPk } };
  const out = await signNeoXFulfillment(cfg, {
    requestId: '1', appId: 'a', moduleId: 'random.generate', operation: 'random',
    success: true, result: '', result_bytes_base64: '', error: '',
  });
  assert.equal(out.address, new ethers.Wallet(verifierPk).address);
});
