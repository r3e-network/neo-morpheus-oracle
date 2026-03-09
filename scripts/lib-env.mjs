import fs from 'node:fs/promises';
import path from 'node:path';

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseDotEnv(raw) {
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index < 0) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export async function loadDotEnv(envPath = path.resolve(process.cwd(), '.env'), options = {}) {
  try {
    const raw = await fs.readFile(envPath, 'utf8');
    const parsed = parseDotEnv(raw);
    const override = options.override ?? true;
    for (const [key, value] of Object.entries(parsed)) {
      if (override || !trimString(process.env[key])) {
        process.env[key] = value;
      }
    }
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}
