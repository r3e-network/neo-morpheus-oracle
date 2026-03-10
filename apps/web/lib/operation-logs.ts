import { createHash, randomUUID } from "node:crypto";

import { getServerSupabaseClient, resolveProjectIdBySlug } from "./server-supabase";

type OperationCategory =
  | "oracle"
  | "compute"
  | "feed"
  | "provider_config"
  | "relayer"
  | "signing"
  | "relay"
  | "runtime"
  | "attestation"
  | "network"
  | "system";

type OperationLogInput = {
  route: string;
  method: string;
  category: OperationCategory;
  requestPayload?: unknown;
  responsePayload?: unknown;
  httpStatus?: number;
  error?: string | null;
  metadata?: Record<string, unknown>;
};

const SENSITIVE_KEY_PATTERN = /(authorization|token|secret|password|private[_-]?key|wif|api[_-]?key)/i;
const MAX_JSON_CHARS = 24000;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function trimString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function sha256Hex(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function shouldPreserveCiphertext(path: string[]) {
  return path.some((segment) => segment === "encrypted_inputs" || segment.startsWith("encrypted_"));
}

function sanitizeValue(value: unknown, path: string[] = []): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item, index) => sanitizeValue(item, [...path, String(index)]));
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, current]) => [key, sanitizeValue(current, [...path, key])]),
    );
  }
  if (typeof value === "string") {
    const currentKey = path[path.length - 1] || "";
    if (shouldPreserveCiphertext(path)) return value;
    if (SENSITIVE_KEY_PATTERN.test(currentKey)) return "[REDACTED]";
    return value;
  }
  return value;
}

function compactJsonValue(value: unknown) {
  const sanitized = sanitizeValue(value);
  try {
    const serialized = JSON.stringify(sanitized);
    if (serialized.length <= MAX_JSON_CHARS) return sanitized;
    return {
      truncated: true,
      size: serialized.length,
      sha256: sha256Hex(serialized),
      preview: serialized.slice(0, 1024),
    };
  } catch {
    return { serialization_error: true };
  }
}

function collectEncryptedFields(value: unknown, path: string[] = [], results: Array<{ field_path: string; ciphertext: string; algorithm: string }> = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectEncryptedFields(entry, [...path, String(index)], results));
    return results;
  }
  if (!isPlainObject(value)) return results;

  for (const [key, current] of Object.entries(value)) {
    const nextPath = [...path, key];
    const preserve = key.startsWith("encrypted_") || path.includes("encrypted_inputs");
    if (preserve && typeof current === "string" && trimString(current)) {
      const raw = trimString(current);
      let algorithm = "client-supplied-ciphertext";
      try {
        const decoded = Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
        const parsed = safeJsonParse(decoded);
        if (isPlainObject(parsed) && trimString(parsed.algorithm)) {
          algorithm = trimString(parsed.algorithm);
        }
      } catch {
        // keep default
      }
      results.push({
        field_path: nextPath.join("."),
        ciphertext: raw,
        algorithm,
      });
      continue;
    }
    collectEncryptedFields(current, nextPath, results);
  }
  return results;
}

function resolveTargetChain(requestPayload: unknown, metadata: Record<string, unknown>) {
  const fromRequest = isPlainObject(requestPayload) ? trimString(requestPayload.target_chain) : "";
  const fromMetadata = trimString(metadata.target_chain);
  const candidate = fromRequest || fromMetadata;
  return candidate === "neo_n3" || candidate === "neo_x" ? candidate : null;
}

export async function recordOperationLog(input: OperationLogInput) {
  try {
    const supabase = getServerSupabaseClient();
    if (!supabase) return;

    const metadata = isPlainObject(input.metadata) ? input.metadata : {};
    const requestObject = isPlainObject(input.requestPayload) ? input.requestPayload : {};
    const projectSlug = trimString(requestObject.project_slug || metadata.project_slug || "");
    const targetChain = resolveTargetChain(input.requestPayload, metadata);
    const requestId = trimString(requestObject.request_id || metadata.request_id || "");
    const operationId = trimString(metadata.operation_id || "") || randomUUID();

    let projectId: string | null = null;
    if (projectSlug) {
      try {
        projectId = await resolveProjectIdBySlug(supabase, projectSlug);
      } catch {
        projectId = null;
      }
    }

    await supabase.from("morpheus_operation_logs").insert({
      operation_id: operationId,
      route: input.route,
      method: input.method.toUpperCase(),
      category: input.category,
      project_id: projectId,
      project_slug: projectSlug || null,
      request_id: requestId || null,
      target_chain: targetChain,
      status: input.httpStatus && input.httpStatus >= 200 && input.httpStatus < 400 ? "ok" : "error",
      http_status: input.httpStatus || null,
      request_payload: compactJsonValue(input.requestPayload),
      response_payload: input.responsePayload === undefined ? null : compactJsonValue(input.responsePayload),
      error: trimString(input.error || "") || null,
      metadata: compactJsonValue(metadata),
    });

    if (!targetChain) return;
    const encryptedFields = collectEncryptedFields(input.requestPayload);
    if (encryptedFields.length === 0) return;

    const rows = encryptedFields.map((entry) => ({
      project_id: projectId,
      name: `${input.route}:${operationId}:${entry.field_path}`,
      target_chain: targetChain,
      encryption_algorithm: entry.algorithm,
      key_version: 1,
      ciphertext: entry.ciphertext,
      metadata: {
        operation_id: operationId,
        route: input.route,
        method: input.method.toUpperCase(),
        request_id: requestId || null,
        field_path: entry.field_path,
        ciphertext_sha256: sha256Hex(entry.ciphertext),
      },
    }));

    await supabase.from("morpheus_encrypted_secrets").insert(rows);
  } catch (error) {
    console.warn("[morpheus] failed to record operation log", error);
  }
}
