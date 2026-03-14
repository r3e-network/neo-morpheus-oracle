# Mainnet Privacy Validation

Generated: 2026-03-13T10:42:17.989Z

## Environment

- Network: `mainnet`
- Chain: `neo_n3`
- Oracle: `0x017520f068fd602082fe5572596185e62a4ad991`
- Example consumer (custom contract): `0x89b05cac00804648c666b47ecb1c57bc185821b7`
- Request fee: `1000000`
- Total deposited during run: `1000000`
- Remaining fee credit after run: `7000000`

## Case Matrix

| Case | Request Type | Tx | Request ID | Result | Pass |
| --- | --- | --- | --- | --- | --- |
| provider_plain | privacy_oracle | `0xfb222e5547f9771c5c88aaa418f6b39dc1216ada66e47807149608d36e73734b` | `148` | `"2.656"` | yes |
| provider_encrypted_params | privacy_oracle | `0xad6e347a5e85071b6c9d56536584eb8328b4d1c3317b771c96ceb5aa0d757975` | `151` | `"2.656"` | yes |
| compute_builtin_encrypted | compute | `0x6a511dc43eccc18ee61c75e24c3aed880b58e832f73b86689b9b04cef8458e82` | `153` | `{"value":"4"}` | yes |
| compute_custom_script_encrypted | compute | `0x22f3c64dbae89f81bc29f32c9ae038514b8c976e607aeb2e4a0c431f4f29f255` | `157` | `42` | yes |
| oracle_custom_url_encrypted_params | oracle | `0x1908d06e6186fe2c04129e15a07d0dcaa966ecc4c05c799172d30f5a208e2b07` | `159` | `"neo-morpheus"` | yes |
| oracle_custom_url_encrypted_script | oracle | `0x7b851e70df4f258a563959945d0dbdb7a6413a18090a1dbdb575c0ed8dd63311` | `160` | `"neo-morpheus-script"` | yes |
| provider_encrypted_script | privacy_oracle | `0x9785e659758d53cac73bcb3ea903ac9d52f53e254cb19daa78eae4c09c327eb8` | `163` | `true` | yes |

## Detailed Results

### provider_plain

- Title: Privacy Oracle builtin provider, public params
- Request type: `privacy_oracle`
- Txid: `0xfb222e5547f9771c5c88aaa418f6b39dc1216ada66e47807149608d36e73734b`
- Request ID: `148`
- Expected: Extracted value is a non-empty NEO/USD price string.
- Actual: `"2.656"`

Public payload:
```json
{
  "provider": "twelvedata",
  "symbol": "NEO-USD",
  "json_path": "price",
  "target_chain": "neo_n3"
}
```

Confidential payload summary:
```json
null
```

On-chain request summary:
```json
{
  "request_type": "privacy_oracle",
  "requester": "0x6d0656f6dd91469db1c90cc1e574380613f43738",
  "callback_contract": "0x89b05cac00804648c666b47ecb1c57bc185821b7",
  "callback_method": "onOracleResult",
  "payload_sha256": "1a106dd5294a549c8af7ee916af11a44965908cd47ec7e3055bfba9e6a1677b4",
  "payload_contains_encrypted_params": false,
  "payload_contains_encrypted_payload": false
}
```

Callback result:
```json
{
  "version": "morpheus-result/v1",
  "request_type": "privacy_oracle",
  "success": true,
  "result": {
    "mode": "fetch",
    "target_chain": "neo_n3",
    "request_source": "morpheus-relayer:neo_n3",
    "upstream_status": 200,
    "extracted_value": "2.656",
    "result": "2.656"
  },
  "verification": {
    "output_hash": "c86fc26a361b0422d33e9a5b8d667cd1a35279f9074386c8514f8dea56a40b2e",
    "attestation_hash": "c86fc26a361b0422d33e9a5b8d667cd1a35279f9074386c8514f8dea56a40b2e",
    "signature": "51f94a9ae5d84d0a0bb84116dfe5f574f1be05e4ca541c07928bb2a1e106106d5abda18c58b2f95ec4c31782ec3c7b41c0fb3b29a0a16aa53b1dafa32e5f98a4",
    "public_key": "03ca637032787820b38737090580c5e4013cbf34624b7d5510a36b92fb49d5b42a",
    "tee_attestation": {
      "app_id": "966f16610bdfe1794a503e16c5ae0bc69a1d92f1",
      "compose_hash": "9b0b3446bda62c4a4770b62d6025761787cf8207ece784cfe0dad83f38ec2984",
      "report_data": "c86fc26a361b0422d33e9a5b8d667cd1a35279f9074386c8514f8dea56a40b2e0000000000000000000000000000000000000000000000000000000000000000",
      "quote_hash": "c26cb06d7428ac81168985d56dc6642c5616eec1b567505a784e4e30b3507c21"
    }
  }
}
```

