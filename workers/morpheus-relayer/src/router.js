import { createHash } from "node:crypto";
const FULFILLMENT_SIGNATURE_DOMAIN = Buffer.from("morpheus-fulfillment-v2", "utf8");

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function strip0x(value) {
  return trimString(value).replace(/^0x/i, "");
}

function sha256Hex(value) {
  return createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
}

function sha256Buffer(value) {
  const buffer = Buffer.isBuffer(value)
    ? value
    : value instanceof Uint8Array
      ? Buffer.from(value)
      : Buffer.from(String(value ?? ""), "utf8");
  return createHash("sha256").update(buffer).digest();
}

function encodeLengthPrefixedUtf8(value) {
  const bytes = Buffer.from(trimString(value), "utf8");
  if (bytes.length > 255) throw new Error("compact callback segment exceeds 255 bytes");
  return Buffer.concat([Buffer.from([bytes.length]), bytes]);
}

function encodeHash160Bytes(value, fieldName) {
  const raw = strip0x(value);
  if (!/^[0-9a-f]{40}$/i.test(raw)) throw new Error(`invalid hash160 for ${fieldName}`);
  return Buffer.from(raw, "hex");
}

function encodeHashBytes(value, fieldName) {
  const raw = strip0x(value);
  if (!/^[0-9a-f]{64}$/i.test(raw)) throw new Error(`invalid 32-byte hash for ${fieldName}`);
  return Buffer.from(raw, "hex");
}

function encodeSignatureBytes(value, fieldName = "signature") {
  const raw = strip0x(value);
  if (!/^[0-9a-f]{128}$/i.test(raw)) throw new Error(`invalid 64-byte signature for ${fieldName}`);
  return Buffer.from(raw, "hex");
}

function encodeNeoN3RecoveryTicketV1(workerBody) {
  return Buffer.concat([
    Buffer.from([0x01]),
    encodeHash160Bytes(workerBody.new_owner, "new_owner"),
    encodeLengthPrefixedUtf8(workerBody.recovery_nonce),
    encodeLengthPrefixedUtf8(workerBody.expires_at),
    encodeLengthPrefixedUtf8(workerBody.action_id),
    encodeHashBytes(workerBody.master_nullifier, "master_nullifier"),
    encodeHashBytes(workerBody.action_nullifier, "action_nullifier"),
    encodeSignatureBytes(workerBody.signature, "signature"),
  ]);
}

function encodeNeoN3ActionTicketV1(workerBody) {
  return Buffer.concat([
    Buffer.from([0x01]),
    encodeHash160Bytes(workerBody.disposable_account, "disposable_account"),
    encodeLengthPrefixedUtf8(workerBody.action_id),
    encodeHashBytes(workerBody.action_nullifier, "action_nullifier"),
    encodeSignatureBytes(workerBody.signature, "signature"),
  ]);
}

function encodeNeoN3RecoveryTicketV3(workerBody) {
  return Buffer.from([
    "3",
    Buffer.from(encodeHashBytes(workerBody.master_nullifier, "master_nullifier")).toString("base64"),
    Buffer.from(encodeHashBytes(workerBody.action_nullifier, "action_nullifier")).toString("base64"),
    Buffer.from(encodeSignatureBytes(workerBody.signature, "signature")).toString("base64"),
  ].join("|"), "utf8");
}

function encodeNeoN3ActionTicketV3(workerBody) {
  return Buffer.from([
    "3",
    Buffer.from(encodeHashBytes(workerBody.action_nullifier, "action_nullifier")).toString("base64"),
    Buffer.from(encodeSignatureBytes(workerBody.signature, "signature")).toString("base64"),
  ].join("|"), "utf8");
}

