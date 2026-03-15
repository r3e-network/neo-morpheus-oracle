# N3 Encrypted Ref Boundary Validation

Date: 2026-03-15T06:31:37.695Z

## Scope

This probe validates the live testnet boundary for `encrypted_params_ref` after requester/callback binding was added to the worker resolution path.

## Result Summary

- Matching ref tx: `0x74b0911cdc413226095fab5e360d5b1f320c4cb9f78f9b71fa065c7e76731ddf` request `3842`
- Wrong requester tx: `0x670a08b8ac154d632afcb3f92745c7e76b64ad429ddfd0da9e1e2ea55bd62764` request `3843`
- Wrong callback tx: `0x375b4d8c15d424ec3d11458ab8f5b1e0ef5c10e6a20afee5b0d67801837c7d44` request `3844`
- Replay first-use tx: `0xc9f43c0c1575c4b9f46e56ee0cf98d0a6be20a47fccc2ff6fb108a349a3d1ba0` request `3845`
- Replay second-use tx: `0xd7efccd3790cb542ef5f82c0571ebeeae073b12ae7873d423952b19a008478df` request `3846`

## Conclusion

- A ref bound to the live requester and callback contract succeeds.
- A ref bound to a different requester fails with `encrypted ref requester mismatch`.
- A ref bound to a different callback contract fails with `encrypted ref callback mismatch`.
- Reusing the same encrypted ref from a different request now fails with `encrypted ref already consumed by another request`.
