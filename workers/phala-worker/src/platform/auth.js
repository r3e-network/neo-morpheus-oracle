import { env, json, trimString } from "./core.js";

export async function requireAuth(request) {
  const expected = env("PHALA_API_TOKEN", "PHALA_SHARED_SECRET");
  const auth = trimString(request.headers.get("authorization") || request.headers.get("x-phala-token"));
  if (!expected) return { ok: true };
  if (auth === `Bearer ${expected}` || auth === expected) return { ok: true };
  return { ok: false, response: json(401, { error: "unauthorized" }) };
}
