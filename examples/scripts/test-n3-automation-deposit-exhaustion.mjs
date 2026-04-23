import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { experimental, rpc as neoRpc, sc, tx, wallet } from '@cityofzion/neon-js';
import { createRelayerConfig } from '../../workers/morpheus-relayer/src/config.js';
import { processAutomationJobs } from '../../workers/morpheus-relayer/src/automation.js';
import { patchAutomationJob } from '../../workers/morpheus-relayer/src/persistence.js';
import {
  encodeUtf8Base64,
  loadExampleEnv,
  normalizeHash160,
  readDeploymentRegistry,
  repoRoot,
  resolveNeoN3SignerWif,
  sleep,
  trimString,
  tryParseJson,
  writeValidationArtifacts,
  writeSkippedValidationArtifacts,
} from './common.mjs';

const execFileAsync = promisify(execFile);
const GAS_HASH = '0xd2a4cff31913016155e38e474a2c06d08be276cf';
const EXAMPLE_BUILD_DIR = path.resolve(repoRoot, 'examples/build/n3');
const EXAMPLE_CONSUMER_ARTIFACT = 'UserConsumerN3OracleExample';

function assertCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\"'\"'`)}'`;
}

function parseStackItem(item) {
  if (!item || typeof item !== 'object') return null;
  const type = trimString(item.type).toLowerCase();
  switch (type) {
    case 'array':
    case 'struct':
      return Array.isArray(item.value) ? item.value.map((entry) => parseStackItem(entry)) : [];
    case 'hash160':
    case 'hash256':
    case 'string':
      return String(item.value ?? '');
    case 'integer':
      return String(item.value ?? '0');
    case 'boolean':
      return Boolean(item.value);
    case 'bytestring':
    case 'bytearray': {
      const raw = trimString(item.value);
      if (!raw) return '';
      const bytes = Buffer.from(raw, 'base64');
      if (bytes.length === 20) return `0x${Buffer.from(bytes).reverse().toString('hex')}`;
      const text = bytes.toString('utf8');
      return /^[\x09\x0a\x0d\x20-\x7e]*$/.test(text) ? text : `0x${bytes.toString('hex')}`;
    }
    default:
      return item.value ?? null;
  }
}

function decodeCallbackArray(item) {
  if (!item || item.type !== 'Array' || !Array.isArray(item.value) || item.value.length < 4)
    return null;
  const [requestTypeItem, successItem, resultItem, errorItem] = item.value;
  const requestType = Buffer.from(trimString(requestTypeItem?.value || ''), 'base64').toString(
    'utf8'
  );
  const resultText = Buffer.from(trimString(resultItem?.value || ''), 'base64').toString('utf8');
  const errorText = Buffer.from(trimString(errorItem?.value || ''), 'base64').toString('utf8');
  return {
    request_type: requestType,
    success: Boolean(successItem?.value),
    result_text: resultText,
    result_json: tryParseJson(resultText),
    error_text: errorText,
  };
}

async function invokeRead(rpcClient, contractHash, method, params = []) {
  const response = await rpcClient.invokeFunction(contractHash, method, params);
  if (String(response.state || '').toUpperCase() === 'FAULT') {
    throw new Error(`${method} faulted: ${response.exception || 'unknown error'}`);
  }
  return parseStackItem(response.stack?.[0]);
}

async function waitForApplicationLog(rpcClient, txHash, timeoutMs = 180000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      return await rpcClient.getApplicationLog(txHash);
    } catch {}
    await sleep(2000);
  }
  throw new Error(`timed out waiting for application log ${txHash}`);
}

function decodeDeployHash(appLog) {
  const notification = appLog?.executions
    ?.flatMap((execution) => execution.notifications || [])
    .find((entry) => entry.eventname === 'Deploy');
  const value = notification?.state?.value?.[0]?.value || '';
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length !== 20) throw new Error('failed to decode deployed Neo N3 contract hash');
  return `0x${Buffer.from(bytes).reverse().toString('hex')}`;
}

async function contractExists(rpcClient, hash) {
  if (!hash) return false;
  try {
    await rpcClient.getContractState(hash);
    return true;
  } catch {
    return false;
  }
}