Verification summary:
```json
{
  "output_hash": "c86fc26a361b0422d33e9a5b8d667cd1a35279f9074386c8514f8dea56a40b2e",
  "attestation_hash": "c86fc26a361b0422d33e9a5b8d667cd1a35279f9074386c8514f8dea56a40b2e",
  "public_key": "03ca637032787820b38737090580c5e4013cbf34624b7d5510a36b92fb49d5b42a",
  "tee_app_id": "966f16610bdfe1794a503e16c5ae0bc69a1d92f1",
  "tee_compose_hash": "9b0b3446bda62c4a4770b62d6025761787cf8207ece784cfe0dad83f38ec2984"
}
```

### provider_encrypted_params

- Title: Privacy Oracle builtin provider, encrypted params in user tx
- Request type: `privacy_oracle`
- Txid: `0xad6e347a5e85071b6c9d56536584eb8328b4d1c3317b771c96ceb5aa0d757975`
- Request ID: `151`
- Expected: Encrypted json_path is merged inside TEE and returns a price string.
- Actual: `"2.656"`

Public payload:
```json
{
  "provider": "twelvedata",
  "symbol": "NEO-USD",
  "target_chain": "neo_n3",
  "encrypted_params": "eyJ2IjoyLCJhbGciOiJYMjU1MTktSEtERi1TSEEyNTYtQUVTLTI1Ni1HQ00iLCJlcGsiOiJ1MDVXMnhuTjV5TjNCRGVPNjQrdEttajBTTmRSMkROeWdUNy9KV2QvN2w4PSIsIml2IjoiamQyeFQ4SDJhOGhUcXdpSSIsImN0Ijoidk91N21TLzk1UThiWGEzdUpNVGlMQ2luUGY2QiIsInRhZyI6InZaQy9IajNOL3B5cS9XZERWQm4raVE9PSJ9"
}
```

Confidential payload summary:
```json
{
  "plaintext_patch": {
    "json_path": "price"
  },
  "ciphertext_length": 256,
  "ciphertext_sha256": "d60666f0221c3a0d73528077da13fa2b5cd62163a91d815e6a987de75bce955f"
}
```

On-chain request summary:
```json
{
  "request_type": "privacy_oracle",
  "requester": "0x6d0656f6dd91469db1c90cc1e574380613f43738",
  "callback_contract": "0x89b05cac00804648c666b47ecb1c57bc185821b7",
  "callback_method": "onOracleResult",
  "payload_sha256": "da996b5e088ce66b71073f13dba955757be8e1b0dfdd3fa7c5fe865f14e22037",
  "payload_contains_encrypted_params": true,
  "payload_contains_encrypted_payload": false
}
```

