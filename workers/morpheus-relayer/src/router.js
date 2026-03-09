function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
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

function buildVerificationEnvelope(workerBody) {
  if (!workerBody || typeof workerBody !== "object") return null;
  const existing = workerBody.verification && typeof workerBody.verification === "object"
    ? workerBody.verification
    : null;
  if (existing) return existing;

  const hasAny = workerBody.output_hash
    || workerBody.attestation_hash
    || workerBody.signature
    || workerBody.public_key
    || workerBody.tee_attestation;
  if (!hasAny) return null;

  return {
    output_hash: workerBody.output_hash || null,
    attestation_hash: workerBody.attestation_hash || null,
    signature: workerBody.signature || null,
    public_key: workerBody.public_key || null,
    signer_address: workerBody.signer_address || null,
    signer_script_hash: workerBody.signer_script_hash || null,
    tee_attestation: workerBody.tee_attestation || null,
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