async function loadContractArtifacts(baseName, buildDir = EXAMPLE_BUILD_DIR) {
  const nefPath = path.join(buildDir, `${baseName}.nef`);
  const manifestPath = path.join(buildDir, `${baseName}.manifest.json`);
  const [nefBytes, manifestRaw] = await Promise.all([
    fs.readFile(nefPath),
    fs.readFile(manifestPath, 'utf8'),
  ]);
  const manifestJson = JSON.parse(manifestRaw);
  return {
    nef: sc.NEF.fromBuffer(nefBytes),
    manifestJson,
    manifest: sc.ContractManifest.fromJson(manifestJson),
  };
}

async function ensureExampleConsumer({
  rpcClient,
  account,
  rpcUrl,
  networkMagic,
  oracleHash,
  consumerHash,
}) {
  const { nef, manifestJson } = await loadContractArtifacts(
    EXAMPLE_CONSUMER_ARTIFACT,
    EXAMPLE_BUILD_DIR
  );
  let resolvedHash = normalizeHash160(consumerHash);

  if (!(await contractExists(rpcClient, resolvedHash))) {
    const uniqueManifest = sc.ContractManifest.fromJson({
      ...manifestJson,
      name: `${manifestJson.name}-${Date.now()}`,
    });
    const txid = await experimental.deployContract(nef, uniqueManifest, {
      account,
      rpcAddress: rpcUrl,
      networkMagic,
      blocksTillExpiry: 200,
    });
    const appLog = await waitForApplicationLog(rpcClient, txid);
    resolvedHash = decodeDeployHash(appLog);
  }

  const currentOracle = normalizeHash160(
    await invokeRead(rpcClient, resolvedHash, 'oracle').catch(() => '')
  );
  const oracleAllowed = Boolean(
    await invokeRead(rpcClient, oracleHash, 'isAllowedCallback', [
      { type: 'Hash160', value: resolvedHash },
    ]).catch(() => false)
  );
  const consumer = new experimental.SmartContract(resolvedHash, {
    rpcAddress: rpcUrl,
    networkMagic,
    account,
  });
  const signers = [new tx.Signer({ account: account.scriptHash, scopes: tx.WitnessScope.Global })];

  if (!oracleAllowed) {
    const oracle = new experimental.SmartContract(oracleHash, {
      rpcAddress: rpcUrl,
      networkMagic,
      account,
    });
    const txid = await oracle.invoke('addAllowedCallback', [
      sc.ContractParam.hash160(resolvedHash),
    ]);
    await waitForApplicationLog(rpcClient, txid);
  }

  if (currentOracle !== oracleHash) {
    const txid = await consumer.invoke(
      'setOracle',
      [sc.ContractParam.hash160(oracleHash)],
      signers
    );
    await waitForApplicationLog(rpcClient, txid);
  }

  return resolvedHash;
}

async function waitForRequestId(rpcClient, txid, timeoutMs = 90000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const appLog = await rpcClient.getApplicationLog(txid);
      const notification = appLog.executions
        ?.flatMap((execution) => execution.notifications || [])
        .find((entry) => entry.eventname === 'OracleRequested');
      const requestId = notification?.state?.value?.[0]?.value ?? null;
      if (requestId) return requestId;
    } catch {}
    await sleep(2000);
  }
  throw new Error(`timed out waiting for request id from tx ${txid}`);
}

async function waitForCallback(rpcClient, consumerHash, requestId, timeoutMs = 180000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const response = await rpcClient.invokeFunction(consumerHash, 'getCallback', [
      { type: 'Integer', value: String(requestId) },
    ]);
    const decoded = decodeCallbackArray(response.stack?.[0]);
    if (decoded && (decoded.request_type || decoded.result_text || decoded.error_text))
      return decoded;
    await sleep(2000);
  }
  throw new Error(`timed out waiting for callback ${requestId}`);
}

