# N3 Callback Boundary Validation

Date: 2026-03-15T01:44:21.088Z

## Scope

This probe validates that a normal external Neo N3 account cannot directly inject a forged `onOracleResult` callback into the configured testnet callback consumer.

## Inputs

- Oracle hash: `0x4b882e94ed766807c4fd728768f972e13008ad52`
- Callback consumer hash: `0x8c506f224d82e67200f20d9d5361f767f0756e3b`
- Attacker address: `NTmHjwiadq4g3VHpJ5FQigQcD4fF5m8TyX`
- RPC: `https://testnet1.neo.coz.io:443`

## Result

- Probe txid: `0x619766a1d9629975d80703bb52cb1d29baaa90a20199ed21cce37c8ca61066f3`
- Preview state: `FAULT`
- Preview exception: `at instruction 966 (ABORTMSG): ABORTMSG is executed. Reason: unauthorized caller`
- Persisted vmstate: `FAULT`
- Persisted exception: `at instruction 966 (ABORTMSG): ABORTMSG is executed. Reason: unauthorized caller`

## Conclusion

The callback consumer rejected the forged direct external callback with `unauthorized caller`, which confirms that callback acceptance remains bound to the configured Oracle contract rather than a generic caller witness.
