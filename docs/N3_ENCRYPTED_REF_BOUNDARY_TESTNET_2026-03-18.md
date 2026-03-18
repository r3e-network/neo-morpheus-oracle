# N3 Encrypted Ref Boundary Validation

Date: 2026-03-18T10:59:23.947Z

## Scope

This probe validates the live testnet boundary for `encrypted_params_ref` after requester/callback binding was added to the worker resolution path.

## Result Summary

- Matching ref tx: `0x70e61d7f788b09290b482740f0bbaf941fbd7ce8cba98995551fb832ca1eca08` request `3991`
- Wrong requester tx: `0xae47e8f67658b05b0dbcfe0c047ae3ad4c31be0b36de8ea21594e43ad43b84da` request `3992`
- Wrong callback tx: `0x90862ade8fb5d9f2cf8afa0a218d15f00a26c0ae53c2d26eb25819710afe3c69` request `3993`
- Replay first-use tx: `0x2d8f51d1e54154fd690a1f8cd628af58b4313e55002d263d1522b32ee03d81a9` request `3994`
- Replay second-use tx: `0x061f815165d55abadc2d02ba731bf75375b84cf573fb0c992b5388b0cb259aa7` request `3995`

## Conclusion

- A ref bound to the live requester and callback contract succeeds.
- A ref bound to a different requester fails with `encrypted ref requester mismatch`.
- A ref bound to a different callback contract fails with `encrypted ref callback mismatch`.
- Reusing the same encrypted ref from a different request now fails with `encrypted ref already consumed by another request`.
