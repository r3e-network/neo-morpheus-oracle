import test from "node:test";
import assert from "node:assert/strict";

import {
  buildOnchainResultEnvelope,
  buildWorkerPayload,
  decodePayloadText,
  encodeFulfillmentResult,
  normalizeRequestType,
  resolveWorkerRoute,
} from "./src/router.js";
import {
  buildEventKey,
  createEmptyRelayerState,
  getDueRetryItems,
  hasProcessedEvent,
  isEventQueuedForRetry,
  recordProcessedEvent,
  scheduleRetry,
  snapshotMetrics,
} from "./src/state.js";
import { encodeUtf8ByteArrayParamValue, hasNeoN3RelayerConfig } from "./src/neo-n3.js";
import { hasNeoXRelayerConfig } from "./src/neo-x.js";

const retryConfig = {
  maxRetries: 3,
  retryBaseDelayMs: 1000,
  retryMaxDelayMs: 10000,
  processedCacheSize: 100,
  deadLetterLimit: 10,
};

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
  const fulfilled = encodeFulfillmentResult("privacy_oracle", {
    ok: true,
    status: 200,
    body: {
      result: true,
      output_hash: "abc",
      attestation_hash: "abc",
      tee_attestation: { report_data: "0xabc" },
    },
  });
  assert.equal(fulfilled.success, true);
  assert.equal(typeof fulfilled.result, "string");
  assert.equal(fulfilled.error, "");

  const parsed = JSON.parse(fulfilled.result);
  assert.equal(parsed.version, "morpheus-result/v1");
  assert.equal(parsed.request_type, "privacy_oracle");
  assert.equal(parsed.result.result, true);
  assert.equal(parsed.verification.output_hash, "abc");
  assert.equal(parsed.verification.tee_attestation.quote_hash, null);

  const failed = encodeFulfillmentResult("compute", { ok: false, status: 400, body: { error: "bad request" } });
  assert.equal(failed.success, false);
  assert.equal(failed.result, "");
  assert.equal(failed.error, "bad request");
});

test("buildOnchainResultEnvelope normalizes verification metadata", () => {
  const envelope = buildOnchainResultEnvelope("vrf", {
    ok: true,
    status: 200,
    body: {
      randomness: "1234",
      verification: {
        output_hash: "deadbeef",
        attestation_hash: "deadbeef",
        tee_attestation: { report_data: "0xdeadbeef", quote: '0x1234', event_log: 'demo-log' },
      },
    },
  });

  assert.equal(envelope.version, "morpheus-result/v1");
  assert.equal(envelope.request_type, "vrf");
  assert.equal(envelope.result.randomness, "1234");
  assert.equal(envelope.verification.output_hash, "deadbeef");
  assert.equal(typeof envelope.verification.tee_attestation.quote_hash, 'string');
  assert.equal(typeof envelope.verification.tee_attestation.event_log_hash, 'string');
});

test("buildOnchainResultEnvelope compacts oversized privacy oracle payloads", () => {
  const envelope = buildOnchainResultEnvelope("privacy_oracle", {
    ok: true,
    status: 200,
    body: {
      mode: "fetch",
      target_chain: "neo_n3",
      result: { huge: "x".repeat(5000) },
      extracted_value: "42",
      verification: {
        output_hash: "deadbeef",
        attestation_hash: "beadfeed",
        tee_attestation: { app_id: "app", compose_hash: "hash", report_data: "rd", quote: "q".repeat(5000), event_log: "e".repeat(5000) },
      },
    },
  });

  const encoded = JSON.stringify(envelope);
  assert.ok(encoded.length < 900);
  assert.equal(envelope.result.result, "42");
  assert.equal(envelope.result.result_source, "extracted_value");
  assert.equal(typeof envelope.verification.tee_attestation.quote_hash, "string");
});

test("state tracks processed events and metrics snapshot", () => {
  const state = createEmptyRelayerState();
  const event = { chain: "neo_n3", requestId: "7", txHash: "0xabc", logIndex: 0, blockNumber: 12, requestType: "privacy_oracle" };
  recordProcessedEvent(state, "neo_n3", event, "fulfilled", { attempts: 1 }, retryConfig);
  assert.equal(hasProcessedEvent(state, "neo_n3", event), true);
  const metrics = snapshotMetrics(state);
  assert.equal(metrics.retry_queue_sizes.neo_n3, 0);
  assert.equal(metrics.checkpoints.neo_n3, null);
  assert.ok(buildEventKey(event).includes("neo_n3:7:0xabc"));
});

test("state schedules retries and marks queued items due", () => {
  const state = createEmptyRelayerState();
  const event = { chain: "neo_x", requestId: "9", txHash: "0xdef", logIndex: 3, blockNumber: 22, requestType: "compute" };
  const scheduled = scheduleRetry(state, "neo_x", event, "temporary failure", retryConfig);
  assert.equal(scheduled.status, "scheduled");
  assert.equal(isEventQueuedForRetry(state, "neo_x", event), true);

  state.neo_x.retry_queue[0].next_retry_at = Date.now() - 1;
  const due = getDueRetryItems(state, "neo_x");
  assert.equal(due.length, 1);
  assert.equal(due[0].key, buildEventKey(event));
});

test("state exhausts retries after max attempts", () => {
  const state = createEmptyRelayerState();
  const event = { chain: "neo_n3", requestId: "11", txHash: "0x123", logIndex: 0, blockNumber: 30, requestType: "datafeed" };
  assert.equal(scheduleRetry(state, "neo_n3", event, "fail-1", retryConfig).status, "scheduled");
  assert.equal(scheduleRetry(state, "neo_n3", event, "fail-2", retryConfig).status, "scheduled");
  assert.equal(scheduleRetry(state, "neo_n3", event, "fail-3", retryConfig).status, "scheduled");
  const exhausted = scheduleRetry(state, "neo_n3", event, "fail-4", retryConfig);
  assert.equal(exhausted.status, "exhausted");
});

test("relayer config accepts derived-key mode for Neo N3 and Neo X", () => {
  const previous = process.env.PHALA_USE_DERIVED_KEYS;
  process.env.PHALA_USE_DERIVED_KEYS = 'true';

  const config = {
    neo_n3: { rpcUrl: 'https://neo.test', oracleContract: '0xabc', updaterWif: '', updaterPrivateKey: '' },
    neo_x: { rpcUrl: 'https://neox.test', oracleContract: '0xdef', updaterPrivateKey: '' },
  };

  assert.equal(hasNeoN3RelayerConfig(config), true);
  assert.equal(hasNeoXRelayerConfig(config), true);

  process.env.PHALA_USE_DERIVED_KEYS = previous;
});

test("encodeUtf8ByteArrayParamValue encodes JSON payloads as base64 utf8", () => {
  const encoded = encodeUtf8ByteArrayParamValue('{"ok":true}');
  assert.equal(Buffer.from(encoded, 'base64').toString('utf8'), '{"ok":true}');
});

test("buildOnchainResultEnvelope keeps working when verification is missing", () => {
  const envelope = buildOnchainResultEnvelope("privacy_oracle", {
    ok: true,
    status: 200,
    body: { result: { ok: true } },
  });
  assert.equal(envelope.version, 'morpheus-result/v1');
  assert.equal(envelope.verification, null);
});
