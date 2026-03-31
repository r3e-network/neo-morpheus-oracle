export async function fetchJSON<T = unknown>(
  path: string,
  options?: { method?: string; body?: Record<string, unknown>; headers?: Record<string, string> }
): Promise<T> {
  const response = await fetch(path, {
    method: options?.method ?? (options?.body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`API error ${response.status}: ${text || response.statusText}`);
  }
  return response.json();
}
