# N3 Encrypted Ref Boundary Validation

Date: 2026-03-15T02:26:14.500Z

## Scope

This probe validates the live testnet boundary for `encrypted_params_ref` after requester/callback binding was added to the worker resolution path.

## Result Summary

- Matching ref tx: `0x76265bde8c72de5da1b119f849f60b80332ce1275d466ed578f278001f98f623` request `3689`
- Wrong requester tx: `0xf62a8291f726bcba56f43491d8756bb161639210b822a24aa87cfad15bc5e734` request `3699`
- Wrong callback tx: `0xfd49174cd7d5b1a0e8eb4904b2ce80f54069a7893ecfff49faadcb806e1d4b58` request `3704`
- Replay first-use tx: `0x2119856d89bf6066203c607f00e881cbad6957a0d4082ba24f23e187e9e5ffc3` request `3709`
- Replay second-use tx: `0x00bafe56cec93e6aa21faf398d82734488815e9cd9e0a933ea790427f023846f` request `3714`

## Conclusion

- A ref bound to the live requester and callback contract succeeds.
- A ref bound to a different requester fails with `encrypted ref requester mismatch`.
- A ref bound to a different callback contract fails with `encrypted ref callback mismatch`.
- Reusing the same encrypted ref from a different request now fails with `encrypted ref already consumed by another request`.
