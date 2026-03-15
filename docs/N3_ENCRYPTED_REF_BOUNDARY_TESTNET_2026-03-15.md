# N3 Encrypted Ref Boundary Validation

Date: 2026-03-15T05:07:26.571Z

## Scope

This probe validates the live testnet boundary for `encrypted_params_ref` after requester/callback binding was added to the worker resolution path.

## Result Summary

- Matching ref tx: `0xb99dfa3da0a3adfbe2375ef30af1a5216ec43c4d25632f60480d291da76c37ce` request `3766`
- Wrong requester tx: `0x76288f1eb355516b6d6f7390416440b49ed9b802ced89be2253525259a28b90a` request `3776`
- Wrong callback tx: `0x274643a5745d393f57d06e9342d1416a0aacbc1b2d9d24a57f16094f4d8444bf` request `3781`
- Replay first-use tx: `0x4ef62761abf12ede0f1049e40db8b8593454df1b7785c33b8e1385542a531d94` request `3786`
- Replay second-use tx: `0x7abaa052dffb8cd31530949ca0bf96954af96936b200efb425bac94a8e6a548c` request `3791`

## Conclusion

- A ref bound to the live requester and callback contract succeeds.
- A ref bound to a different requester fails with `encrypted ref requester mismatch`.
- A ref bound to a different callback contract fails with `encrypted ref callback mismatch`.
- Reusing the same encrypted ref from a different request now fails with `encrypted ref already consumed by another request`.