Callback result:
```json
{
  "version": "morpheus-result/v1",
  "request_type": "privacy_oracle",
  "success": true,
  "result": {
    "mode": "fetch",
    "target_chain": "neo_n3",
    "request_source": "morpheus-relayer:neo_n3",
    "upstream_status": 200,
    "extracted_value": "2.656",
    "result": "2.656"
  },
  "verification": {
    "output_hash": "c86fc26a361b0422d33e9a5b8d667cd1a35279f9074386c8514f8dea56a40b2e",
    "attestation_hash": "c86fc26a361b0422d33e9a5b8d667cd1a35279f9074386c8514f8dea56a40b2e",
    "signature": "51f94a9ae5d84d0a0bb84116dfe5f574f1be05e4ca541c07928bb2a1e106106d5abda18c58b2f95ec4c31782ec3c7b41c0fb3b29a0a16aa53b1dafa32e5f98a4",
    "public_key": "03ca637032787820b38737090580c5e4013cbf34624b7d5510a36b92fb49d5b42a",
    "tee_attestation": {
      "app_id": "966f16610bdfe1794a503e16c5ae0bc69a1d92f1",
      "compose_hash": "9b0b3446bda62c4a4770b62d6025761787cf8207ece784cfe0dad83f38ec2984",
      "report_data": "c86fc26a361b0422d33e9a5b8d667cd1a35279f9074386c8514f8dea56a40b2e0000000000000000000000000000000000000000000000000000000000000000",
      "quote_hash": "23014a9c62e3736aa68d7d2147518733ce38f2e7317a285de3039f545d0dd604"
    }
  }
}
```

Verification summary:
```json
{
  "output_hash": "c86fc26a361b0422d33e9a5b8d667cd1a35279f9074386c8514f8dea56a40b2e",
  "attestation_hash": "c86fc26a361b0422d33e9a5b8d667cd1a35279f9074386c8514f8dea56a40b2e",
  "public_key": "03ca637032787820b38737090580c5e4013cbf34624b7d5510a36b92fb49d5b42a",
  "tee_app_id": "966f16610bdfe1794a503e16c5ae0bc69a1d92f1",
  "tee_compose_hash": "9b0b3446bda62c4a4770b62d6025761787cf8207ece784cfe0dad83f38ec2984"
}
```

### compute_builtin_encrypted

- Title: Privacy Compute builtin function, encrypted payload
- Request type: `compute`
- Txid: `0x6a511dc43eccc18ee61c75e24c3aed880b58e832f73b86689b9b04cef8458e82`
- Request ID: `153`
- Expected: math.modexp returns 4.
- Actual: `{"value":"4"}`

Public payload:
```json
{
  "encrypted_payload": "eyJ2IjoyLCJhbGciOiJYMjU1MTktSEtERi1TSEEyNTYtQUVTLTI1Ni1HQ00iLCJlcGsiOiJleTJxTzdwRVhxbDIzVnA4NktoaGtiNEFmaTRJbjVDekJlM3Nmdi9lYnpZPSIsIml2IjoiSG9MbjB5T1IwNS9FdXBZNyIsImN0IjoiTHBzeVVWa1JMS212RnN1VnV5SkJNQ1JNS2NIN25UcXpFd0oyNkcvbVJLVkhjdDlMcmpia2V3VVRKUGlqVmpMLzljMzNmdDVRbkh2c2RYY29hcmFSWERVWVFiMWJWOGh6TlY4YmR5MTA5eGNZQlVFV3JEYjdSQWZ4K3VGQjdLWEJoRWs5d1FLSjFXOGViVm5lbTZrdDJrQVlja1UxaTV3PSIsInRhZyI6InNIRmNaQUNHLzFtZEVyZFVSZGJnanc9PSJ9"
}
```

Confidential payload summary:
```json
{
  "plaintext_payload": {
    "mode": "builtin",
    "function": "math.modexp",
    "input": {
      "base": "2",
      "exponent": "10",
      "modulus": "17"
    },
    "target_chain": "neo_n3"
  },
  "ciphertext_length": 432,
  "ciphertext_sha256": "1bf51c674fb20a35e44597799886b7df21858cb028203469cefc1c1d402b8c4f"
}
```

On-chain request summary:
```json
{
  "request_type": "compute",
  "requester": "0x6d0656f6dd91469db1c90cc1e574380613f43738",
  "callback_contract": "0x89b05cac00804648c666b47ecb1c57bc185821b7",
  "callback_method": "onOracleResult",
  "payload_sha256": "27ec7083e659c2e5a9220e3713a4166e0d5d03b7cecdfc3fa52d46b3c6df4a97",
  "payload_contains_encrypted_params": false,
  "payload_contains_encrypted_payload": true
}
```

