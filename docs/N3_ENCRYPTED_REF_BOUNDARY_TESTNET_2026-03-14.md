# N3 Encrypted Ref Boundary Validation

Date: 2026-03-14T13:56:55.631Z

## Scope

This probe validates the live testnet boundary for `encrypted_params_ref` after requester/callback binding was added to the worker resolution path.

## Result Summary

- Matching ref tx: `0xaed59736f9f485208f670dcfe9d7355db60b211313086187fcce51b96ab1cad4` request `2926`
- Wrong requester tx: `0x8373399c2afe53ad98616d2552483e10919ac7c4d0cc318a7d157af027b92b84` request `2946`
- Wrong callback tx: `0x6570007ff7faac6cb0e9b303741fd9f49c5e8f20ecd15e22d2c766a69e80ccd9` request `2951`

## Conclusion

- A ref bound to the live requester and callback contract succeeds.
- A ref bound to a different requester fails with `encrypted ref requester mismatch`.
- A ref bound to a different callback contract fails with `encrypted ref callback mismatch`.
