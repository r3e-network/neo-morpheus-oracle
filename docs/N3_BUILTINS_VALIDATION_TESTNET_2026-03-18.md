# Neo N3 Builtin Validation

Generated: 2026-03-18T02:04:12.960Z

## Environment

- Network: `testnet`
- Target chain: `neo_n3`
- Consumer: `0x8c506f224d82e67200f20d9d5361f767f0756e3b`
- Oracle: `0x4b882e94ed766807c4fd728768f972e13008ad52`
- Request fee: `1000000`

## Builtin Matrix

| Builtin | Tx | Request ID | Result |
| --- | --- | --- | --- |
| hash.sha256 | `0x73cc59a165349ea56cd79468777d57c61cc79b4054e0a40ddf18513fa7adb6cc` | `3969` | `{"digest":"f9a8e3c50a373fff6540a8bd7fde4c6094936d54f9a1d76b978319f84bedc9dd"}` |
| hash.keccak256 | `0x8cbcead9d183bf495d9009f37c27fad4b35026ba74ce6cb34898de7861a1a09d` | `3970` | `{"digest":"0x75c8c3fb2792afb3e58d9f00944fe82beadc4b2d75905ee68530d4e8aa6f1066"}` |
| crypto.rsa_verify | `0x1821022df0c6643e5afc426dc79e5df9942e52a695f1a194420436cbbcd31337` | `3971` | `{"is_valid":true}` |
| math.modexp | `0xd2add6e78fd8900e50bd996af175145c1e02740ae6651d7243e0d7665a9b8404` | `3972` | `{"value":"4"}` |
| math.polynomial | `0x4b6f06d52f667548156efd1c7bec05b4fd1c58898df6a097c54c0a3f6e0d78ef` | `3973` | `{"value":"15"}` |
| matrix.multiply | `0xa65b662bf4a9cab5e5a1fb0285ca7c956cbd28f410596f749cbad16f6ce0dcf1` | `3974` | `{"matrix":[[19,22],[43,50]]}` |
| vector.cosine_similarity | `0xa7c0983b88103ce89b6c3c138e5e69bb344e9318e364def9a3d12308aaef65dc` | `3975` | `{"similarity":1}` |
| merkle.root | `0x7b0e330a78909dec17a10b3f6058ace522fbbbccf189f4226afd1f703c0d448f` | `3976` | `{"root":"d31a37ef6ac14a2db1470c4316beb5592e6afd4465022339adafda76a18ffabe"}` |
| zkp.public_signal_hash | `0x9a824223fd91a2879e8a7999dfcae9d29ab26e0c386787685bd7ab1c679d7cff` | `3977` | `{"digest":"96bec0b6442d3eb5be3b0ed884c8df07835adc41ba13374cc12ba5a364d604ef"}` |
| zkp.proof_digest | `0xfb1fa69cb152b91cd5b83f9755c7e88b494385d6e01e7dc6349afd97ffbc30f3` | `3978` | `{"digest":"545c3fac1e0066329f385ea3ac4497f89cf970ae00ba176d89cefec7d47f064d"}` |
| zkp.witness_digest | `0x1c0927dfbf21080e6dc5f663f30e125d4d633387a013fb995a23c730a6ece7a8` | `3979` | `{"digest":"634346f5df11df8fdae3a57a110545fc38c8abae35bdbeda91cdd873c716914a"}` |
| zkp.groth16.prove.plan | `0xfb3e28c1dcea3507023aa46c8f90d36ccc391772b262b3e6d8f4716bbb32498a` | `3980` | `{"constraints":100000,"witness_count":5000,"estimated_segments":2,"estimated_memory_mb":5}` |
| zkp.plonk.prove.plan | `0x27d66bca3cd4d727a53c8b6acda8e31da140a9b212452c2763498c64555f2aa5` | `3981` | `{"gates":131072,"estimated_polynomials":2,"estimated_memory_mb":5}` |
| fhe.batch_plan | `0x47179fa70bcf15f1b1321d75e847f57e2a9f0131b0353096bb17f329a4b9d305` | `3982` | `{"slot_count":16,"ciphertext_count":3,"slots_per_ciphertext":6}` |
| fhe.noise_budget_estimate | `0x8c95cb203ae6295c255e463b783675b93aa1561868d078741c508a75bad99edf` | `3983` | `{"multiplicative_depth":2,"scale_bits":40,"modulus_bits":218,"estimated_noise_budget":138}` |
| fhe.rotation_plan | `0x829fb731727f86818ebddb1d6727199fae3432a33241bdb243e16197864f7402` | `3984` | `{"indices":[1,-1,4,1],"unique_rotations":[-1,1,4],"key_switch_steps":4}` |
| privacy.mask | `0x692f8284aa7c34977bf54f98aec5e23554a8a09e5579f85b2cbe40d973db8f6b` | `3985` | `{"masked":"sec************34"}` |
| privacy.add_noise | `0x594465cd32df64b32db0189b99f3effad425f7598237b3b6a3752f9a57b9a276` | `3986` | `{"noisy_value":9.943219353348278}` |

