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

function buildBusinessResult(workerBody) {
  if (!workerBody || typeof workerBody !== "object") return workerBody;
  const result = { ...workerBody };
  delete result.output_hash;
  delete result.attestation_hash;
  delete result.signature;
  delete result.public_key;
  delete result.signer_address;
  delete result.signer_script_hash;
  delete result.tee_attestation;
  delete result.verification;
  return result;
}

export function buildOnchainResultEnvelope(requestType, workerResponse) {
  const normalized = normalizeRequestType(requestType);
  const workerBody = workerResponse?.body && typeof workerResponse.body === "object"
    ? workerResponse.body
    : { raw: workerResponse?.body ?? null };

  return {
    version: "morpheus-result/v1",
    request_type: normalized,
    fulfilled_at: new Date().toISOString(),
    worker_status: workerResponse?.status ?? null,
    success: Boolean(workerResponse?.ok),
    route: workerBody.route || null,
    result: buildBusinessResult(workerBody),
    verification: buildVerificationEnvelope(workerBody),
  };
}

export function encodeFulfillmentResult(requestType, workerResponse) {
  const normalized = normalizeRequestType(requestType);
  if (!workerResponse.ok) {
    const errorMessage = typeof workerResponse.body?.error === "string"
      ? workerResponse.body.error
      : `worker request failed with status ${workerResponse.status}`;
    return { success: false, result: "", error: errorMessage };
  }

  const payload = buildOnchainResultEnvelope(normalized, workerResponse);
  return { success: true, result: JSON.stringify(payload), error: "" };
}