Callback result:
```json
{
  "version": "morpheus-result/v1",
  "request_type": "compute",
  "success": true,
  "result": {
    "mode": "builtin",
    "function": "math.modexp",
    "target_chain": "neo_n3",
    "result": {
      "value": "4"
    }
  },
  "verification": {
    "output_hash": "b0ddf9861e910df24dfde9742431d1b3ec9ba81a7570f3c3c715bec08040266d",
    "attestation_hash": "b0ddf9861e910df24dfde9742431d1b3ec9ba81a7570f3c3c715bec08040266d",
    "signature": "336696eee3d2b324125dc98bc366500380c944d877c67a68636a9a93d61d8702952ac4a971f49f71730796535b8821269fe45c2611c1d35577c6ba248b714ad7",
    "public_key": "03ca637032787820b38737090580c5e4013cbf34624b7d5510a36b92fb49d5b42a",
    "tee_attestation": {
      "app_id": "966f16610bdfe1794a503e16c5ae0bc69a1d92f1",
      "compose_hash": "9b0b3446bda62c4a4770b62d6025761787cf8207ece784cfe0dad83f38ec2984",
      "report_data": "b0ddf9861e910df24dfde9742431d1b3ec9ba81a7570f3c3c715bec08040266d0000000000000000000000000000000000000000000000000000000000000000",
      "quote_hash": "dc2ebcd5325bba935c8dc47f61abbf004daf8df4c46796f49eea4279739bd528"
    }
  }
}
```

Verification summary:
```json
{
  "output_hash": "b0ddf9861e910df24dfde9742431d1b3ec9ba81a7570f3c3c715bec08040266d",
  "attestation_hash": "b0ddf9861e910df24dfde9742431d1b3ec9ba81a7570f3c3c715bec08040266d",
  "public_key": "03ca637032787820b38737090580c5e4013cbf34624b7d5510a36b92fb49d5b42a",
  "tee_app_id": "966f16610bdfe1794a503e16c5ae0bc69a1d92f1",
  "tee_compose_hash": "9b0b3446bda62c4a4770b62d6025761787cf8207ece784cfe0dad83f38ec2984"
}
```

### compute_custom_script_encrypted

- Title: Privacy Compute custom JS function, encrypted payload
- Request type: `compute`
- Txid: `0x22f3c64dbae89f81bc29f32c9ae038514b8c976e607aeb2e4a0c431f4f29f255`
- Request ID: `157`
- Expected: Encrypted custom compute function returns 42.
- Actual: `42`

Public payload:
```json
{
  "encrypted_payload": "eyJ2IjoyLCJhbGciOiJYMjU1MTktSEtERi1TSEEyNTYtQUVTLTI1Ni1HQ00iLCJlcGsiOiJnZ1JLODY0QlpsMFNHWEp6RERsRUttRTZ0NUYySG1qNWJNbW82anFzeUFFPSIsIml2Ijoib1kxVDhEVjVxZ3BqT29hcCIsImN0IjoibEkwOWhkV1pYOXVUckdpSE1KUEdhQUlvTnR1NlBFa3d3aGZMcHNHckxuanFFdFNwUjNLMTdYLzA1UFRLMFEzUDlaN0cyUStRTnpJYjdFN1d3RS9XeHZYeVZ6NW5HQ1cxS1c4NnRla1dObm5SUEFDazgwZ3VwQktqZEIxY0RhME1lUGlHa1RiSDJBUDg0UVBFeDJWKzIwQk1za2lOR3JXRDF6ZytNYXQ1WDdGbUF4bHhIcUFNdkp2V29STnpMOUxVVE5TVDlmdms2WEpOcm5hZkZOZ1k1dz09IiwidGFnIjoiSlJrQnU5TVl6OG56dGhoN3ozRGpiUT09In0="
}
```

Confidential payload summary:
```json
{
  "plaintext_payload": {
    "mode": "script",
    "script": "function run(input) { return input.left + input.right; }",
    "entry_point": "run",
    "input": {
      "left": 20,
      "right": 22
    },
    "target_chain": "neo_n3"
  },
  "encryption_mode": "X25519-HKDF-SHA256-AES-256-GCM",
  "ciphertext_length": 508,
  "ciphertext_sha256": "4fb3670a921e4c30d8cc84f45c36c165c4ba101f5d6c158723e42f49cfe54cdc"
}
```

