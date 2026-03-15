# N3 Encrypted Ref Boundary Validation

Date: 2026-03-15T01:50:20.138Z

## Scope

This probe validates the live testnet boundary for `encrypted_params_ref` after requester/callback binding was added to the worker resolution path.

## Result Summary

- Matching ref tx: `0x320c38dd99228be7014eabbfb93296728462c5b350e746a751c5ee4f51013f12` request `3624`
- Wrong requester tx: `0x620e0f7300e32e0c76b8d34737081c782d52301109f12ae6531735f02af03d38` request `3634`
- Wrong callback tx: `0x5bacfb5121041489764d2925a867da5e5b49c100331504be6253290c09b4ca83` request `3639`
- Replay first-use tx: `0x5253416448bc1149e0bbdc856c46a97f43ba6e38ac2b9561d2e203c84a01c618` request `3644`
- Replay second-use tx: `0x599b421241c853a6b3e14f15de68887a3d008afa2263df9984b52ad2c08ed2bc` request `3649`

## Conclusion

- A ref bound to the live requester and callback contract succeeds.
- A ref bound to a different requester fails with `encrypted ref requester mismatch`.
- A ref bound to a different callback contract fails with `encrypted ref callback mismatch`.
- Reusing the same encrypted ref from a different request now fails with `encrypted ref already consumed by another request`.
