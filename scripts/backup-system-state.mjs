import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";

import { loadDotEnv } from "./lib-env.mjs";

const execFileAsync = promisify(execFile);

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function sha256Hex(value) {
  return createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
}

function sanitizeEnvObject(input) {
  const out = {};
  for (const [key, value] of Object.entries(input)) {
    out[key] = String(value ?? "");
  }
  return out;
}

async function readEnvFile(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 0) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    out[key] = value;
  }
  return out;
}

async function ensureBackupDir(baseDir) {
  await fs.mkdir(baseDir, { recursive: true });
}

async function fetchRuntimeConfig(appId, apiToken) {
  const { stdout } = await execFileAsync("phala", [
    "runtime-config",
    "--api-token",
    apiToken,
    appId,
    "--json",
  ], { maxBuffer: 10 * 1024 * 1024 });
  return JSON.parse(stdout);
}

async function backupOracleKeystore(appId, apiToken, destination) {
  const candidateContainers = [
    "morpheus-phala-worker",
    "dstack-phala-worker-1",
  ];

  let lastError = null;
  for (const containerName of candidateContainers) {
    try {
      const { stdout } = await execFileAsync("phala", [
        "ssh",
        "--api-token",
        apiToken,
        appId,
        "--",
        "docker",
        "exec",
        containerName,
        "cat",
        "/data/morpheus/oracle-key.json",
      ], { maxBuffer: 10 * 1024 * 1024 });
      await fs.writeFile(destination, stdout, "utf8");
      return JSON.parse(stdout);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("failed to back up oracle keystore");
}

async function insertSupabaseBackupRows(rows) {
  const baseUrl = trimString(process.env.SUPABASE_URL || process.env.morpheus_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "");
  const apiKey = trimString(
    process.env.SUPABASE_SECRET_KEY
      || process.env.morpheus_SUPABASE_SECRET_KEY
      || process.env.SUPABASE_SERVICE_ROLE_KEY
      || process.env.morpheus_SUPABASE_SERVICE_ROLE_KEY
      || "",
  );
  if (!baseUrl || !apiKey) {
    throw new Error("SUPABASE_URL and a Supabase secret or service-role key are required");
  }
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/rest/v1/morpheus_system_backups`, {
    method: "POST",
    headers: {
      apikey: apiKey,
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      prefer: "return=representation",
    },
    body: JSON.stringify(rows),
  });
  if (!response.ok) {
    throw new Error(`Supabase backup insert failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

await loadDotEnv(path.resolve(process.cwd(), ".env"), { override: false });

const appId = trimString(process.env.PHALA_APP_ID || "966f16610bdfe1794a503e16c5ae0bc69a1d92f1");
const apiToken = trimString(process.env.PHALA_API_TOKEN || process.env.PHALA_SHARED_SECRET || "");
if (!apiToken) throw new Error("PHALA_API_TOKEN or PHALA_SHARED_SECRET is required");

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupRoot = path.resolve(process.cwd(), "private-backups", appId, timestamp);
await ensureBackupDir(backupRoot);

const localEnvPath = path.resolve(process.cwd(), ".env");
const backupNetwork = trimString(process.env.MORPHEUS_NETWORK || process.env.PHALA_ENV_NETWORK || "mainnet") || "mainnet";
const phalaEnvPath = path.resolve(process.cwd(), `deploy/phala/morpheus.${backupNetwork}.env`);
const keystoreBackupPath = path.join(backupRoot, "oracle-key.json");
const runtimeConfigPath = path.join(backupRoot, "runtime-config.json");
const localEnvBackupPath = path.join(backupRoot, ".env.snapshot.json");
const phalaEnvBackupPath = path.join(backupRoot, `morpheus.${backupNetwork}.env.snapshot.json`);

const [localEnvRaw, phalaEnvRaw, runtimeConfig, oracleKeystore] = await Promise.all([
  readEnvFile(localEnvPath),
  readEnvFile(phalaEnvPath),
  fetchRuntimeConfig(appId, apiToken),
  backupOracleKeystore(appId, apiToken, keystoreBackupPath),
]);

await fs.writeFile(localEnvBackupPath, JSON.stringify(localEnvRaw, null, 2) + "\n", "utf8");
await fs.writeFile(phalaEnvBackupPath, JSON.stringify(phalaEnvRaw, null, 2) + "\n", "utf8");
await fs.writeFile(runtimeConfigPath, JSON.stringify(runtimeConfig, null, 2) + "\n", "utf8");

const rows = [
  {
    backup_kind: "local_env",
    network: backupNetwork,
    backup_scope: appId,
    checksum: sha256Hex(localEnvRaw),
    payload: sanitizeEnvObject(localEnvRaw),
    metadata: { timestamp, source_path: ".env" },
  },
  {
    backup_kind: "phala_env",
    network: backupNetwork,
    backup_scope: appId,
    checksum: sha256Hex(phalaEnvRaw),
    payload: sanitizeEnvObject(phalaEnvRaw),
    metadata: { timestamp, network: backupNetwork, source_path: `deploy/phala/morpheus.${backupNetwork}.env` },
  },
  {
    backup_kind: "cvm_runtime_config",
    network: backupNetwork,
    backup_scope: appId,
    checksum: sha256Hex(runtimeConfig),
    payload: runtimeConfig,
    metadata: { timestamp },
  },
  {
    backup_kind: "oracle_keystore",
    network: backupNetwork,
    backup_scope: appId,
    checksum: sha256Hex(oracleKeystore),
    payload: oracleKeystore,
    metadata: {
      timestamp,
      keystore_path: "/data/morpheus/oracle-key.json",
      note: "sealed Oracle X25519 transport key backup copied from CVM",
    },
  },
];

const inserted = await insertSupabaseBackupRows(rows);

console.log(JSON.stringify({
  app_id: appId,
  backup_dir: backupRoot,
  inserted_rows: inserted.length,
  kinds: inserted.map((row) => row.backup_kind),
}, null, 2));