On-chain request summary:
```json
{
  "request_type": "compute",
  "requester": "0x6d0656f6dd91469db1c90cc1e574380613f43738",
  "callback_contract": "0x89b05cac00804648c666b47ecb1c57bc185821b7",
  "callback_method": "onOracleResult",
  "payload_sha256": "ec2298fa2eaa32871df43873eb4ed2f93097ac26404639f31c6975cd1a8b8c44",
  "payload_contains_encrypted_params": false,
  "payload_contains_encrypted_payload": true
}
```

Callback result:
```json
{
  "version": "morpheus-result/v1",
  "request_type": "compute",
  "success": true,
  "result": {
    "mode": "script",
    "entry_point": "run",
    "target_chain": "neo_n3",
    "result": 42
  },
  "verification": {
    "output_hash": "b0f4393fd875178eef7c76663f79aaa92c960088a999036c310cb10915df920e",
    "attestation_hash": "b0f4393fd875178eef7c76663f79aaa92c960088a999036c310cb10915df920e",
    "signature": "2ec817f8dda551416be25185011b02ce801d8f68f0d7d619879cd9e14165a4eed59f82bbde139901f7a31267293886adb71d621d5e4044fa210a27cd2ecfb5fa",
    "public_key": "03ca637032787820b38737090580c5e4013cbf34624b7d5510a36b92fb49d5b42a",
    "tee_attestation": {
      "app_id": "966f16610bdfe1794a503e16c5ae0bc69a1d92f1",
      "compose_hash": "9b0b3446bda62c4a4770b62d6025761787cf8207ece784cfe0dad83f38ec2984",
      "report_data": "b0f4393fd875178eef7c76663f79aaa92c960088a999036c310cb10915df920e0000000000000000000000000000000000000000000000000000000000000000",
      "quote_hash": "0eee0cc61617c4e0c26921912d06f5e8e3f62604d59f268e610945e123ee27f3"
    }
  }
}
```

Verification summary:
```json
{
  "output_hash": "b0f4393fd875178eef7c76663f79aaa92c960088a999036c310cb10915df920e",
  "attestation_hash": "b0f4393fd875178eef7c76663f79aaa92c960088a999036c310cb10915df920e",
  "public_key": "03ca637032787820b38737090580c5e4013cbf34624b7d5510a36b92fb49d5b42a",
  "tee_app_id": "966f16610bdfe1794a503e16c5ae0bc69a1d92f1",
  "tee_compose_hash": "9b0b3446bda62c4a4770b62d6025761787cf8207ece784cfe0dad83f38ec2984"
}
```

### oracle_custom_url_encrypted_params

- Title: Privacy Oracle custom URL, encrypted params
- Request type: `oracle`
- Txid: `0x1908d06e6186fe2c04129e15a07d0dcaa966ecc4c05c799172d30f5a208e2b07`
- Request ID: `159`
- Expected: Custom URL flow returns the echoed probe string.
- Actual: `"neo-morpheus"`

Public payload:
```json
{
  "url": "https://postman-echo.com/get?probe=neo-morpheus",
  "target_chain": "neo_n3",
  "encrypted_params": "eyJ2IjoyLCJhbGciOiJYMjU1MTktSEtERi1TSEEyNTYtQUVTLTI1Ni1HQ00iLCJlcGsiOiI0MytTZkgvVkh2ZmtiOW9CYWVTQmo2cU11azY0TXljdVRSdGNBaHZhbjNNPSIsIml2IjoiNzlqbWdoZGZhK2VIT2RZZCIsImN0IjoiWmpza3Q0cit2L1FCWTBZa1g3LzJvaUdxVkY0UG1udnYxRWc9IiwidGFnIjoiREcyUC93Ukc2VTl4MnN6SmhIUXhZQT09In0="
}
```

Confidential payload summary:
```json
{
  "plaintext_patch": {
    "json_path": "args.probe"
  },
  "ciphertext_length": 268,
  "ciphertext_sha256": "844faf89de7385d33aea17d4b002e70cb796a6f850b4fc1f8e21d88e23475ea6"
}
```

