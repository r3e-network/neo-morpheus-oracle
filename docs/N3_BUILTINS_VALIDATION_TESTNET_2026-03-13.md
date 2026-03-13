# Neo N3 Builtin Validation

Generated: 2026-03-13T16:55:10.696Z

## Environment

- Network: `testnet`
- Target chain: `neo_n3`
- Consumer: `0x8c506f224d82e67200f20d9d5361f767f0756e3b`
- Oracle: `0x4b882e94ed766807c4fd728768f972e13008ad52`
- Request fee: `1000000`

## Builtin Matrix

| Builtin | Tx | Request ID | Result |
| --- | --- | --- | --- |
| hash.sha256 | `0xea1998b73dcb552d82d3d86bb6f1034e175961e7fcf99d9305348137fff528a8` | `158` | `{"digest":"f9a8e3c50a373fff6540a8bd7fde4c6094936d54f9a1d76b978319f84bedc9dd"}` |
| hash.keccak256 | `0x146dd285fd564812774a0336c04164e5ff251eb0b5a48e7b2085c60ed858c0ef` | `160` | `{"digest":"0x75c8c3fb2792afb3e58d9f00944fe82beadc4b2d75905ee68530d4e8aa6f1066"}` |
| crypto.rsa_verify | `0x4233bc83c995ca92fc9c8f67ce6c3c6da156c2d1ba66f78d8d8abcb7f928e5ad` | `163` | `{"is_valid":true}` |
| math.modexp | `0xd38b427db14753e06a514c007d762f9e16455a27704c953de7e44246c1d79879` | `164` | `{"value":"4"}` |
| math.polynomial | `0xcad57aa10a9535a80a47f7537a99b35f3d2d1ed2e871bd22863894f4fab57590` | `166` | `{"value":"15"}` |
| matrix.multiply | `0x98f7947912b3c3448ac76494885c486ac4505224f0585b50d0ea8c939b82f7a6` | `168` | `{"matrix":[[19,22],[43,50]]}` |
| vector.cosine_similarity | `0x4c69a4487c40e9827f1afd6fa57919f47371c02170f26fb1ae0aabdac44e2eb6` | `169` | `{"similarity":1}` |
| merkle.root | `0x2da6da851ea9dd6712c9fff0f85e1059eb7f8ad8eb9d714933ae7ccee8ccaa08` | `172` | `{"root":"d31a37ef6ac14a2db1470c4316beb5592e6afd4465022339adafda76a18ffabe"}` |
| zkp.public_signal_hash | `0x7ae6e48cd2cb35b739bfd4a5a0ebcedcb40da989e6cd6ed151754c8a68703426` | `173` | `{"digest":"96bec0b6442d3eb5be3b0ed884c8df07835adc41ba13374cc12ba5a364d604ef"}` |
| zkp.proof_digest | `0xacec0b540022456a48e1dc21592d26722e7a73d9e70f2abc74c8d15705d73f03` | `174` | `{"digest":"545c3fac1e0066329f385ea3ac4497f89cf970ae00ba176d89cefec7d47f064d"}` |
| zkp.witness_digest | `0xcb9fdb58ee4d6df1d5a5cbb409e49857f7ff48e0c597b731249c4878c439fea0` | `175` | `{"digest":"634346f5df11df8fdae3a57a110545fc38c8abae35bdbeda91cdd873c716914a"}` |
| zkp.groth16.prove.plan | `0x573f9020d34d19e9cb4054f29f328e7fd4fb59a375be0205851f212199768ffb` | `176` | `{"constraints":100000,"witness_count":5000,"estimated_segments":2,"estimated_memory_mb":5}` |
| zkp.plonk.prove.plan | `0xb6127498aa7930e3ca0c93fce53736e1f7d1580bbcca8f2ee46a3a20b23a7431` | `177` | `{"gates":131072,"estimated_polynomials":2,"estimated_memory_mb":5}` |
| fhe.batch_plan | `0x100e11209444f8e0107b79495895bda1281253015b9f0b4d875bd0f6f7bca0cd` | `178` | `{"slot_count":16,"ciphertext_count":3,"slots_per_ciphertext":6}` |
| fhe.noise_budget_estimate | `0xdb2722adc952f79c1b061cf4d7458cf1b2cba3b7ffffb4591368d756f3661b8d` | `179` | `{"multiplicative_depth":2,"scale_bits":40,"modulus_bits":218,"estimated_noise_budget":138}` |
| fhe.rotation_plan | `0xabbc27680ef15598632166c9ef5784a4bf001c0f83df92829f3d20717c132b5f` | `180` | `{"indices":[1,-1,4,1],"unique_rotations":[-1,1,4],"key_switch_steps":4}` |
| privacy.mask | `0xf45eaf3f655519a1d1ef0411e7173268478ec9218764e96d84581762929ff15e` | `181` | `{"masked":"sec************34"}` |
| privacy.add_noise | `0x2a1444ddb82cd5b5850d4d42fd9695d016b8e08799c4332dd3ec7b07e5a2988c` | `182` | `{"noisy_value":8.183024030178004}` |

