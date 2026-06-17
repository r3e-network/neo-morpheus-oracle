// Shared relayer string helpers.
//
// `trimString` here intentionally keeps the relayer's strict, type-preserving
// semantics: non-string inputs collapse to '' rather than being coerced via
// String(). This is load-bearing — several call sites rely on a non-string
// value becoming '' (e.g. router.js length-prefixed UTF-8 / hash encoders and
// neo-n3.js settlement detection treat '' as "absent"), where String()-coercion
// of a number/object/boolean would silently produce a different encoding or a
// false "already settled" decision. Do NOT swap this for the
// `@neo-morpheus-oracle/shared/utils` trimString (which uses String(value || '')
// coercion) without auditing every call site.
export function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}