On-chain request summary:
```json
{
  "request_type": "oracle",
  "requester": "0x6d0656f6dd91469db1c90cc1e574380613f43738",
  "callback_contract": "0x89b05cac00804648c666b47ecb1c57bc185821b7",
  "callback_method": "onOracleResult",
  "payload_sha256": "acf4d411e4901cb21feed6d4954be5006095f1db5a9fb3df97d426d2b744952e",
  "payload_contains_encrypted_params": true,
  "payload_contains_encrypted_payload": false
}
```

Callback result:
```json
{
  "version": "morpheus-result/v1",
  "request_type": "oracle",
  "success": true,
  "result": {
    "mode": "fetch",
    "target_chain": "neo_n3",
    "request_source": "morpheus-relayer:neo_n3",
    "upstream_status": 200,
    "extracted_value": "neo-morpheus",
    "result": "neo-morpheus"
  },
  "verification": {
    "output_hash": "88f6521f7268720b8d1a27c2c3c75df3007cd8698769e053fd3b0fa9183be8ae",
    "attestation_hash": "88f6521f7268720b8d1a27c2c3c75df3007cd8698769e053fd3b0fa9183be8ae",
    "signature": "c4ada4730c986f9ba13fca516a4817a1326aeccc9c58382489b012a98a11c6daed4b97fc1f1447442fef1df35ab1421e713b8068470e132f445a64108b6d4605",
    "public_key": "03ca637032787820b38737090580c5e4013cbf34624b7d5510a36b92fb49d5b42a",
    "tee_attestation": {
      "app_id": "966f16610bdfe1794a503e16c5ae0bc69a1d92f1",
      "compose_hash": "9b0b3446bda62c4a4770b62d6025761787cf8207ece784cfe0dad83f38ec2984",
      "report_data": "88f6521f7268720b8d1a27c2c3c75df3007cd8698769e053fd3b0fa9183be8ae0000000000000000000000000000000000000000000000000000000000000000",
      "quote_hash": "8667a485cbe0d2eea78a9e27b661fdcc4e4deec82f5cef58012b94897e21adc9"
    }
  }
}
```

Verification summary:
```json
{
  "output_hash": "88f6521f7268720b8d1a27c2c3c75df3007cd8698769e053fd3b0fa9183be8ae",
  "attestation_hash": "88f6521f7268720b8d1a27c2c3c75df3007cd8698769e053fd3b0fa9183be8ae",
  "public_key": "03ca637032787820b38737090580c5e4013cbf34624b7d5510a36b92fb49d5b42a",
  "tee_app_id": "966f16610bdfe1794a503e16c5ae0bc69a1d92f1",
  "tee_compose_hash": "9b0b3446bda62c4a4770b62d6025761787cf8207ece784cfe0dad83f38ec2984"
}
```

### oracle_custom_url_encrypted_script

- Title: Privacy Oracle custom URL, encrypted params plus custom JS function
- Request type: `oracle`
- Txid: `0x7b851e70df4f258a563959945d0dbdb7a6413a18090a1dbdb575c0ed8dd63311`
- Request ID: `160`
- Expected: Encrypted custom script transforms the echoed probe into neo-morpheus-script.
- Actual: `"neo-morpheus-script"`

Public payload:
```json
{
  "url": "https://postman-echo.com/get?probe=neo-morpheus",
  "target_chain": "neo_n3",
  "encrypted_params": "eyJ2IjoyLCJhbGciOiJYMjU1MTktSEtERi1TSEEyNTYtQUVTLTI1Ni1HQ00iLCJlcGsiOiJWNk81SktKVzlxMVZBcGJuL1FmRlBzZmtuTFd5OXZXV2xsZ2oyK2x0eWkwPSIsIml2IjoiTWZRRWRwRWpXYVU5NG16dyIsImN0IjoiS1RhV0ZZQWZFSUVyNXAyWXhzbG5JT2prLzROK1pJK00xclk1bSs3bytqZjRYeHFJY2ovTXVCTURZZllLcG1SQ0RSVlVsR2w1SHRyemdzaHZlNWRvZXkxZExPRVp1bzRCQitJUGIvRDNqT3J6QVFZakJER1M2bXJvOUh1M1Z2MWJiZXdvL1E9PSIsInRhZyI6ImViZ3MzZ2JGVkN4amhVLzV5ZkZQclE9PSJ9"
}
```

