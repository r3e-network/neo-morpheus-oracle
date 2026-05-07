import path from 'node:path';

import { readMergedDotEnvFiles } from './lib-env.mjs';

export const WEB_CRON_REQUIRED_ENV = Object.freeze([
  'CRON_SECRET',
  'MORPHEUS_BETTERSTACK_CRON_FEED_HEARTBEAT_URL',
  'MORPHEUS_BETTERSTACK_CRON_FEED_FAILURE_URL',
  'MORPHEUS_BETTERSTACK_CRON_HEALTH_HEARTBEAT_URL',
]);

export function defaultWebCronEnvFiles(repoRoot = process.cwd()) {
  return [
    path.join(repoRoot, 'apps/web/.env.production.local'),
    path.join(repoRoot, 'apps/web/.env.local'),
    path.join(repoRoot, 'apps/web/.vercel/.env.production.local'),
  ];
}

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export async function inspectWebCronEnv({
  repoRoot = process.cwd(),
  env = process.env,
  envFiles = defaultWebCronEnvFiles(repoRoot),
} = {}) {
  const fileEnv = await readMergedDotEnvFiles(envFiles);
  const effective = { ...fileEnv, ...env };
  const keys = WEB_CRON_REQUIRED_ENV.map((key) => ({
    key,
    present: Boolean(trimString(effective[key])),
  }));
  const missing = keys.filter((entry) => !entry.present).map((entry) => entry.key);

  return {
    ok: missing.length === 0,
    checked_files: envFiles.map((file) => path.relative(repoRoot, file)),
    keys,
    missing,
  };
}
