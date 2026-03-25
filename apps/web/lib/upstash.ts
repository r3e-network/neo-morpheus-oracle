function trimString(value: string | null | undefined) {
  return String(value || '').trim();
}

function getUpstashConfig() {
  const baseUrl = trimString(process.env.UPSTASH_REDIS_REST_URL);
  const token = trimString(process.env.UPSTASH_REDIS_REST_TOKEN);
  if (!baseUrl || !token) return null;
  return {
    baseUrl: baseUrl.replace(/\/$/, ''),
    token,
  };
}

export function isUpstashConfigured() {
  return Boolean(getUpstashConfig());
}

async function upstashRequest(pathname: string, body?: unknown) {
  const config = getUpstashConfig();
  if (!config) {
    throw new Error('Upstash Redis is not configured');
  }

  const response = await fetch(`${config.baseUrl}${pathname}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      authorization: `Bearer ${config.token}`,
      'content-type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      String(payload?.error || payload?.message || `Upstash request failed (${response.status})`)
    );
  }
  return payload;
}

export async function upstashPipeline(commands: Array<Array<string>>) {
  const payload = await upstashRequest('/pipeline', commands);
  return Array.isArray(payload?.result) ? payload.result : [];
}

export async function incrementFixedWindowCounter(key: string, windowMs: number) {
  const [incrEntry, ttlEntry] = await upstashPipeline([
    ['INCR', key],
    ['PTTL', key],
  ]);

  const current = Number(incrEntry?.result || 0);
  let ttlMs = Number(ttlEntry?.result || 0);

  if (!Number.isFinite(ttlMs) || ttlMs < 0) {
    await upstashPipeline([['PEXPIRE', key, String(windowMs)]]);
    ttlMs = windowMs;
  }

  return {
    current,
    ttlMs,
  };
}