Confidential payload summary:
```json
{
  "plaintext_patch": {
    "json_path": "args.probe",
    "script": "function process(data) { return data.args.probe + '-script'; }"
  },
  "encryption_mode": "X25519-HKDF-SHA256-AES-256-GCM",
  "ciphertext_length": 400,
  "ciphertext_sha256": "7b76388cdd10badb6a391bcb0814ebd366d997081f12236e31d648f43601e9e8"
}
```

On-chain request summary:
```json
{
  "request_type": "oracle",
  "requester": "0x6d0656f6dd91469db1c90cc1e574380613f43738",
  "callback_contract": "0x89b05cac00804648c666b47ecb1c57bc185821b7",
  "callback_method": "onOracleResult",
  "payload_sha256": "70cfdd9033afe88a571d84f22c760a7b3f8c283e9e03f31560a3fc876398c27a",
  "payload_contains_encrypted_params": true,
  "payload_contains_encrypted_payload": false
}
```

Callback result:
```json
{
  "version": "morpheus-result/v1",
  "request_type": "oracle",
  "success": true,
  "result": {
    "mode": "fetch+compute",
    "target_chain": "neo_n3",
    "request_source": "morpheus-relayer:neo_n3",
    "upstream_status": 200,
    "extracted_value": "neo-morpheus",
    "result": "neo-morpheus-script"
  },
  "verification": {
    "output_hash": "1678f84181e65b1c817365ae843eeaa81fc2e6282a7aad54546d6830e2658727",
    "attestation_hash": "1678f84181e65b1c817365ae843eeaa81fc2e6282a7aad54546d6830e2658727",
    "signature": "1d6a1846492d8b3e90ea17e812b36db30e24024bd249204a5ef8b3dbb7d46f2b1bb77355cd3f7603a1af92e4f691c789ad513c03b5d473fc7b9f7aeb7b18c77c",
    "public_key": "03ca637032787820b38737090580c5e4013cbf34624b7d5510a36b92fb49d5b42a",
    "tee_attestation": {
      "app_id": "966f16610bdfe1794a503e16c5ae0bc69a1d92f1",
      "compose_hash": "9b0b3446bda62c4a4770b62d6025761787cf8207ece784cfe0dad83f38ec2984",
      "report_data": "1678f84181e65b1c817365ae843eeaa81fc2e6282a7aad54546d6830e26587270000000000000000000000000000000000000000000000000000000000000000",
      "quote_hash": "e90dd3dc064f12e934826ad874dca77e69e2ee623fd3f70d4098280988537b2e"
    }
  }
}
```

Verification summary:
```json
{
  "output_hash": "1678f84181e65b1c817365ae843eeaa81fc2e6282a7aad54546d6830e2658727",
  "attestation_hash": "1678f84181e65b1c817365ae843eeaa81fc2e6282a7aad54546d6830e2658727",
  "public_key": "03ca637032787820b38737090580c5e4013cbf34624b7d5510a36b92fb49d5b42a",
  "tee_app_id": "966f16610bdfe1794a503e16c5ae0bc69a1d92f1",
  "tee_compose_hash": "9b0b3446bda62c4a4770b62d6025761787cf8207ece784cfe0dad83f38ec2984"
}
```

### provider_encrypted_script

- Title: Privacy Oracle builtin provider, encrypted params plus custom JS function
- Request type: `privacy_oracle`
- Txid: `0x9785e659758d53cac73bcb3ea903ac9d52f53e254cb19daa78eae4c09c327eb8`
- Request ID: `163`
- Expected: Encrypted custom function over builtin provider result returns true.
- Actual: `true`

