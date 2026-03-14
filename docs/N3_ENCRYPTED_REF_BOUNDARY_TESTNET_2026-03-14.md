# N3 Encrypted Ref Boundary Validation

Date: 2026-03-14T04:05:12.994Z

## Scope

This probe validates the live testnet boundary for `encrypted_params_ref` after requester/callback binding was added to the worker resolution path.

## Result Summary

- Matching ref tx: `0x4b4089a334558863d14e856258e70cec09fbc9efb6cc561bc2c3c452ad487832` request `200`
- Wrong requester tx: `0xb429f5c22d34197a6fc4af48f4a1b851b95a56cc422fdcdad6851dc9c7a94ee0` request `201`
- Wrong callback tx: `0x8dee66d4e2627de871d17447c4d91ad9884c688d0d292123d1e9069adc0bc6bb` request `202`

## Conclusion

- A ref bound to the live requester and callback contract succeeds.
- A ref bound to a different requester fails with `encrypted ref requester mismatch`.
- A ref bound to a different callback contract fails with `encrypted ref callback mismatch`.
