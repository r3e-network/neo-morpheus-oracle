export async function callPhala(config, path, payload) {
  if (!config.phala.apiUrl) throw new Error("PHALA_API_URL is not configured");
  const headers = new Headers({ "content-type": "application/json" });
  if (config.phala.token) {
    headers.set("authorization", `Bearer ${config.phala.token}`);
    headers.set("x-phala-token", config.phala.token);
  }

  const timeoutMs = Math.max(Number(config.phala.timeoutMs || 30000), 1000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`phala request timed out after ${timeoutMs}ms`)), timeoutMs);
  const response = await fetch(`${config.phala.apiUrl.replace(/\/$/, "")}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal: controller.signal,
  }).finally(() => clearTimeout(timer));
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  return { ok: response.ok, status: response.status, body };
}
