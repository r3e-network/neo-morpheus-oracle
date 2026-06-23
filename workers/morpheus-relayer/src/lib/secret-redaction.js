// Canonical secret-name detection shared by every redaction sink.
//
// Two sinks decide whether an identifier names a secret:
//   - config-schema.js / config-introspect.js: env-var NAMES, to redact values
//     in `config:dump` (only set/unset + winning alias is shown for a secret).
//   - logger.js: object KEYS in structured logs, to redact secret-shaped values
//     before they egress to the external log sink.
//
// They previously kept independent lists, so a fragment present in one but not
// the other was a latent leak: e.g. config-schema lacked `api_key`, so an env
// var like FOO_API_KEY had its value printed verbatim in a dump; logger lacked
// `service_role_key`/`password`, so those keys leaked through structured logs.
// This module is the single source of truth — the UNION of both former lists —
// so neither sink can lose coverage relative to the other.
//
// Fragments are regex sources matched case-insensitively as substrings (no word
// boundaries — broad on purpose; over-redaction is the safe direction). The
// optional-underscore `_?` variants match both snake_case env names
// (PRIVATE_KEY) and camelCase/compact object keys (privateKey / privatekey).

export const SECRET_NAME_FRAGMENTS = [
  'wif',
  'private_?key',
  'api_?key',
  'secret',
  'token',
  'service_?role_?key',
  'service_?key',
  'password',
  'passphrase',
  'seed',
  'mnemonic',
  'authorization',
  'envelope',
  'plaintext',
];

export const SECRET_NAME_PATTERN = new RegExp(`(${SECRET_NAME_FRAGMENTS.join('|')})`, 'i');

/**
 * True when an identifier (env-var name or object key) names a secret-shaped
 * value that must be redacted. Non-strings are never secret.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isSecretName(value) {
  return typeof value === 'string' && SECRET_NAME_PATTERN.test(value);
}
