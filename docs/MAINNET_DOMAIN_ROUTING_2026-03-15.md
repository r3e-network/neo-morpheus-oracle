# Mainnet Domain Routing

Date: 2026-03-15
Network: Neo N3 Mainnet

## Purpose

This document is the canonical human-readable routing table for the public Neo N3 mainnet domains used by Morpheus Oracle, NeoDID, and the AA ecosystem.

Use it when you need to know:

- which domain is the primary public entrypoint
- which domains are compatibility aliases
- which subdomains map to verifier or hook contracts
- which contract hash and Neo address each domain currently resolves to

The machine-readable source of truth remains:

- `config/networks/mainnet.json`
- `examples/deployments/mainnet.json`

## Primary Public Domains

| Domain                   | Role                            | Contract Hash                                | Neo Address                          |
| ------------------------ | ------------------------------- | -------------------------------------------- | ------------------------------------ |
| `oracle.morpheus.neo`    | Mainnet Morpheus Oracle gateway | `0x017520f068fd602082fe5572596185e62a4ad991` | `NZD9U8EiZdTKf7mK7zAX9jEHRSNz6yvLWX` |
| `pricefeed.morpheus.neo` | Mainnet Morpheus DataFeed       | `0x03013f49c42a14546c8bbe58f9d434c3517fccab` | `NbaMiHPMftU9Y7LFJHPtW1jC6e81cHPLnV` |
| `neodid.morpheus.neo`    | Mainnet clean NeoDID registry   | `0xb81f31ea81e279793b30411b82c2e82078b63105` | `NLPS7pTD6HDpcFWzkRCzZZvrvXPoo3mxmF` |
| `smartwallet.neo`        | Mainnet canonical AA entrypoint | `0x9742b4ed62a84a886f404d36149da6147528ee33` | `NQeYx3qhVboVNU4Yk2NZPXQtudTeCNmjFq` |

## Compatibility Alias

| Domain            | Role                                                    | Contract Hash                                | Neo Address                          | Note                                                                                      |
| ----------------- | ------------------------------------------------------- | -------------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------- |
| `aa.morpheus.neo` | Compatibility alias for the canonical AA mainnet anchor | `0x9742b4ed62a84a886f404d36149da6147528ee33` | `NQeYx3qhVboVNU4Yk2NZPXQtudTeCNmjFq` | Keep for backward compatibility, but prefer `smartwallet.neo` in new user-facing material |

## AA Ecosystem Subdomains

| Domain                         | Role                        | Contract Hash                                | Neo Address                          |
| ------------------------------ | --------------------------- | -------------------------------------------- | ------------------------------------ |
| `core.smartwallet.neo`         | Canonical AA core           | `0x9742b4ed62a84a886f404d36149da6147528ee33` | `NQeYx3qhVboVNU4Yk2NZPXQtudTeCNmjFq` |
| `web3auth.smartwallet.neo`     | EIP-712 / Web3Auth verifier | `0xb4107cb2cb4bace0ebe15bc4842890734abe133a` | `NRD42fwpB3oXMZ5ATLphmpASHAeryf8M3W` |
| `recovery.smartwallet.neo`     | Social recovery verifier    | `0x51ef9639deb29284cc8577a7fa3fdfbc92ada7c3` | `NdkVpdqggcWvSVUWLmNxpZvjtQzP7nfB2n` |
| `teeverifier.smartwallet.neo`  | TEE verifier                | `0xcde2d9e92951cad84712d45e3643ab6d3bc30ba3` | `Nan5RJhAefuYKF8YEPo2xTtLR1iVk1W4Uy` |
| `sessionkey.smartwallet.neo`   | Session-key verifier        | `0xe82b9d056c011819ff3652427682224daad0cd1f` | `NNp8gzAemjMs4G5ZhGa4148s56i872S1cR` |
| `webauthn.smartwallet.neo`     | WebAuthn / passkey verifier | `0x504326693cb367c506250c5068ff7ad7989e885a` | `NUAffWcNGH5nBmQrZXMRkh5U6Krg8a9a7Y` |
| `multisig.smartwallet.neo`     | Threshold multisig verifier | `0xd21bf2d11c776746aaf27402c73ff9955005b55e` | `NUYjZL9eyy15FfRGHHJ49cNHfSq8SrydTE` |
| `subscription.smartwallet.neo` | Recurring payment verifier  | `0x2044c63705bb299acabd1a88d1f281d5b540dfef` | `NhnJ8UgiJJash1rb78NCqB2Tyx9uWsaAT6` |
| `credential.smartwallet.neo`   | NeoDID credential hook      | `0x306cf86ca17d79a3d3e17deeca43769eb6737089` | `NYSgULcivkBzxA3oB9466S73Qw5v7Wn8Eu` |
| `whitelist.smartwallet.neo`    | Whitelist hook              | `0x42e77d3abeab9c24231a868370dc1ccd870afec3` | `NdnHHFUUSjdivDVeKezrEmUXrAN2ToiCWm` |
| `dailylimit.smartwallet.neo`   | Daily-limit hook            | `0x06be3e9eeeca5a26340c088e68ba1023e72ad6f7` | `NiWQemD9Xq8om2nZVnBnJCEgCs9qrWryjD` |
| `tokenhook.smartwallet.neo`    | Token-restriction hook      | `0x7fdec8ec3085f17b0b136532d43d0d862c1092c7` | `Ne7CdaU4BPuJ1hAPVRgynMTS1X2fr76v1C` |
| `multihook.smartwallet.neo`    | Hook combiner               | `0xdedf0fd213249aba62c41285117cfe8b31d43d66` | `NVEaBGXtasvQGUog12PK1QixJ8VBDbAwnY` |

## Naming Rules

- Use `smartwallet.neo` as the canonical end-user AA domain.
- Treat `aa.morpheus.neo` as a backward-compatible alias only.
- Use `*.smartwallet.neo` for AA plugin and hook discovery.
- Use `oracle.morpheus.neo`, `pricefeed.morpheus.neo`, and `neodid.morpheus.neo` as the public project-level entrypoints for the Oracle / DataFeed / NeoDID layers.

## Operational Note

The legacy mainnet AA deployment at `0x0466fa7e8fe548480d7978d2652625d4a22589a6` remains on-chain for compatibility, but it is no longer the canonical public anchor and should not be used in new integrations or user-facing material.
