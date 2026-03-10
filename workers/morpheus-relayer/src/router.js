import { createHash } from "node:crypto";

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function sha256Hex(value) {
  return createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
}

export function normalizeRequestType(value) {
  return trimString(value).toLowerCase().replace(/[\s-]+/g, "_");
}

export function isOperatorOnlyRequestType(value) {
  return normalizeRequestType(value).includes("feed");
}

export function decodePayloadText(rawPayload) {
  const text = trimString(rawPayload);
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw_payload: text };
  }
}

export function resolveWorkerRoute(requestType, payload) {
  const normalized = normalizeRequestType(requestType);
  if (normalized.includes("compute")) return "/compute/execute";
  if (normalized.includes("feed")) return "/oracle/feed";
  if (normalized.includes("vrf") || normalized.includes("random")) return "/vrf/random";
  return "/oracle/smart-fetch";
}

export function buildWorkerPayload(chain, requestType, payload, requestId) {
  return {
    ...payload,
    request_id: String(requestId),
    request_source: `morpheus-relayer:${chain}`,
    target_chain: payload.target_chain || chain,
  };
}

function compactTeeAttestation(attestation) {
  if (!attestation || typeof attestation !== "object") return null;
  return {
    app_id: attestation.app_id || null,
    instance_id: attestation.instance_id || null,
    compose_hash: attestation.compose_hash || null,
    report_data: attestation.report_data || null,
    quote_hash: attestation.quote ? sha256Hex(attestation.quote) : null,
    event_log_hash: attestation.event_log ? sha256Hex(attestation.event_log) : null,
  };
}

function buildVerificationEnvelope(workerBody) {
  if (!workerBody || typeof workerBody !== "object") return null;
  const existing = workerBody.verification && typeof workerBody.verification === "object"
    ? workerBody.verification
    : null;
  const source = existing || workerBody;

  const hasAny = source.output_hash
    || source.attestation_hash
    || source.signature
    || source.public_key
    || source.tee_attestation;
  if (!hasAny) return null;

  return {
    output_hash: source.output_hash || null,
    attestation_hash: source.attestation_hash || null,
    signature: source.signature || null,
    public_key: source.public_key || null,
    signer_address: source.signer_address || null,
    signer_script_hash: source.signer_script_hash || null,
    tee_attestation: compactTeeAttestation(source.tee_attestation || null),
  };
}

const MAX_ONCHAIN_RESULT_VALUE_BYTES = 384;
const MAX_ONCHAIN_ERROR_LENGTH = 240;

function measureJsonBytes(value) {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function trimErrorMessage(value) {
  const text = trimString(value);
  if (!text) return "worker request failed";
  return text.length > MAX_ONCHAIN_ERROR_LENGTH
    ? `${text.slice(0, MAX_ONCHAIN_ERROR_LENGTH - 3)}...`
    : text;
}

function compactValue(value, maxBytes = MAX_ONCHAIN_RESULT_VALUE_BYTES) {
  if (value === undefined) return undefined;
  if (measureJsonBytes(value) <= maxBytes) return value;
  return undefined;
}

function buildBusinessResult(requestType, workerBody) {
  if (!workerBody || typeof workerBody !== "object") return workerBody;

  const normalized = normalizeRequestType(requestType);
  const compact = {};
  const preferredFields = [
    "mode",
    "function",
    "entry_point",
    "target_chain",
    "target_chain_id",
    "request_source",
    "provider",
    "provider_pair",
    "feed_id",
    "pair",
    "symbol",
    "price",
    "decimals",
    "timestamp",
    "upstream_status",
    "randomness",
    "job_id",
    "extracted_value",
  ];

  for (const field of preferredFields) {
    if (workerBody[field] !== undefined && workerBody[field] !== null) {
      compact[field] = workerBody[field];
    }
  }

  if (Array.isArray(workerBody.sources) && workerBody.sources.length > 0) {
    compact.sources = workerBody.sources.slice(0, 4);
  }

  const preferredResult = compactValue(workerBody.result);
  if (preferredResult !== undefined) {
    compact.result = preferredResult;
  } else {
    const extractedValue = compactValue(workerBody.extracted_value, 192);
    if (extractedValue !== undefined) {
      compact.result = extractedValue;
      compact.result_source = "extracted_value";
    } else if (workerBody.result !== undefined) {
      compact.result_omitted = true;
      compact.result_hash = workerBody.output_hash || null;
      compact.result_type = Array.isArray(workerBody.result) ? "array" : typeof workerBody.result;
    }
  }

  if (normalized.includes("feed") && compact.result === undefined && compact.price !== undefined) {
    compact.result = compact.price;
    compact.result_source = "price";
  }

  return Object.keys(compact).length > 0 ? compact : null;
}

function compactEnvelope(requestType, workerResponse) {
  const normalized = normalizeRequestType(requestType);
  const workerBody = workerResponse?.body && typeof workerResponse.body === "object"
    ? workerResponse.body
    : { raw: workerResponse?.body ?? null };

  return {
    version: "morpheus-result/v1",
    request_type: normalized,
    success: Boolean(workerResponse?.ok),
    result: buildBusinessResult(normalized, workerBody),
    verification: buildVerificationEnvelope(workerBody),
  };
}

export function buildOnchainResultEnvelope(requestType, workerResponse) {
  const envelope = compactEnvelope(requestType, workerResponse);
  const attempts = [
    envelope,
    envelope.result && typeof envelope.result === "object"
      ? {
          ...envelope,
          result: Object.fromEntries(
            Object.entries(envelope.result).filter(([key]) => !["request_source", "target_chain_id", "sources"].includes(key)),
          ),
        }
      : envelope,
    envelope.verification
      ? {
          ...envelope,
          verification: {
            output_hash: envelope.verification.output_hash || null,
            attestation_hash: envelope.verification.attestation_hash || null,
            signature: envelope.verification.signature || null,
            public_key: envelope.verification.public_key || null,
            tee_attestation: envelope.verification.tee_attestation
              ? {
                  app_id: envelope.verification.tee_attestation.app_id || null,
                  compose_hash: envelope.verification.tee_attestation.compose_hash || null,
                  report_data: envelope.verification.tee_attestation.report_data || null,
                  quote_hash: envelope.verification.tee_attestation.quote_hash || null,
                }
              : null,
          },
        }
      : envelope,
  ];

  let selected = attempts[attempts.length - 1];
  for (const candidate of attempts) {
    if (measureJsonBytes(candidate) <= 900) {
      selected = candidate;
      break;
    }
  }

  return selected;
}

export function encodeFulfillmentResult(requestType, workerResponse) {
  const normalized = normalizeRequestType(requestType);
  if (!workerResponse.ok) {
    const errorMessage = typeof workerResponse.body?.error === "string"
      ? workerResponse.body.error
      : `worker request failed with status ${workerResponse.status}`;
    return { success: false, result: "", error: trimErrorMessage(errorMessage) };
  }

  const payload = buildOnchainResultEnvelope(normalized, workerResponse);
  return { success: true, result: JSON.stringify(payload), error: "" };
}