## Detailed Results

### hash.sha256

```json
{
  "name": "hash.sha256",
  "txid": "0xea1998b73dcb552d82d3d86bb6f1034e175961e7fcf99d9305348137fff528a8",
  "request_id": "158",
  "result": {
    "digest": "f9a8e3c50a373fff6540a8bd7fde4c6094936d54f9a1d76b978319f84bedc9dd"
  }
}
```

### hash.keccak256

```json
{
  "name": "hash.keccak256",
  "txid": "0x146dd285fd564812774a0336c04164e5ff251eb0b5a48e7b2085c60ed858c0ef",
  "request_id": "160",
  "result": {
    "digest": "0x75c8c3fb2792afb3e58d9f00944fe82beadc4b2d75905ee68530d4e8aa6f1066"
  }
}
```

### crypto.rsa_verify

```json
{
  "name": "crypto.rsa_verify",
  "txid": "0x4233bc83c995ca92fc9c8f67ce6c3c6da156c2d1ba66f78d8d8abcb7f928e5ad",
  "request_id": "163",
  "result": {
    "is_valid": true
  }
}
```

### math.modexp

```json
{
  "name": "math.modexp",
  "txid": "0xd38b427db14753e06a514c007d762f9e16455a27704c953de7e44246c1d79879",
  "request_id": "164",
  "result": {
    "value": "4"
  }
}
```

### math.polynomial

```json
{
  "name": "math.polynomial",
  "txid": "0xcad57aa10a9535a80a47f7537a99b35f3d2d1ed2e871bd22863894f4fab57590",
  "request_id": "166",
  "result": {
    "value": "15"
  }
}
```

### matrix.multiply

```json
{
  "name": "matrix.multiply",
  "txid": "0x98f7947912b3c3448ac76494885c486ac4505224f0585b50d0ea8c939b82f7a6",
  "request_id": "168",
  "result": {
    "matrix": [
      [
        19,
        22
      ],
      [
        43,
        50
      ]
    ]
  }
}
```

### vector.cosine_similarity

```json
{
  "name": "vector.cosine_similarity",
  "txid": "0x4c69a4487c40e9827f1afd6fa57919f47371c02170f26fb1ae0aabdac44e2eb6",
  "request_id": "169",
  "result": {
    "similarity": 1
  }
}
```

### merkle.root

```json
{
  "name": "merkle.root",
  "txid": "0x2da6da851ea9dd6712c9fff0f85e1059eb7f8ad8eb9d714933ae7ccee8ccaa08",
  "request_id": "172",
  "result": {
    "root": "d31a37ef6ac14a2db1470c4316beb5592e6afd4465022339adafda76a18ffabe"
  }
}
```

