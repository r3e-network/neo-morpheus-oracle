# N3 Encrypted Ref Boundary Validation

Date: 2026-03-14T19:00:30.311Z

## Scope

This probe validates the live testnet boundary for `encrypted_params_ref` after requester/callback binding was added to the worker resolution path.

## Result Summary

- Matching ref tx: `0x8a31fecff1a0f80bcb9b77c3e7581e0f25197c3f1514df0c20a471d7334a59c6` request `3342`
- Wrong requester tx: `0x33cfb9d24b1c1aa6062bb222dffe6a0bfde909395c06ee2d5d51f78959694db9` request `3353`
- Wrong callback tx: `0xa1fc9577bc7620e6dfe5f06a7363d888e6d4fc27bcd8ed24aa434c696ad1232e` request `3358`

## Conclusion

- A ref bound to the live requester and callback contract succeeds.
- A ref bound to a different requester fails with `encrypted ref requester mismatch`.
- A ref bound to a different callback contract fails with `encrypted ref callback mismatch`.
