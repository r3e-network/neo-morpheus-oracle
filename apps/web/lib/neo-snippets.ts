// Helpers shared by the dashboard/studio snippet generators (OracleTab,
// ComputeTab, StarterStudio) for rendering copy-paste Neo N3 integration
// snippets. Kept in one place so the C#-string escaping and UTF-8 base64
// encoding stay byte-for-byte consistent across every generated snippet.

/** Escape a string for embedding inside a C# double-quoted string literal. */
export function escapeForCSharp(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * UTF-8 encode then base64 a string without blowing the call stack on large
 * payloads (chunked String.fromCharCode). Falls back to a Buffer when running
 * outside the browser so the helper is also safe under SSR/prerender.
 */
export function encodeUtf8Base64(value: string) {
  const bytes = new TextEncoder().encode(value);
  if (typeof window === 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return window.btoa(binary);
}

/** Copy text to the clipboard via the async Clipboard API. */
export function copyText(value: string) {
  return navigator.clipboard.writeText(value);
}
