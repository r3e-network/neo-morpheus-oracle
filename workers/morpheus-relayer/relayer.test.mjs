import test from "node:test";
import assert from "node:assert/strict";

import {
  buildWorkerPayload,
  decodePayloadText,
  encodeFulfillmentResult,
  normalizeRequestType,
  resolveWorkerRoute,
} from "./src/router.js";

test("normalizeRequestType normalizes separators and casing", () => {
  assert.equal(normalizeRequestType("Privacy-Oracle"), "privacy_oracle");
  assert.equal(normalizeRequestType("  ZKP Compute "), "zkp_compute");
});

test("resolveWorkerRoute routes compute, feed, vrf, and oracle payloads", () => {
  assert.equal(resolveWorkerRoute("compute", {}), "/compute/execute");
  assert.equal(resolveWorkerRoute("datafeed", {}), "/oracle/feed");
  assert.equal(resolveWorkerRoute("vrf", {}), "/vrf/random");
  assert.equal(resolveWorkerRoute("privacy_oracle", { script: "function process(){}" }), "/oracle/smart-fetch");
  assert.equal(resolveWorkerRoute("privacy_oracle", {}), "/oracle/smart-fetch");
});

test("decodePayloadText parses JSON and preserves raw strings", () => {
  assert.deepEqual(decodePayloadText('{"provider":"twelvedata"}'), { provider: "twelvedata" });
  assert.deepEqual(decodePayloadText("not-json"), { raw_payload: "not-json" });
});

test("buildWorkerPayload injects relayer metadata", () => {
  assert.deepEqual(buildWorkerPayload("neo_n3", "privacy_oracle", { provider: "twelvedata" }, 42), {
    provider: "twelvedata",
    request_id: "42",
    request_source: "morpheus-relayer:neo_n3",
    target_chain: "neo_n3",
  });
});

test("encodeFulfillmentResult returns success envelope for worker output", () => {
  const fulfilled = encodeFulfillmentResult("privacy_oracle", { ok: true, status: 200, body: { result: true } });
  assert.equal(fulfilled.success, true);
  assert.equal(typeof fulfilled.result, "string");
  assert.equal(fulfilled.error, "");

  const failed = encodeFulfillmentResult("compute", { ok: false, status: 400, body: { error: "bad request" } });
  assert.equal(failed.success, false);
  assert.equal(failed.result, "");
  assert.equal(failed.error, "bad request");
});
