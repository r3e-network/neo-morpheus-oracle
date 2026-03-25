import { loadDotEnv } from './lib-env.mjs';
import { execFileSync } from 'node:child_process';

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

await loadDotEnv('.env.local');
await loadDotEnv('.env');

const apiKey = trimString(process.env.CHECKLY_API_KEY);
const accountId = trimString(process.env.CHECKLY_ACCOUNT_ID);
const projectName = trimString(process.env.CHECKLY_PROJECT_NAME || 'meshmini');

if (!apiKey || !accountId) {
  console.error('Missing CHECKLY_API_KEY or CHECKLY_ACCOUNT_ID.');
  process.exit(1);
}

const AA_BASE_URL = 'https://neo-abstract-account.vercel.app';

const baseHeaders = {
  'X-Checkly-Account': accountId,
  Authorization: `Bearer ${apiKey}`,
  Accept: 'application/json',
  'Content-Type': 'application/json',
};

async function api(pathname, init = {}) {
  const method = init.method || 'GET';
  const headers = {
    ...baseHeaders,
    ...(init.headers || {}),
  };

  const args = [
    '-sS',
    '-X',
    method,
  ];

  for (const [key, value] of Object.entries(headers)) {
    args.push('-H', `${key}: ${value}`);
  }

  if (init.body !== undefined) {
    args.push('--data', String(init.body));
  }

  args.push(`https://api.checklyhq.com/v1${pathname}`);

  const stdout = execFileSync('curl', args, { encoding: 'utf8' });
  return JSON.parse(stdout);
}

function buildBrowserScript(url, headingPattern) {
  return `const { chromium } = require("playwright");\n(async () => {\n  const browser = await chromium.launch();\n  const page = await browser.newPage();\n  await page.goto(${JSON.stringify(url)}, { waitUntil: "domcontentloaded" });\n  await page.getByRole("heading", { name: ${headingPattern} }).waitFor({ state: "visible", timeout: 30000 });\n  await browser.close();\n})();`;
}

const desiredChecks = [
  {
    name: 'aa-home-browser',
    url: `${AA_BASE_URL}/`,
    sslCheckDomain: 'neo-abstract-account.vercel.app',
    script: buildBrowserScript(`${AA_BASE_URL}/`, '/Smart Wallets That Never Lock You Out/i'),
  },
  {
    name: 'aa-identity-browser',
    url: `${AA_BASE_URL}/identity`,
    sslCheckDomain: 'neo-abstract-account.vercel.app',
    script: buildBrowserScript(`${AA_BASE_URL}/identity`, '/Web3Auth \\/ NeoDID Workspace/i'),
  },
];

function buildBrowserPayload(spec) {
  return {
    name: spec.name,
    checkType: 'BROWSER',
    activated: true,
    muted: false,
    shouldFail: false,
    frequency: 360,
    locations: ['us-east-1'],
    tags: [projectName, 'aa', 'browser'],
    sslCheckDomain: spec.sslCheckDomain,
    script: spec.script,
  };
}

const existing = await api('/checks?limit=100');
const existingByName = new Map(
  (Array.isArray(existing) ? existing : []).map((check) => [String(check.name || ''), check])
);

const created = [];
const updated = [];

for (const spec of desiredChecks) {
  const payload = buildBrowserPayload(spec);
  const existingCheck = existingByName.get(spec.name);

  if (existingCheck) {
    const check = await api(`/checks/${existingCheck.id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    updated.push({
      name: spec.name,
      id: check?.id || existingCheck.id,
      frequency: 360,
    });
    continue;
  }

  const check = await api('/checks/browser', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  created.push({
    name: spec.name,
    id: check?.id || null,
    url: spec.url,
  });
}

console.log(
  JSON.stringify(
    {
      account_id: accountId,
      project_name: projectName,
      created,
      updated,
      total_browser_checks: desiredChecks.length,
    },
    null,
    2
  )
);