Public payload:
```json
{
  "provider": "twelvedata",
  "symbol": "NEO-USD",
  "target_chain": "neo_n3",
  "encrypted_params": "eyJ2IjoyLCJhbGciOiJYMjU1MTktSEtERi1TSEEyNTYtQUVTLTI1Ni1HQ00iLCJlcGsiOiJSUyt6UXpJOCtxVXNYdkRaSzVQQmN4LzJLQlNnNG4zRUxlTytqblpSL2tZPSIsIml2IjoiSWNBM3VDL1JWbFpBaVgrNyIsImN0IjoienQ2dUxSTzB3ZkVsdDVaSkRVVmttaWQ0QjZIcG9Cb0RQbmphZG9tdGFYSnhscm9lTzl5UEdHUkZrSzBWV3pOcXAyWUYrV01Md0NKUWdDTXRNazdGUW5kc3ZyY0ZJeTN3WVR0bGhpY2MrdzluelEyZlkreGU2QndDIiwidGFnIjoiQnJ5ZTZCZ3lTK0E0WmcwOE5CVVg0Zz09In0="
}
```

Confidential payload summary:
```json
{
  "plaintext_patch": {
    "json_path": "price",
    "script": "function process(data) { return Number(data.price) > 0; }"
  },
  "encryption_mode": "X25519-HKDF-SHA256-AES-256-GCM",
  "ciphertext_length": 380,
  "ciphertext_sha256": "4595e7e03742e5547a9a84d3adf0f10b94ae39dac0a6fd2a5ed369347b3686ef"
}
```

On-chain request summary:
```json
{
  "request_type": "privacy_oracle",
  "requester": "0x6d0656f6dd91469db1c90cc1e574380613f43738",
  "callback_contract": "0x89b05cac00804648c666b47ecb1c57bc185821b7",
  "callback_method": "onOracleResult",
  "payload_sha256": "397b17a6383aaec4052a3a2a0bc2a2f7fe08c4d189e78b2e8fc72e55e8878b83",
  "payload_contains_encrypted_params": true,
  "payload_contains_encrypted_payload": false
}
```

Callback result:
```json
{
  "version": "morpheus-result/v1",
  "request_type": "privacy_oracle",
  "success": true,
  "result": {
    "mode": "fetch+compute",
    "target_chain": "neo_n3",
    "request_source": "morpheus-relayer:neo_n3",
    "upstream_status": 200,
    "extracted_value": "2.656",
    "result": true
  },
  "verification": {
    "output_hash": "0c04742ea927ddf8ffbde7187c4acbda71790ada988390635f99c3fe195cf32d",
    "attestation_hash": "0c04742ea927ddf8ffbde7187c4acbda71790ada988390635f99c3fe195cf32d",
    "signature": "b719a72254c144f2d0c0423ba74db3fd78a7d0c4e6f9c3502b133e76526813f1748e6557aba4556eb1389306df3f0d45fd39a4cbc3df8408745c478e546fa26a",
    "public_key": "03ca637032787820b38737090580c5e4013cbf34624b7d5510a36b92fb49d5b42a",
    "tee_attestation": {
      "app_id": "966f16610bdfe1794a503e16c5ae0bc69a1d92f1",
      "compose_hash": "9b0b3446bda62c4a4770b62d6025761787cf8207ece784cfe0dad83f38ec2984",
      "report_data": "0c04742ea927ddf8ffbde7187c4acbda71790ada988390635f99c3fe195cf32d0000000000000000000000000000000000000000000000000000000000000000",
      "quote_hash": "4eb7dd3f8e41e944528334959aa3829a92efd21e1d8e431b631c95413818dec0"
    }
  }
}
```

Verification summary:
```json
{
  "output_hash": "0c04742ea927ddf8ffbde7187c4acbda71790ada988390635f99c3fe195cf32d",
  "attestation_hash": "0c04742ea927ddf8ffbde7187c4acbda71790ada988390635f99c3fe195cf32d",
  "public_key": "03ca637032787820b38737090580c5e4013cbf34624b7d5510a36b92fb49d5b42a",
  "tee_app_id": "966f16610bdfe1794a503e16c5ae0bc69a1d92f1",
  "tee_compose_hash": "9b0b3446bda62c4a4770b62d6025761787cf8207ece784cfe0dad83f38ec2984"
}
```

