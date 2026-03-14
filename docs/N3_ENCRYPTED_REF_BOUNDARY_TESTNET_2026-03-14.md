# N3 Encrypted Ref Boundary Validation

Date: 2026-03-14T09:24:54.069Z

## Scope

This probe validates the live testnet boundary for `encrypted_params_ref` after requester/callback binding was added to the worker resolution path.

## Result Summary

- Matching ref tx: `0x7cf46f64facc98bc25fb8da67ba2456ce72fd332378d2f6fb82f43ba40d692eb` request `1016`
- Wrong requester tx: `0x14e6a808d21b93c1d1d4685c5fbe2ec6ab4395446852903be9e4213adccad1f9` request `1022`
- Wrong callback tx: `0x0947e3060b5ba10be3d9f575aec784fc677b4e1fab3d32e93f5572979cb787b1` request `1027`

## Conclusion

- A ref bound to the live requester and callback contract succeeds.
- A ref bound to a different requester fails with `encrypted ref requester mismatch`.
- A ref bound to a different callback contract fails with `encrypted ref callback mismatch`.