## Detailed Results

### hash.sha256

```json
{
  "name": "hash.sha256",
  "txid": "0x73cc59a165349ea56cd79468777d57c61cc79b4054e0a40ddf18513fa7adb6cc",
  "request_id": "3969",
  "result": {
    "digest": "f9a8e3c50a373fff6540a8bd7fde4c6094936d54f9a1d76b978319f84bedc9dd"
  }
}
```

### hash.keccak256

```json
{
  "name": "hash.keccak256",
  "txid": "0x8cbcead9d183bf495d9009f37c27fad4b35026ba74ce6cb34898de7861a1a09d",
  "request_id": "3970",
  "result": {
    "digest": "0x75c8c3fb2792afb3e58d9f00944fe82beadc4b2d75905ee68530d4e8aa6f1066"
  }
}
```

### crypto.rsa_verify

```json
{
  "name": "crypto.rsa_verify",
  "txid": "0x1821022df0c6643e5afc426dc79e5df9942e52a695f1a194420436cbbcd31337",
  "request_id": "3971",
  "result": {
    "is_valid": true
  }
}
```

### math.modexp

```json
{
  "name": "math.modexp",
  "txid": "0xd2add6e78fd8900e50bd996af175145c1e02740ae6651d7243e0d7665a9b8404",
  "request_id": "3972",
  "result": {
    "value": "4"
  }
}
```

### math.polynomial

```json
{
  "name": "math.polynomial",
  "txid": "0x4b6f06d52f667548156efd1c7bec05b4fd1c58898df6a097c54c0a3f6e0d78ef",
  "request_id": "3973",
  "result": {
    "value": "15"
  }
}
```

### matrix.multiply

```json
{
  "name": "matrix.multiply",
  "txid": "0xa65b662bf4a9cab5e5a1fb0285ca7c956cbd28f410596f749cbad16f6ce0dcf1",
  "request_id": "3974",
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
  "txid": "0xa7c0983b88103ce89b6c3c138e5e69bb344e9318e364def9a3d12308aaef65dc",
  "request_id": "3975",
  "result": {
    "similarity": 1
  }
}
```

### merkle.root

```json
{
  "name": "merkle.root",
  "txid": "0x7b0e330a78909dec17a10b3f6058ace522fbbbccf189f4226afd1f703c0d448f",
  "request_id": "3976",
  "result": {
    "root": "d31a37ef6ac14a2db1470c4316beb5592e6afd4465022339adafda76a18ffabe"
  }
}
```

### zkp.public_signal_hash

```json
{
  "name": "zkp.public_signal_hash",
  "txid": "0x9a824223fd91a2879e8a7999dfcae9d29ab26e0c386787685bd7ab1c679d7cff",
  "request_id": "3977",
  "result": {
    "digest": "96bec0b6442d3eb5be3b0ed884c8df07835adc41ba13374cc12ba5a364d604ef"
  }
}
```

### zkp.proof_digest

```json
{
  "name": "zkp.proof_digest",
  "txid": "0xfb1fa69cb152b91cd5b83f9755c7e88b494385d6e01e7dc6349afd97ffbc30f3",
  "request_id": "3978",
  "result": {
    "digest": "545c3fac1e0066329f385ea3ac4497f89cf970ae00ba176d89cefec7d47f064d"
  }
}
```

### zkp.witness_digest

```json
{
  "name": "zkp.witness_digest",
  "txid": "0x1c0927dfbf21080e6dc5f663f30e125d4d633387a013fb995a23c730a6ece7a8",
  "request_id": "3979",
  "result": {
    "digest": "634346f5df11df8fdae3a57a110545fc38c8abae35bdbeda91cdd873c716914a"
  }
}
```

### zkp.groth16.prove.plan

```json
{
  "name": "zkp.groth16.prove.plan",
  "txid": "0xfb3e28c1dcea3507023aa46c8f90d36ccc391772b262b3e6d8f4716bbb32498a",
  "request_id": "3980",
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
  "txid": "0x27d66bca3cd4d727a53c8b6acda8e31da140a9b212452c2763498c64555f2aa5",
  "request_id": "3981",
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
  "txid": "0x47179fa70bcf15f1b1321d75e847f57e2a9f0131b0353096bb17f329a4b9d305",
  "request_id": "3982",
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
  "txid": "0x8c95cb203ae6295c255e463b783675b93aa1561868d078741c508a75bad99edf",
  "request_id": "3983",
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
  "txid": "0x829fb731727f86818ebddb1d6727199fae3432a33241bdb243e16197864f7402",
  "request_id": "3984",
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
  "txid": "0x692f8284aa7c34977bf54f98aec5e23554a8a09e5579f85b2cbe40d973db8f6b",
  "request_id": "3985",
  "result": {
    "masked": "sec************34"
  }
}
```

### privacy.add_noise

```json
{
  "name": "privacy.add_noise",
  "txid": "0x594465cd32df64b32db0189b99f3effad425f7598237b3b6a3752f9a57b9a276",
  "request_id": "3986",
  "result": {
    "noisy_value": 9.943219353348278
  }
}
```