### zkp.public_signal_hash

```json
{
  "name": "zkp.public_signal_hash",
  "txid": "0x7ae6e48cd2cb35b739bfd4a5a0ebcedcb40da989e6cd6ed151754c8a68703426",
  "request_id": "173",
  "result": {
    "digest": "96bec0b6442d3eb5be3b0ed884c8df07835adc41ba13374cc12ba5a364d604ef"
  }
}
```

### zkp.proof_digest

```json
{
  "name": "zkp.proof_digest",
  "txid": "0xacec0b540022456a48e1dc21592d26722e7a73d9e70f2abc74c8d15705d73f03",
  "request_id": "174",
  "result": {
    "digest": "545c3fac1e0066329f385ea3ac4497f89cf970ae00ba176d89cefec7d47f064d"
  }
}
```

### zkp.witness_digest

```json
{
  "name": "zkp.witness_digest",
  "txid": "0xcb9fdb58ee4d6df1d5a5cbb409e49857f7ff48e0c597b731249c4878c439fea0",
  "request_id": "175",
  "result": {
    "digest": "634346f5df11df8fdae3a57a110545fc38c8abae35bdbeda91cdd873c716914a"
  }
}
```

### zkp.groth16.prove.plan

```json
{
  "name": "zkp.groth16.prove.plan",
  "txid": "0x573f9020d34d19e9cb4054f29f328e7fd4fb59a375be0205851f212199768ffb",
  "request_id": "176",
  "result": {
    "constraints": 100000,
    "witness_count": 5000,
    "estimated_segments": 2,
    "estimated_memory_mb": 5
  }
}
```

### zkp.plonk.prove.plan

```json
{
  "name": "zkp.plonk.prove.plan",
  "txid": "0xb6127498aa7930e3ca0c93fce53736e1f7d1580bbcca8f2ee46a3a20b23a7431",
  "request_id": "177",
  "result": {
    "gates": 131072,
    "estimated_polynomials": 2,
    "estimated_memory_mb": 5
  }
}
```

### fhe.batch_plan

```json
{
  "name": "fhe.batch_plan",
  "txid": "0x100e11209444f8e0107b79495895bda1281253015b9f0b4d875bd0f6f7bca0cd",
  "request_id": "178",
  "result": {
    "slot_count": 16,
    "ciphertext_count": 3,
    "slots_per_ciphertext": 6
  }
}
```

### fhe.noise_budget_estimate

```json
{
  "name": "fhe.noise_budget_estimate",
  "txid": "0xdb2722adc952f79c1b061cf4d7458cf1b2cba3b7ffffb4591368d756f3661b8d",
  "request_id": "179",
  "result": {
    "multiplicative_depth": 2,
    "scale_bits": 40,
    "modulus_bits": 218,
    "estimated_noise_budget": 138
  }
}
```

### fhe.rotation_plan

```json
{
  "name": "fhe.rotation_plan",
  "txid": "0xabbc27680ef15598632166c9ef5784a4bf001c0f83df92829f3d20717c132b5f",
  "request_id": "180",
  "result": {
    "indices": [
      1,
      -1,
      4,
      1
    ],
    "unique_rotations": [
      -1,
      1,
      4
    ],
    "key_switch_steps": 4
  }
}
```

### privacy.mask

```json
{
  "name": "privacy.mask",
  "txid": "0xf45eaf3f655519a1d1ef0411e7173268478ec9218764e96d84581762929ff15e",
  "request_id": "181",
  "result": {
    "masked": "sec************34"
  }
}
```

### privacy.add_noise

```json
{
  "name": "privacy.add_noise",
  "txid": "0x2a1444ddb82cd5b5850d4d42fd9695d016b8e08799c4332dd3ec7b07e5a2988c",
  "request_id": "182",
  "result": {
    "noisy_value": 8.183024030178004
  }
}
```
