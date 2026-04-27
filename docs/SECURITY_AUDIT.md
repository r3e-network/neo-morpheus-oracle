# Security Audit Notes

This document tracks the current security hardening baseline for Morpheus Oracle and the checks that must pass before release.

## Current Automated Coverage

- Root dependency audit is guarded by `scripts/check-root-audit-allowlist.mjs` so known CityOfZion baseline findings stay explicit instead of silently expanding.
- Repository verification runs script tests, control-plane tests, worker checks/tests, relayer checks/tests, web consistency checks, web unit tests, and web production build.
- Web security headers are defined in `apps/web/next.config.mjs` and covered by `apps/web/__tests__/security-headers.test.ts`.
- Documentation navigation is covered by `apps/web/__tests__/docs-navigation.test.ts`, including static docs routes and extended Markdown-backed `/docs/r/*` pages.
- Contract artifact generation is validated by `scripts/contract-build-regressions.test.mjs` when `dotnet` and the pinned `nccs` compiler are available.

## Manual Release Checklist

Before a production release, verify:

1. `npm run verify:repo` passes in a clean checkout.
2. The contract CI job installs the pinned Neo C# compiler and runs `contracts/build.sh` successfully.
3. No secrets, private keys, service-role keys, tokens, or connection strings are committed or printed in logs.
4. Production environment variables are scoped by network and deployment target.
5. Callback, relayer, paymaster, and txproxy allowlists are reviewed against the intended deployment contracts.
6. Any live smoke tests use dedicated testnet funds/accounts and do not reuse production signer material.

## Known Environment Caveat

Local developer machines that do not have `dotnet` and `~/.dotnet/tools/nccs` installed will skip the contract compilation regression test. CI must still enforce contract compilation using the pinned compiler before release.
