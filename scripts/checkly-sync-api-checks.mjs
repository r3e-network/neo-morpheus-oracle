import { loadDotEnv } from './lib-env.mjs';

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

const baseHeaders = {
  'X-Checkly-Account': accountId,
  Authorization: `Bearer ${apiKey}`,
  Accept: 'application/json',
  'Content-Type': 'application/json',
};

async function api(pathname, init = {}) {
  const response = await fetch(`https://api.checklyhq.com/v1${pathname}`, {
    ...init,
    headers: {
      ...baseHeaders,
      ...(init.headers || {}),
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(JSON.stringify(payload || { status: response.status }, null, 2));
  }
  return payload;
}

const desiredChecks = [
  {
    name: 'morpheus-oracle-testnet-health',
    url: 'https://oracle.meshmini.app/testnet/health',
    expectedStatus: '200',
  },
  {
    name: 'morpheus-oracle-mainnet-health',
    url: 'https://oracle.meshmini.app/mainnet/health',
    expectedStatus: '200',
  },
  {
    name: 'morpheus-oracle-testnet-public-key',
    url: 'https://oracle.meshmini.app/testnet/oracle/public-key',
    expectedStatus: '200',
  },
  {
    name: 'morpheus-oracle-mainnet-public-key',
    url: 'https://oracle.meshmini.app/mainnet/oracle/public-key',
    expectedStatus: '200',
  },
  {
    name: 'morpheus-control-testnet-health-auth-gate',
    url: 'https://control.meshmini.app/testnet/health',
    expectedStatus: '401',
  },
  {
    name: 'morpheus-control-mainnet-health-auth-gate',
    url: 'https://control.meshmini.app/mainnet/health',
    expectedStatus: '401',
  },
];

const existing = await api('/checks');
const existingByName = new Map(
  (Array.isArray(existing) ? existing : []).map((check) => [String(check.name || ''), check])
);

const created = [];
const skipped = [];

for (const spec of desiredChecks) {
  if (existingByName.has(spec.name)) {
    skipped.push({
      name: spec.name,
      id: existingByName.get(spec.name)?.id || null,
    });
    continue;
  }

  const payload = {
    name: spec.name,
    checkType: 'API',
    activated: true,
    muted: false,
    shouldFail: false,
    frequency: 10,
    locations: ['us-east-1'],
    degradedResponseTime: 5000,
    maxResponseTime: 20000,
    tags: [projectName, 'morpheus', 'api'],
    request: {
      method: 'GET',
      url: spec.url,
      followRedirects: true,
      skipSSL: false,
      body: '',
      bodyType: 'NONE',
      headers: [],
      queryParameters: [],
      assertions: [
        {
          source: 'STATUS_CODE',
          comparison: 'EQUALS',
          target: spec.expectedStatus,
        },
      ],
    },
  };

  const check = await api('/checks/api', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  created.push({
    name: spec.name,
    id: check?.id || null,
    url: spec.url,
    expected_status: spec.expectedStatus,
  });
}

console.log(
  JSON.stringify(
    {
      account_id: accountId,
      project_name: projectName,
      created,
      skipped,
      total_checks_after: (Array.isArray(existing) ? existing.length : 0) + created.length,
    },
    null,
    2
  )
);
