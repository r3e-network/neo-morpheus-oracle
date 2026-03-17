# N3 Encrypted Ref Boundary Validation

Date: 2026-03-17T15:34:54.370Z

## Scope

This probe validates the live testnet boundary for `encrypted_params_ref` after requester/callback binding was added to the worker resolution path.

## Result Summary

- Matching ref tx: `0x29aeb8ee3363facee55c34e8b55a155bc81c657b4975b23ee43ac828613c6762` request `3951`
- Wrong requester tx: `0xf37e6cda856dff49bbea3df9a2b9b5233e764eb06e5397cbf6f4ecf56300a73f` request `3952`
- Wrong callback tx: `0xbf10d200f939460426f55f13eb3e769abb04d32b868f9e6da46b8af22ccbb7a9` request `3953`
- Replay first-use tx: `0x37173d9fb31ebdfb0d39cd9ed24efa600fb6a422711a63229526e77b52e0cf7f` request `3954`
- Replay second-use tx: `0xf25b000a537f4a359e5bc8edc869abaded5855c9e587cf3061a6a5ebe6932ef3` request `3955`

## Conclusion

- A ref bound to the live requester and callback contract succeeds.
- A ref bound to a different requester fails with `encrypted ref requester mismatch`.
- A ref bound to a different callback contract fails with `encrypted ref callback mismatch`.
- Reusing the same encrypted ref from a different request now fails with `encrypted ref already consumed by another request`.
