import { Interface } from "ethers";
import { env, json, strip0x, trimString } from "./core.js";
import { buildSignedResultEnvelope, isConfiguredHash160, loadNeoN3Context, normalizeNeoHash160, relayNeoN3Invocation, relayNeoXTransaction } from "./chain.js";
import { buildProviderRequest, fetchProviderJSON } from "./providers.js";

export function normalizePairSymbol(rawSymbol) {
  const raw = trimString(rawSymbol).toUpperCase();
  if (!raw) return "NEO-USD";
  if (/^[A-Z0-9]+-[A-Z0-9]+$/.test(raw)) {
    const [base, quote] = raw.split("-");
    return `${base}-${quote === "USDT" ? "USD" : quote}`;
  }
  if (/^[A-Z0-9]+[/-_][A-Z0-9]+$/.test(raw)) {
    const [base, quote] = raw.split(/[/_-]/);
    return `${base}-${quote === "USDT" ? "USD" : quote}`;
  }
  if (raw.endsWith("USDT")) return `${raw.slice(0, -4)}-USD`;
  if (raw.endsWith("USD")) return `${raw.slice(0, -3)}-USD`;
  return `${raw}-USD`;
}

export function toBinanceSymbol(pair) {
  const compact = normalizePairSymbol(pair).replace(/-/g, "");
  if (compact.endsWith("USD")) return `${compact.slice(0, -3)}USDT`;
  return compact;
}

export function decimalToIntegerString(value, decimals = 8) {
  const raw = trimString(value);
  if (!raw) throw new Error("decimal value required");
  const sign = raw.startsWith("-") ? -1n : 1n;
  const normalized = raw.replace(/^[+-]/, "");
  if (!/^\d+(\.\d+)?$/.test(normalized)) throw new Error(`invalid decimal value: ${value}`);
  const [wholePart, fractionPart = ""] = normalized.split(".");
  const whole = BigInt(wholePart || "0");
  const fraction = (fractionPart + "0".repeat(decimals)).slice(0, decimals);
  const fractionValue = BigInt(fraction || "0");
  const scale = 10n ** BigInt(decimals);
  return ((whole * scale) + fractionValue) * sign + "";
}

export async function fetchPriceQuote(symbol, options = {}) {
  const provider = trimString(options.provider || options.source || "twelvedata") || "twelvedata";
  const providerRequest = buildProviderRequest({ ...options, provider, symbol });
  if (!providerRequest) throw new Error("provider request could not be built");
  const response = await fetchProviderJSON(providerRequest);
  if (!response.ok) throw new Error(`${provider} fetch failed`);
  const pair = providerRequest.pair || normalizePairSymbol(symbol);
  const price = response.data?.price ?? response.data?.value ?? response.data?.close ?? null;
  if (price === null || price === undefined || price === "") throw new Error(`${provider} response missing price`);
  const quote = {
    feed_id: `${provider}:${pair}`,
    pair,
    price: String(price),
    decimals: Number(options.decimals || 8),
    timestamp: new Date().toISOString(),
    sources: [provider],
    provider,
  };
  const signed = buildSignedResultEnvelope(quote);
  return { ...quote, signature: signed.signature, public_key: signed.public_key, attestation_hash: signed.attestation_hash };
}

export async function handleFeedsPrice(symbol, options = {}) {
  try {
    return json(200, await fetchPriceQuote(symbol, options));
  } catch (error) {
    return json(502, { error: error instanceof Error ? error.message : String(error) });
  }
}

export async function handleOracleFeed(payload) {
  const targetChain = payload.target_chain ? payload.target_chain.toLowerCase() : "neo_n3";
  const quote = await fetchPriceQuote(payload.symbol || "NEO-USD", payload);
  const roundId = String(payload.round_id || Math.floor(Date.now() / 1000));
  const sourceSetId = String(payload.source_set_id || 0);
  const timestamp = Math.floor(Date.now() / 1000);
  let anchoredTx = null;
  let relayStatus = "skipped";

  if (targetChain === "neo_n3") {
    const dataFeedHash = normalizeNeoHash160(env("CONTRACT_MORPHEUS_DATAFEED_HASH", "CONTRACT_PRICEFEED_HASH"));
    const neoContext = loadNeoN3Context(payload, { required: false, requireRpc: false });
    if (dataFeedHash && isConfiguredHash160(dataFeedHash) && neoContext) {
      const invokeResult = await relayNeoN3Invocation({
        request_id: trimString(payload.request_id) || `pricefeed:${Date.now()}`,
        contract_hash: dataFeedHash,
        method: "updateFeed",
        params: [
          { type: "String", value: quote.pair },
          { type: "Integer", value: roundId },
          { type: "Integer", value: decimalToIntegerString(quote.price, quote.decimals) },
          { type: "Integer", value: String(timestamp) },
          { type: "ByteArray", value: quote.attestation_hash },
          { type: "Integer", value: sourceSetId },
        ],
        wait: Boolean(payload.wait ?? true),
        rpc_url: neoContext.rpcUrl,
        network_magic: neoContext.networkMagic,
      });
      if (invokeResult.status >= 400) return json(invokeResult.status, invokeResult.body);
      anchoredTx = invokeResult.body;
      relayStatus = "submitted";
    }
  } else {
    const dataFeedAddress = trimString(payload.contract_address || env("CONTRACT_MORPHEUS_DATAFEED_X_ADDRESS"));
    if (dataFeedAddress) {
      const feedInterface = new Interface([
        "function updateFeed(string pair,uint256 roundId,uint256 price,uint256 timestamp,bytes32 attestationHash,uint256 sourceSetId)",
      ]);
      const data = feedInterface.encodeFunctionData("updateFeed", [
        quote.pair,
        BigInt(roundId),
        BigInt(decimalToIntegerString(quote.price, quote.decimals)),
        BigInt(timestamp),
        `0x${strip0x(quote.attestation_hash || "0")}`.padEnd(66, "0"),
        BigInt(sourceSetId),
      ]);
      anchoredTx = await relayNeoXTransaction({
        ...payload,
        target_chain: "neo_x",
        to: dataFeedAddress,
        data,
        value: "0",
        wait: Boolean(payload.wait ?? true),
      });
      relayStatus = "submitted";
    }
  }

  return json(200, { mode: "pricefeed", target_chain: targetChain, ...quote, relay_status: relayStatus, anchored_tx: anchoredTx });
}
