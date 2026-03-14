# N3 Encrypted Ref Boundary Validation

Date: 2026-03-14T14:15:31.851Z

## Scope

This probe validates the live testnet boundary for `encrypted_params_ref` after requester/callback binding was added to the worker resolution path.

## Result Summary

- Matching ref tx: `0x4d01aa27645fd67651247a11831cb910bd24d16aacf2437fc4a33c9e9a8730a6` request `2991`
- Wrong requester tx: `0x8d513fd21bfba6eb8c9119a971763bbbe276e8a66fddd94a21caca20543bdc1c` request `3001`
- Wrong callback tx: `0x8af9ba4c46031af2fc41c4e6a5f68276fd7ca3565d8a352b202d8c4109337d59` request `3006`

## Conclusion

- A ref bound to the live requester and callback contract succeeds.
- A ref bound to a different requester fails with `encrypted ref requester mismatch`.
- A ref bound to a different callback contract fails with `encrypted ref callback mismatch`.