function resolveCompactCallbackBytes(requestType, workerResponse) {
  const normalized = normalizeRequestType(requestType);
  const workerBody = workerResponse?.body && typeof workerResponse.body === "object"
    ? workerResponse.body
    : null;
  if (workerBody && (normalized === "rng" || normalized.includes("vrf") || normalized.includes("random"))) {
    const randomness = strip0x(workerBody.randomness || "");
    if (/^[0-9a-f]{64}$/i.test(randomness)) {
      return Buffer.from(randomness, "hex");
    }
  }
  const callbackEncoding = normalizeRequestType(workerBody?.callback_encoding || "");
  if (!workerBody || !callbackEncoding) return null;

  if (normalized === "neodid_recovery_ticket" && callbackEncoding === "neo_n3_recovery_v1") {
    return encodeNeoN3RecoveryTicketV1(workerBody);
  }
  if (normalized === "neodid_recovery_ticket" && callbackEncoding === "neo_n3_recovery_v3") {
    return encodeNeoN3RecoveryTicketV3(workerBody);
  }
  if (normalized === "neodid_action_ticket" && callbackEncoding === "neo_n3_action_v1") {
    return encodeNeoN3ActionTicketV1(workerBody);
  }
  if (normalized === "neodid_action_ticket" && callbackEncoding === "neo_n3_action_v3") {
    return encodeNeoN3ActionTicketV3(workerBody);
  }
  return null;
}

function encodeUint256Bytes(value) {
  const numeric = BigInt(String(value ?? "0"));
  if (numeric < 0n) throw new Error("uint256 value must be non-negative");
  return Buffer.from(numeric.toString(16).padStart(64, "0"), "hex");
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
  if (normalized.includes("paymaster")) return "/paymaster/authorize";
  if (normalized.includes("compute")) return "/compute/execute";
  if (normalized.includes("feed")) return "/oracle/feed";
  if (normalized === "rng" || normalized.includes("vrf") || normalized.includes("random")) return "/vrf/random";
  if (normalized.startsWith("neodid")) {
    if (normalized.includes("recovery")) return "/neodid/recovery-ticket";
    if (normalized.includes("action")) return "/neodid/action-ticket";
    return "/neodid/bind";
  }
  return "/oracle/smart-fetch";
}

export function buildWorkerPayload(chain, requestType, payload, requestId, context = {}) {
  return {
    ...payload,
    request_id: String(requestId),
    request_source: `morpheus-relayer:${chain}`,
    target_chain: payload.target_chain || chain,
    requester: context.requester || payload.requester || "",
    callback_contract: context.callbackContract || payload.callback_contract || "",
    callback_method: context.callbackMethod || payload.callback_method || "",
  };
}

export function buildFulfillmentDigestBytes(requestId, requestType, success, result, error, resultBytesBase64 = "") {
  const successByte = Buffer.from([success ? 1 : 0]);
  const resultBytes = trimString(resultBytesBase64)
    ? Buffer.from(trimString(resultBytesBase64), "base64")
    : Buffer.from(String(result || ""), "utf8");
  return createHash("sha256").update(Buffer.concat([
    FULFILLMENT_SIGNATURE_DOMAIN,
    encodeUint256Bytes(requestId),
    sha256Buffer(trimString(requestType || "")),
    successByte,
    sha256Buffer(resultBytes),
    sha256Buffer(trimString(error || "")),
  ])).digest();
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
    "action",
    "function",
    "entry_point",
    "target_chain",
    "target_chain_id",
    "request_source",
    "provider",
    "claim_type",
    "claim_value",
    "master_nullifier",
    "provider_pair",
    "feed_id",
    "pair",
    "symbol",
    "action_id",
    "action_nullifier",
    "aa_contract",
    "verifier_contract",
    "account_id",
    "account_address",
    "new_owner",
    "recovery_nonce",
    "expires_at",
    "digest",
    "price",
    "decimals",
    "timestamp",
    "automation_id",
    "trigger_type",
    "next_run_at",
    "status",
    "chain",
    "requester",
    "callback_contract",
    "execution_request_type",
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

  const compactBytes = resolveCompactCallbackBytes(normalized, workerResponse);
  if (compactBytes) {
    return {
      success: true,
      result: "",
      result_bytes_base64: compactBytes.toString("base64"),
      error: "",
    };
  }

  const payload = buildOnchainResultEnvelope(normalized, workerResponse);
  return { success: true, result: JSON.stringify(payload), error: "" };
}
