import { createRelayerConfig } from "./config.js";
import { callPhala } from "./phala.js";
import { buildWorkerPayload, decodePayloadText, encodeFulfillmentResult, resolveWorkerRoute } from "./router.js";
import { loadRelayerState, saveRelayerState } from "./state.js";
import { fulfillNeoN3Request, getNeoN3LatestBlock, hasNeoN3RelayerConfig, scanNeoN3OracleRequests } from "./neo-n3.js";
import { fulfillNeoXRequest, getNeoXLatestBlock, hasNeoXRelayerConfig, scanNeoXOracleRequests } from "./neo-x.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processOracleRequest(config, event) {
  const payload = decodePayloadText(event.payloadText);
  const route = resolveWorkerRoute(event.requestType, payload);
  const workerPayload = buildWorkerPayload(event.chain, event.requestType, payload, event.requestId);
  const workerResponse = await callPhala(config, route, workerPayload);
  const fulfillment = encodeFulfillmentResult(event.requestType, workerResponse);

  if (event.chain === "neo_n3") {
    const tx = await fulfillNeoN3Request(config, event.requestId, fulfillment.success, fulfillment.result, fulfillment.error);
    return { ...fulfillment, route, fulfill_tx: tx };
  }

  const tx = await fulfillNeoXRequest(config, event.requestId, fulfillment.success, fulfillment.result, fulfillment.error);
  return { ...fulfillment, route, fulfill_tx: tx };
}

async function processNeoN3(config, state, logger = console) {
  if (!hasNeoN3RelayerConfig(config)) return [];
  const latestBlock = await getNeoN3LatestBlock(config);
  const targetBlock = latestBlock - Math.max(config.confirmations.neo_n3, 0);
  const fromBlock = state.neo_n3.last_block === null
    ? Math.max(config.startBlocks.neo_n3 ?? targetBlock, 0)
    : Number(state.neo_n3.last_block) + 1;
  if (fromBlock > targetBlock) return [];
  const events = await scanNeoN3OracleRequests(config, fromBlock, targetBlock);
  const results = [];
  for (const event of events) {
    logger.info?.({ chain: event.chain, requestId: event.requestId, requestType: event.requestType, txHash: event.txHash }, "Processing MorpheusOracle request");
    const result = await processOracleRequest(config, event);
    results.push({ event, result });
  }
  state.neo_n3.last_block = targetBlock;
  return results;
}

async function processNeoX(config, state, logger = console) {
  if (!hasNeoXRelayerConfig(config)) return [];
  const latestBlock = await getNeoXLatestBlock(config);
  const targetBlock = latestBlock - Math.max(config.confirmations.neo_x, 0);
  const fromBlock = state.neo_x.last_block === null
    ? Math.max(config.startBlocks.neo_x ?? targetBlock, 0)
    : Number(state.neo_x.last_block) + 1;
  if (fromBlock > targetBlock) return [];
  const events = await scanNeoXOracleRequests(config, fromBlock, targetBlock);
  const results = [];
  for (const event of events) {
    logger.info?.({ chain: event.chain, requestId: event.requestId, requestType: event.requestType, txHash: event.txHash }, "Processing MorpheusOracleX request");
    const result = await processOracleRequest(config, event);
    results.push({ event, result });
  }
  state.neo_x.last_block = targetBlock;
  return results;
}

export async function runRelayerOnce(logger = console) {
  const config = createRelayerConfig();
  const state = loadRelayerState(config.stateFile);
  const neoN3Results = await processNeoN3(config, state, logger);
  const neoXResults = await processNeoX(config, state, logger);
  saveRelayerState(config.stateFile, state);
  return { neo_n3: neoN3Results, neo_x: neoXResults, state };
}

export async function runRelayerLoop(logger = console) {
  const config = createRelayerConfig();
  logger.info?.({ network: config.network, stateFile: config.stateFile }, "Starting Morpheus relayer loop");
  while (true) {
    try {
      const result = await runRelayerOnce(logger);
      logger.info?.({
        neo_n3_processed: result.neo_n3.length,
        neo_x_processed: result.neo_x.length,
        state: result.state,
      }, "Relayer loop tick complete");
    } catch (error) {
      logger.error?.({ error: error instanceof Error ? error.message : String(error) }, "Relayer loop tick failed");
    }
    await sleep(config.pollIntervalMs);
  }
}
