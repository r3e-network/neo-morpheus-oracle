import { createHash } from "node:crypto";

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "bigint") return JSON.stringify(value.toString());
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`).join(",")}}`;
}

function sha256Hex(value: unknown) {
  const buffer = Buffer.isBuffer(value)
    ? value
    : value instanceof Uint8Array
      ? Buffer.from(value)
      : Buffer.from(typeof value === "string" ? value : stableStringify(value), "utf8");
  return createHash("sha256").update(buffer).digest("hex");
}

function normalizeHex(value: unknown) {
  return String(value || "").trim().replace(/^0x/i, "").toLowerCase();
}

function unwrapAttestation(input: unknown) {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  if (record.tee_attestation && typeof record.tee_attestation === "object") return record.tee_attestation as Record<string, unknown>;
  if (record.attestation && typeof record.attestation === "object") return record.attestation as Record<string, unknown>;
  return record;
}

export function verifyAttestation(input: {
  attestation: unknown;
  expectedPayload?: unknown;
  expectedOutputHash?: string;
  expectedComposeHash?: string;
  expectedAppId?: string;
  expectedInstanceId?: string;
}) {
  const attestation = unwrapAttestation(input.attestation);
  if (!attestation) {
    return {
      ok: false,
      error: "attestation object missing",
      checks: {},
    };
  }

  const expectedReportData = normalizeHex(
    input.expectedOutputHash
      || (input.expectedPayload !== undefined ? sha256Hex(input.expectedPayload) : ""),
  );
  const actualReportData = normalizeHex(attestation.report_data);
  const actualComposeHash = String(attestation.compose_hash || "").trim();
  const actualAppId = String(attestation.app_id || "").trim();
  const actualInstanceId = String(attestation.instance_id || "").trim();

  const checks = {
    has_quote: Boolean(attestation.quote),
    has_event_log: Object.prototype.hasOwnProperty.call(attestation, "event_log"),
    has_report_data: Boolean(actualReportData),
    report_data_matches: expectedReportData ? actualReportData === expectedReportData : null,
    compose_hash_matches: input.expectedComposeHash ? actualComposeHash === input.expectedComposeHash : null,
    app_id_matches: input.expectedAppId ? actualAppId === input.expectedAppId : null,
    instance_id_matches: input.expectedInstanceId ? actualInstanceId === input.expectedInstanceId : null,
  };

  const failed = Object.entries(checks)
    .filter(([, value]) => value === false)
    .map(([key]) => key);

  return {
    ok: failed.length === 0 && checks.has_quote && checks.has_event_log && checks.has_report_data,
    checks,
    attestation: {
      app_id: actualAppId || null,
      instance_id: actualInstanceId || null,
      compose_hash: actualComposeHash || null,
      report_data: actualReportData ? `0x${actualReportData}` : null,
      device_id: attestation.device_id || null,
      app_name: attestation.app_name || null,
    },
    expected: {
      report_data: expectedReportData ? `0x${expectedReportData}` : null,
      compose_hash: input.expectedComposeHash || null,
      app_id: input.expectedAppId || null,
      instance_id: input.expectedInstanceId || null,
    },
    failed,
    note: "This verifier checks application-level attestation consistency. It does not fully validate Intel/TDX quote signatures.",
  };
}