async function ensureFeeCredit(
  account,
  rpcUrl,
  networkMagic,
  rpcClient,
  oracleHash,
  payerHash,
  requiredRequests,
  { viaConsumer = false, creditRecipientHash = payerHash } = {}
) {
  const currentCredit = BigInt(
    (await invokeRead(rpcClient, oracleHash, 'feeCreditOf', [
      { type: 'Hash160', value: creditRecipientHash },
    ])) || '0'
  );
  const requestFee = BigInt((await invokeRead(rpcClient, oracleHash, 'requestFee', [])) || '0');
  const requiredCredit = requestFee * BigInt(requiredRequests);
  if (requestFee <= 0n || currentCredit >= requiredCredit) {
    return {
      request_fee: requestFee.toString(),
      current_credit: currentCredit.toString(),
      deposit_amount: '0',
    };
  }

  const gas = new experimental.SmartContract(GAS_HASH, {
    rpcAddress: rpcUrl,
    networkMagic,
    account,
  });
  const deficit = requiredCredit - currentCredit;
  await gas.invoke('transfer', [
    sc.ContractParam.hash160(`0x${account.scriptHash}`),
    sc.ContractParam.hash160(viaConsumer ? payerHash : oracleHash),
    sc.ContractParam.integer(deficit.toString()),
    sc.ContractParam.any(null),
  ]);

  if (viaConsumer) {
    const deadlineBalance = Date.now() + 60000;
    while (Date.now() < deadlineBalance) {
      const contractBalanceRaw = await invokeRead(rpcClient, GAS_HASH, 'balanceOf', [
        { type: 'Hash160', value: payerHash },
      ]);
      if (BigInt(contractBalanceRaw || '0') >= deficit) break;
      await sleep(2000);
    }

    const consumer = new experimental.SmartContract(payerHash, {
      rpcAddress: rpcUrl,
      networkMagic,
      account,
    });
    const signers = [
      new tx.Signer({ account: account.scriptHash, scopes: tx.WitnessScope.Global }),
    ];
    await consumer.invoke(
      'depositOracleCredits',
      [sc.ContractParam.integer(deficit.toString())],
      signers
    );
  }

  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const updatedCredit = BigInt(
      (await invokeRead(rpcClient, oracleHash, 'feeCreditOf', [
        { type: 'Hash160', value: creditRecipientHash },
      ])) || '0'
    );
    if (updatedCredit >= requiredCredit) {
      return {
        request_fee: requestFee.toString(),
        current_credit: updatedCredit.toString(),
        deposit_amount: deficit.toString(),
      };
    }
    await sleep(2000);
  }

  throw new Error('timed out waiting for Neo N3 automation fee credit');
}

async function fetchAutomationRecord(baseUrl, apiKey, automationId, network = 'testnet') {
  const headers = {
    apikey: apiKey,
    authorization: `Bearer ${apiKey}`,
    accept: 'application/json',
  };

  const jobUrl = new URL(`${baseUrl.replace(/\/$/, '')}/rest/v1/morpheus_automation_jobs`);
  jobUrl.searchParams.set('select', '*');
  jobUrl.searchParams.set('network', `eq.${network}`);
  jobUrl.searchParams.set('automation_id', `eq.${automationId}`);
  jobUrl.searchParams.set('limit', '1');
  const jobRows = await fetch(jobUrl, { headers }).then((response) =>
    response.ok ? response.json() : []
  );

  const runsUrl = new URL(`${baseUrl.replace(/\/$/, '')}/rest/v1/morpheus_automation_runs`);
  runsUrl.searchParams.set('select', '*');
  runsUrl.searchParams.set('network', `eq.${network}`);
  runsUrl.searchParams.set('automation_id', `eq.${automationId}`);
  runsUrl.searchParams.set('order', 'created_at.asc');
  const runRows = await fetch(runsUrl, { headers }).then((response) =>
    response.ok ? response.json() : []
  );

  return {
    job: Array.isArray(jobRows) ? jobRows[0] || null : null,
    runs: Array.isArray(runRows) ? runRows : [],
  };
}

