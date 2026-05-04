function resolveCandidateApiUrls(apiUrl) {
  return String(apiUrl || '')
    .split(',')
    .map((entry) => entry.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

const DEFAULT_PHALA_TIMEOUT_MS = 10_000;

function decorateWorkerPayload(config, payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  const derivedKeysEnabled = Boolean(config.phala?.useDerivedKeys ?? config.useDerivedKeys);
  let nextPayload = payload;

  if (
    !(
      payload.network ||
      payload.morpheus_network ||
      payload.runtime_network ||
      payload.environment
    ) &&
    config.network
  ) {
    nextPayload = { ...nextPayload, network: config.network };
  }

  if (
    derivedKeysEnabled &&
    nextPayload.use_derived_keys === undefined &&
    nextPayload.useDerivedKeys === undefined
  ) {
    nextPayload = { ...nextPayload, use_derived_keys: true };
  }

  return nextPayload;
}

export async function callPhala(config, path, payload, options = {}) {
  const candidateApiUrls = resolveCandidateApiUrls(config.phala.apiUrl);
  if (candidateApiUrls.length === 0) {
    throw new Error('MORPHEUS_RUNTIME_URL or PHALA_API_URL is not configured');
  }
  const headers = new Headers({ 'content-type': 'application/json' });
  if (config.phala.token) {
    headers.set('authorization', `Bearer ${config.phala.token}`);
    headers.set('x-phala-token', config.phala.token);
  }

  const requestPayload = decorateWorkerPayload(config, payload);
  const timeoutMs = Math.min(
    Math.max(Number(options.timeoutMs || config.phala.timeoutMs || DEFAULT_PHALA_TIMEOUT_MS), 1000),
    10_000
  );
  let lastError = null;

  for (const apiBaseUrl of candidateApiUrls) {
    const controller = new AbortController();
    let timer = null;
    const timeoutError = new Error(`phala request timed out after ${timeoutMs}ms`);
    const operation = (async () => {
      const response = await fetch(`${apiBaseUrl}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestPayload),
        signal: controller.signal,
      });
      const text = await response.text();
      let body;
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        body = { raw: text };
      }
      return { ok: response.ok, status: response.status, body, api_url: apiBaseUrl };
    })();
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort(timeoutError);
        reject(timeoutError);
      }, timeoutMs);
    });

    try {
      return await Promise.race([operation, timeoutPromise]);
    } catch (error) {
      lastError = error;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
