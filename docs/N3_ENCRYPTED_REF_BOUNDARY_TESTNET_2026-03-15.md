# N3 Encrypted Ref Boundary Validation

Date: 2026-03-15T05:54:45.724Z

## Scope

This probe validates the live testnet boundary for `encrypted_params_ref` after requester/callback binding was added to the worker resolution path.

## Result Summary

- Matching ref tx: `0x5e8c7eec4886792c2fe55c1c4f5d52b8de4d49dd70ce04d1c46470a58049988b` request `3830`
- Wrong requester tx: `0x2cc4948af9e3c1848e32516ff78fb376addbb183ef2eef19306613a0832a3e78` request `3831`
- Wrong callback tx: `0x30f97a559c88fccc023d408be8a702e96933726ab16eaf09eeb274e32b21fb36` request `3833`
- Replay first-use tx: `0x3208339ab019db55c097f41f9f498f16c6dedfcf6bec5c2c113c3e397b6a225b` request `3834`
- Replay second-use tx: `0xe31332d34c2f91d83484fec80490930b07068492b17ce3a56f49b6c8717328e2` request `3835`

## Conclusion

- A ref bound to the live requester and callback contract succeeds.
- A ref bound to a different requester fails with `encrypted ref requester mismatch`.
- A ref bound to a different callback contract fails with `encrypted ref callback mismatch`.
- Reusing the same encrypted ref from a different request now fails with `encrypted ref already consumed by another request`.
