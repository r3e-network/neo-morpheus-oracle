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

export function encodeFulfillmentResult(requestType, workerResponse) {
  const normalized = normalizeRequestType(requestType);
  if (!workerResponse.ok) {
    const errorMessage = typeof workerResponse.body?.error === "string"
      ? workerResponse.body.error
      : `worker request failed with status ${workerResponse.status}`;
    return { success: false, result: "", error: errorMessage };
  }

  const payload = {
    request_type: normalized,
    fulfilled_at: new Date().toISOString(),
    worker_status: workerResponse.status,
    result: workerResponse.body,
  };
  return { success: true, result: JSON.stringify(payload), error: "" };
}