async function runRemoteCommand(command, { appId, phalaApiToken }) {
  const attempts = [
    trimString(phalaApiToken)
      ? ['ssh', '--api-token', phalaApiToken, appId, '--', `sh -lc ${shellQuote(command)}`]
      : null,
    ['ssh', appId, '--', `sh -lc ${shellQuote(command)}`],
  ].filter(Boolean);

  let lastError = null;
  for (const args of attempts) {
    try {
      const { stdout } = await execFileAsync('phala', args, {
        maxBuffer: 10 * 1024 * 1024,
      });
      return stdout;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('failed to execute remote phala ssh command');
}

async function getCvmStatus(appId) {
  const { stdout } = await execFileAsync('phala', ['cvms', 'get', appId], {
    maxBuffer: 10 * 1024 * 1024,
  });
  const match = stdout.match(/│\s*Status\s*│\s*([^│\n]+)\s*│/);
  if (!match) {
    throw new Error(`unexpected phala cvms get output: ${stdout}`);
  }
  return trimString(match[1]);
}

async function waitForCvmStatus(appId, targetStatus, timeoutMs = 180000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const status = await getCvmStatus(appId);
    if (status === targetStatus) return;
    await sleep(3000);
  }
  throw new Error(`timed out waiting for CVM status=${targetStatus}`);
}

async function waitForContainersRunning(appId, timeoutMs = 300000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const { stdout } = await execFileAsync('phala', ['ps', appId], {
        maxBuffer: 10 * 1024 * 1024,
      });
      const relayerRunning = /morpheus-relayer.*running/i.test(stdout);
      const workerRunning = /phala-worker.*running/i.test(stdout);
      if (relayerRunning && workerRunning) return;
    } catch {}
    await sleep(3000);
  }
  throw new Error('timed out waiting for Morpheus containers to become running');
}

async function stopCvm(appId) {
  await execFileAsync('phala', ['cvms', 'stop', appId], {
    maxBuffer: 10 * 1024 * 1024,
  }).catch((error) => {
    const message = String(error?.stderr || error?.stdout || error?.message || error);
    if (!/already in progress/i.test(message)) throw error;
  });
  await waitForCvmStatus(appId, 'stopped');
}

async function startCvm(appId) {
  await execFileAsync('phala', ['cvms', 'start', appId], {
    maxBuffer: 10 * 1024 * 1024,
  }).catch((error) => {
    const message = String(error?.stderr || error?.stdout || error?.message || error);
    if (!/already in progress/i.test(message)) throw error;
  });
  await waitForContainersRunning(appId);
}

async function findRelayerLoopPid({ appId, phalaApiToken }) {
  const stdout = await runRemoteCommand(
    "ps -ef | grep 'node src/cli.js loop' | grep -v grep | awk 'NR==1 {print $1}'",
    { appId, phalaApiToken }
  );
  return trimString(stdout.split(/\r?\n/, 1)[0] || '');
}

async function waitForRelayerState({
  appId,
  phalaApiToken,
  pid,
  shouldBeRunning,
  timeoutMs = 30000,
}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const stdout = await runRemoteCommand(
      `ps -o pid=,stat=,args= | awk '$1 == ${pid} {print $2}'`,
      { appId, phalaApiToken }
    );
    const status = trimString(stdout.split(/\r?\n/, 1)[0] || '');
    const paused = status.includes('T');
    const running = Boolean(status) && !paused;
    if ((shouldBeRunning && running) || (!shouldBeRunning && paused)) return;
    await sleep(1000);
  }
  throw new Error(`timed out waiting for morpheus-relayer paused=${!shouldBeRunning}`);
}

async function stopRelayer({ appId, phalaApiToken }) {
  try {
    const pid = await findRelayerLoopPid({ appId, phalaApiToken });
    assertCondition(pid, 'morpheus relayer loop pid not found on testnet CVM');
    await runRemoteCommand(`kill -s STOP ${pid}`, { appId, phalaApiToken });
    await waitForRelayerState({ appId, phalaApiToken, pid, shouldBeRunning: false });
    return { mode: 'signal', pid };
  } catch {
    await stopCvm(appId);
    return { mode: 'cvm' };
  }
}

async function startRelayer({ appId, phalaApiToken, handle }) {
  if (!handle) return;
  if (handle.mode === 'cvm') {
    await startCvm(appId);
    return;
  }
  if (!trimString(handle.pid)) return;
  await runRemoteCommand(`kill -s CONT ${handle.pid}`, { appId, phalaApiToken });
  await waitForRelayerState({ appId, phalaApiToken, pid: handle.pid, shouldBeRunning: true });
}

async function main() {
  await loadExampleEnv();
  const networkConfig = JSON.parse(
    await fs.readFile(path.resolve(repoRoot, 'config/networks/testnet.json'), 'utf8')
  );
  const deployment = (await readDeploymentRegistry('testnet')).neo_n3 || {};
  const rpcUrl = trimString(deployment.rpc_url || 'https://testnet1.neo.coz.io:443');
  const networkMagic = Number(deployment.network_magic || 894710606);
  const signerWif = resolveNeoN3SignerWif('testnet');
  const oracleHash = normalizeHash160(deployment.oracle_hash || '');
  const consumerHash = normalizeHash160(deployment.example_consumer_hash || '');
  const supabaseUrl = trimString(
    process.env.SUPABASE_URL || process.env.morpheus_SUPABASE_URL || ''
  );
  const serviceRoleKey = trimString(
    process.env.SUPABASE_SECRET_KEY ||
      process.env.morpheus_SUPABASE_SECRET_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.morpheus_SUPABASE_SERVICE_ROLE_KEY ||
      ''
  );
  const phalaApiToken = trimString(
    process.env.PHALA_API_TOKEN || process.env.PHALA_SHARED_SECRET || ''
  );
  const appId = trimString(
    networkConfig?.phala?.cvm_id || process.env.MORPHEUS_PAYMASTER_APP_ID || ''
  );

  assertCondition(signerWif, 'testnet signer WIF is required');
  assertCondition(oracleHash, 'testnet oracle hash is required');
  assertCondition(consumerHash, 'testnet example consumer hash is required');
  assertCondition(supabaseUrl && serviceRoleKey, 'Supabase secret or service-role env is required');
  assertCondition(phalaApiToken && appId, 'Phala API token and CVM id are required');

  const account = new wallet.Account(signerWif);
  const rpcClient = new neoRpc.RPCClient(rpcUrl);
  const resolvedConsumerHash = await ensureExampleConsumer({
    rpcClient,
    account,
    rpcUrl,
    networkMagic,
    oracleHash,
    consumerHash,
  });
  const requesterHash = `0x${account.scriptHash}`;
  const sharedRequesterHash = await ensureExampleConsumer({
    rpcClient,
    account,
    rpcUrl,
    networkMagic,
    oracleHash,
    consumerHash: '',
  });
  const consumer = new experimental.SmartContract(resolvedConsumerHash, {
    rpcAddress: rpcUrl,
    networkMagic,
    account,
  });
  const signers = [new tx.Signer({ account: account.scriptHash, scopes: tx.WitnessScope.Global })];
  const requestFee = BigInt((await invokeRead(rpcClient, oracleHash, 'requestFee', [])) || '0');

  const buildPayload = (label) =>
    JSON.stringify({
      trigger: {
        type: 'interval',
        interval_ms: 300000,
        start_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      },
      execution: {
        request_type: 'privacy_oracle',
        payload: {
          provider: 'twelvedata',
          symbol: 'TWELVEDATA:NEO-USD',
          json_path: 'price',
          target_chain: 'neo_n3',
          tag: label,
        },
      },
    });

  const registerOne = async (label) => {
    const txid = await consumer.invoke(
      'requestRaw',
      ['automation_register', sc.ContractParam.byteArray(encodeUtf8Base64(buildPayload(label)))],
      signers
    );
    const requestId = await waitForRequestId(rpcClient, txid);
    return { label, txid, request_id: String(requestId), callback: null, automation_id: '' };
  };

  const registrationPauseHandle = await stopRelayer({ appId, phalaApiToken });
  let registrationA;
  let registrationB;
  let registrationFeeStatus = null;
  try {
    // Registration consumes the external requester credit path.
    registrationFeeStatus = await ensureFeeCredit(
      account,
      rpcUrl,
      networkMagic,
      rpcClient,
      oracleHash,
      requesterHash,
      4,
      {
        viaConsumer: false,
        creditRecipientHash: requesterHash,
      }
    );
    registrationA = await registerOne('exhaustion-a');
    registrationB = await registerOne('exhaustion-b');
  } finally {
    await startRelayer({ appId, phalaApiToken, handle: registrationPauseHandle }).catch(() => {});
  }

  registrationA.callback = await waitForCallback(
    rpcClient,
    resolvedConsumerHash,
    registrationA.request_id,
    180000
  );
  registrationB.callback = await waitForCallback(
    rpcClient,
    resolvedConsumerHash,
    registrationB.request_id,
    180000
  );
  assertCondition(
    registrationA.callback?.success === true,
    'automation register callback should succeed for exhaustion-a'
  );
  assertCondition(
    registrationB.callback?.success === true,
    'automation register callback should succeed for exhaustion-b'
  );
  registrationA.automation_id = trimString(
    registrationA.callback.result_json?.result?.automation_id ||
      registrationA.callback.result_json?.automation_id ||
      registrationA.automation_id ||
      ''
  );
  registrationB.automation_id = trimString(
    registrationB.callback.result_json?.result?.automation_id ||
      registrationB.callback.result_json?.automation_id ||
      registrationB.automation_id ||
      ''
  );
  assertCondition(
    registrationA.automation_id,
    'automation register callback did not return automation_id for exhaustion-a'
  );
  assertCondition(
    registrationB.automation_id,
    'automation register callback did not return automation_id for exhaustion-b'
  );

  const pausedRelayerHandle = await stopRelayer({ appId, phalaApiToken });
  try {
    const sharedRequesterFeeStatus = await ensureFeeCredit(
      account,
      rpcUrl,
      networkMagic,
      rpcClient,
      oracleHash,
      sharedRequesterHash,
      1,
      {
        viaConsumer: true,
        creditRecipientHash: sharedRequesterHash,
      }
    );
    const creditBeforeQueue = BigInt(
      (await invokeRead(rpcClient, oracleHash, 'feeCreditOf', [
        { type: 'Hash160', value: sharedRequesterHash },
      ])) || '0'
    );
    assertCondition(
      creditBeforeQueue === requestFee,
      `expected exactly one request fee on the shared requester before queueing, got ${creditBeforeQueue}`
    );

    await patchAutomationJob(registrationA.automation_id, {
      status: 'active',
      requester: sharedRequesterHash,
      next_run_at: new Date(0).toISOString(),
      execution_count: 0,
      last_error: null,
    });
    await patchAutomationJob(registrationB.automation_id, {
      status: 'active',
      requester: sharedRequesterHash,
      next_run_at: new Date(0).toISOString(),
      execution_count: 0,
      last_error: null,
    });

    process.env.MORPHEUS_NETWORK = 'testnet';
    process.env.MORPHEUS_AUTOMATION_BATCH_SIZE = '200';
    process.env.MORPHEUS_AUTOMATION_MAX_QUEUED_PER_TICK = '200';
    process.env.NEO_RPC_URL = rpcUrl;
    process.env.NEO_NETWORK_MAGIC = String(networkMagic);
    process.env.CONTRACT_MORPHEUS_ORACLE_HASH = oracleHash;
    process.env.NEO_TESTNET_WIF = signerWif;
    process.env.MORPHEUS_RELAYER_NEO_N3_WIF = signerWif;

    const config = createRelayerConfig();
    const localTick = await processAutomationJobs(config, { info() {}, warn() {} });
    const recordA = await fetchAutomationRecord(
      supabaseUrl,
      serviceRoleKey,
      registrationA.automation_id,
      'testnet'
    );
    const recordB = await fetchAutomationRecord(
      supabaseUrl,
      serviceRoleKey,
      registrationB.automation_id,
      'testnet'
    );
    const queuedRuns = [...recordA.runs, ...recordB.runs].filter(
      (item) => item.status === 'queued'
    );
    const failedRuns = [...recordA.runs, ...recordB.runs].filter(
      (item) => item.status === 'failed'
    );

    assertCondition(
      queuedRuns.length === 1,
      `expected exactly one queued automation run under exhausted shared credit, got ${queuedRuns.length}`
    );
    assertCondition(
      failedRuns.length >= 1,
      'expected at least one failed automation run under exhausted shared credit'
    );
    assertCondition(
      failedRuns.some((item) => /request fee not paid/i.test(String(item.error || ''))),
      'expected failed automation run to mention request fee not paid'
    );

    const executionCountTotal =
      Number(recordA.job?.execution_count || 0) + Number(recordB.job?.execution_count || 0);
    assertCondition(
      executionCountTotal === 1,
      `expected total execution_count=1 across both jobs, got ${executionCountTotal}`
    );

    const creditAfterQueue = BigInt(
      (await invokeRead(rpcClient, oracleHash, 'feeCreditOf', [
        { type: 'Hash160', value: sharedRequesterHash },
      ])) || '0'
    );
    assertCondition(
      creditAfterQueue === 0n,
      `expected shared requester credit to be exhausted after one queue, got ${creditAfterQueue}`
    );

    await startRelayer({ appId, phalaApiToken, handle: pausedRelayerHandle });
    const queuedTxHash = trimString(queuedRuns[0]?.queue_tx?.tx_hash || '');
    assertCondition(queuedTxHash, 'queued automation run did not record queue tx hash');
    const queuedChainRequestId = await waitForRequestId(rpcClient, queuedTxHash, 90000);
    const queuedCallback = await waitForCallback(
      rpcClient,
      resolvedConsumerHash,
      queuedChainRequestId,
      180000
    );
    assertCondition(
      queuedCallback?.success === true,
      'the single funded automation execution should fulfill successfully'
    );

    const generatedAt = new Date().toISOString();
    const jsonReport = {
      generated_at: generatedAt,
      network: 'testnet',
      rpc_url: rpcUrl,
      network_magic: networkMagic,
      oracle_hash: oracleHash,
      shared_requester_hash: sharedRequesterHash,
      callback_consumer_hash: resolvedConsumerHash,
      request_fee: requestFee.toString(),
      registration_fee_status: registrationFeeStatus,
      shared_requester_fee_status: sharedRequesterFeeStatus,
      credit_before_queue: creditBeforeQueue.toString(),
      credit_after_queue: creditAfterQueue.toString(),
      registrations: [registrationA, registrationB],
      local_tick: localTick,
      automation_records: {
        [registrationA.automation_id]: recordA,
        [registrationB.automation_id]: recordB,
      },
      queued_runs: queuedRuns,
      failed_runs: failedRuns,
      queued_chain_request_id: String(queuedChainRequestId),
      queued_callback: queuedCallback,
    };

    const markdownReport = [
      '# N3 Automation Deposit Exhaustion Validation',
      '',
      `Date: ${generatedAt}`,
      '',
      '## Scope',
      '',
      'This probe registers two due automation jobs that intentionally share the same requester fee-credit pool, then leaves only one request fee available before running a local scheduler tick.',
      '',
      '## Result',
      '',
      `- Shared requester hash: \`${sharedRequesterHash}\``,
      `- Request fee: \`${requestFee}\``,
      `- Credit before queue: \`${creditBeforeQueue}\``,
      `- Credit after queue: \`${creditAfterQueue}\``,
      `- Queued runs: \`${queuedRuns.length}\``,
      `- Failed runs: \`${failedRuns.length}\``,
      queuedTxHash ? `- Queued tx: \`${queuedTxHash}\`` : null,
      queuedChainRequestId ? `- Queued chain request id: \`${queuedChainRequestId}\`` : null,
      failedRuns[0]?.error ? `- Failed error: \`${failedRuns[0].error}\`` : null,
      '',
      '## Conclusion',
      '',
      '- Under a shared requester fee-credit pool with only one remaining request fee, the scheduler queued exactly one automation execution.',
      '- The second due automation did not overrun the pool; it failed with `request fee not paid`.',
      '- The funded queued execution still fulfilled successfully after the relayer resumed.',
      '',
    ]
      .filter(Boolean)
      .join('\n');

    const artifacts = await writeValidationArtifacts({
      baseName: 'n3-automation-deposit-exhaustion',
      network: 'testnet',
      generatedAt,
      jsonReport,
      markdownReport,
    });

    console.log(
      JSON.stringify(
        {
          ...artifacts,
          queued_runs: queuedRuns.length,
          failed_runs: failedRuns.length,
          queued_chain_request_id: String(queuedChainRequestId),
          failed_error: failedRuns[0]?.error || null,
        },
        null,
        2
      )
    );
  } finally {
    await startRelayer({ appId, phalaApiToken, handle: pausedRelayerHandle }).catch(() => {});
  }
}

main().catch((error) => {
  const message = error?.stack || error?.message || String(error);
  if (/addAllowedCallback|Reason: unauthorized/i.test(message)) {
    writeSkippedValidationArtifacts({
      baseName: 'n3-automation-deposit-exhaustion',
      network: 'testnet',
      title: 'N3 Automation Deposit Exhaustion Validation',
      reason: 'requires-privileged-callback-registration',
      details: { error: message },
    })
      .then((artifacts) => {
        console.log(JSON.stringify({ ...artifacts, skipped: true, error: message }, null, 2));
        process.exit(0);
      })
      .catch((artifactError) => {
        console.error(artifactError?.stack || artifactError?.message || String(artifactError));
        process.exit(1);
      });
    return;
  }
  console.error(message);
  process.exit(1);
});
