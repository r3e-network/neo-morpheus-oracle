# Mainnet Privacy Validation

Generated: 2026-03-11T02:46:44.441Z

## Environment

- Network: `mainnet`
- Chain: `neo_n3`
- Oracle: `0x017520f068fd602082fe5572596185e62a4ad991`
- Example consumer (custom contract): `0x89b05cac00804648c666b47ecb1c57bc185821b7`
- Request fee: `1000000`

## Case Matrix

| Case | Request Type | Tx | Request ID | Result | Pass |
| --- | --- | --- | --- | --- | --- |
| provider_plain | privacy_oracle | `0x6e68154a318dff08ef0573122d5ccbbfa61996b5678eff4005b17f46f0b33fe0` | `87` | `"2.492"` | yes |
| provider_encrypted_params | privacy_oracle | `0x658dfc7861810e3478802424e2d098233b633aab5db10030b38880faada841f6` | `88` | `"2.492"` | yes |
| compute_builtin_encrypted | compute | `0x81249491d5635f7dc4560a6850d82d3516b2a03a123c1cbdc863ac1705530c95` | `89` | `{"value":"4"}` | yes |
| compute_custom_script_encrypted | compute | `0x2813e67a6f2199eefd8ca78666ef9c7ee5e00dd6cae73eb8f709a4e2411159b7` | `90` | `42` | yes |
| oracle_custom_url_encrypted_params | oracle | `0x5a17a54293e25335884f87cf4eff6fcb33789fd41fb9c188f45d1be1651508b5` | `91` | `"neo-morpheus"` | yes |
| oracle_custom_url_encrypted_script | oracle | `0x8dcfb552b8a341c5d6c6c8c5c16768ccd9a1773e3706df71e26053fd0114b183` | `92` | `"neo-morpheus-script"` | yes |
| provider_encrypted_script | privacy_oracle | `0x6231a5c3a5e0d57792decde73d78a68fa9425b4f15944e3bf9f0c6236594de95` | `93` | `true` | yes |

## Detailed Results

### provider_plain

- Title: Privacy Oracle builtin provider, public params
- Request type: `privacy_oracle`
- Txid: `0x6e68154a318dff08ef0573122d5ccbbfa61996b5678eff4005b17f46f0b33fe0`
- Request ID: `87`
- Expected: Extracted value is a non-empty NEO/USD price string.
- Actual: `"2.492"`

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
    "extracted_value": "2.492",
    "result": "2.492"
  },
  "verification": {
    "output_hash": "e291f9758654d4602533e14486633bfcb31845e59a327a2adb9da017b5b16b9a",
    "attestation_hash": "e291f9758654d4602533e14486633bfcb31845e59a327a2adb9da017b5b16b9a",
    "signature": "17a9c2651f1fccf86af2ebd04352bea8048f0eb58d748eb39bdb0d9826810795a31bc9b6da07658624264c2324a76660dfcd54d90de4b11e9b216b9ef95f6bbb",
    "public_key": "03ca637032787820b38737090580c5e4013cbf34624b7d5510a36b92fb49d5b42a",
    "tee_attestation": {
      "app_id": "966f16610bdfe1794a503e16c5ae0bc69a1d92f1",
      "compose_hash": "13570eadd833160b3c59d3c6301eb1e640c6a0f18c0ce9b07098ab8832c2de61",
      "report_data": "e291f9758654d4602533e14486633bfcb31845e59a327a2adb9da017b5b16b9a0000000000000000000000000000000000000000000000000000000000000000",
      "quote_hash": "7871189eb14a8710d42f5335dc85f58a3cffe7118ddf268349adebbf909447db"
    }
  }
}
```

Verification summary:
```json
{
  "output_hash": "e291f9758654d4602533e14486633bfcb31845e59a327a2adb9da017b5b16b9a",
  "attestation_hash": "e291f9758654d4602533e14486633bfcb31845e59a327a2adb9da017b5b16b9a",
  "public_key": "03ca637032787820b38737090580c5e4013cbf34624b7d5510a36b92fb49d5b42a",
  "tee_app_id": "966f16610bdfe1794a503e16c5ae0bc69a1d92f1",
  "tee_compose_hash": "13570eadd833160b3c59d3c6301eb1e640c6a0f18c0ce9b07098ab8832c2de61"
}
```

### provider_encrypted_params

- Title: Privacy Oracle builtin provider, encrypted params in user tx
- Request type: `privacy_oracle`
- Txid: `0x658dfc7861810e3478802424e2d098233b633aab5db10030b38880faada841f6`
- Request ID: `88`
- Expected: Encrypted json_path is merged inside TEE and returns a price string.
- Actual: `"2.492"`

Public payload:
```json
{
  "provider": "twelvedata",
  "symbol": "NEO-USD",
  "target_chain": "neo_n3",
  "encrypted_params": "eyJ2IjoyLCJhbGciOiJYMjU1MTktSEtERi1TSEEyNTYtQUVTLTI1Ni1HQ00iLCJlcGsiOiJnam5SQS9KeTl1L280U1ZPZXdkRVN1T2luRSttT3Z6dTNtRmZ0dTFPS0VzPSIsIml2IjoiV0dSWGo1dkZLU0N3Rng1RyIsImN0IjoiOE9mVXBVVHZWdlVGUXZBOW1nRWRXZWY4Sy9FbSIsInRhZyI6Ilhabis0bVV0Y1FtVDltcVhWTjlwbWc9PSJ9"
}
```

Confidential payload summary:
```json
{
  "plaintext_patch": {
    "json_path": "price"
  },
  "ciphertext_length": 256,
  "ciphertext_sha256": "c3605ae168c38009dc7407f0fa4fe32bf8289480dee93133c8b0f304fc80a32a"
}
```

On-chain request summary:
```json
{
  "request_type": "privacy_oracle",
  "requester": "0x6d0656f6dd91469db1c90cc1e574380613f43738",
  "callback_contract": "0x89b05cac00804648c666b47ecb1c57bc185821b7",
  "callback_method": "onOracleResult",
  "payload_sha256": "788ce1b3f1c60d833693e4d95b1688e0007c3a550b826055038363510bcd9b8c",
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
    "extracted_value": "2.492",
    "result": "2.492"
  },
  "verification": {
    "output_hash": "e291f9758654d4602533e14486633bfcb31845e59a327a2adb9da017b5b16b9a",
    "attestation_hash": "e291f9758654d4602533e14486633bfcb31845e59a327a2adb9da017b5b16b9a",
    "signature": "17a9c2651f1fccf86af2ebd04352bea8048f0eb58d748eb39bdb0d9826810795a31bc9b6da07658624264c2324a76660dfcd54d90de4b11e9b216b9ef95f6bbb",
    "public_key": "03ca637032787820b38737090580c5e4013cbf34624b7d5510a36b92fb49d5b42a",
    "tee_attestation": {
      "app_id": "966f16610bdfe1794a503e16c5ae0bc69a1d92f1",
      "compose_hash": "13570eadd833160b3c59d3c6301eb1e640c6a0f18c0ce9b07098ab8832c2de61",
      "report_data": "e291f9758654d4602533e14486633bfcb31845e59a327a2adb9da017b5b16b9a0000000000000000000000000000000000000000000000000000000000000000",
      "quote_hash": "0a897fe575ea989579e950ad4d626fd4de8a4b148dbed226fdfbec05cc432036"
    }
  }
}
```

Verification summary:
```json
{
  "output_hash": "e291f9758654d4602533e14486633bfcb31845e59a327a2adb9da017b5b16b9a",
  "attestation_hash": "e291f9758654d4602533e14486633bfcb31845e59a327a2adb9da017b5b16b9a",
  "public_key": "03ca637032787820b38737090580c5e4013cbf34624b7d5510a36b92fb49d5b42a",
  "tee_app_id": "966f16610bdfe1794a503e16c5ae0bc69a1d92f1",
  "tee_compose_hash": "13570eadd833160b3c59d3c6301eb1e640c6a0f18c0ce9b07098ab8832c2de61"
}
```

### compute_builtin_encrypted

- Title: Privacy Compute builtin function, encrypted payload
- Request type: `compute`
- Txid: `0x81249491d5635f7dc4560a6850d82d3516b2a03a123c1cbdc863ac1705530c95`
- Request ID: `89`
- Expected: math.modexp returns 4.
- Actual: `{"value":"4"}`

Public payload:
```json
{
  "encrypted_payload": "eyJ2IjoyLCJhbGciOiJYMjU1MTktSEtERi1TSEEyNTYtQUVTLTI1Ni1HQ00iLCJlcGsiOiJ6dlBQZWlQTHRMNi9LOERyd3VnbitoV0xKVWh0WFo0SWlVWWkwcHhnVEZ3PSIsIml2IjoicmRHUUhPMVFJMkk0eXZCeiIsImN0IjoienVWNG1kdjhvVUZMMFB4MUhTZW9oMjBReGMyTkc0U1RVUG8rRGI4dXAwY3F1L3UwRUNiSTJDZGxhdDlPVTc3YmN6bFVxTGsyOVJUYkVLaVFYSEoyS25zNGNwZE0rMWQzK0VuQXZxRVFzK2RjZkc2TXgvbkZkd1pUUEN5d3I0L1E1WlRudmEydUJVWmhxTWJwTHhLNXFESW9obWp0dVl3PSIsInRhZyI6IjgxRGZCckFZTWJscUR0NVN4QkRpMkE9PSJ9"
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
  "ciphertext_sha256": "cfe46ba698266af715edf6aa6faee76da10e9e4ea1a24ab72b396fc3775b53fc"
}
```

On-chain request summary:
```json
{
  "request_type": "compute",
  "requester": "0x6d0656f6dd91469db1c90cc1e574380613f43738",
  "callback_contract": "0x89b05cac00804648c666b47ecb1c57bc185821b7",
  "callback_method": "onOracleResult",
  "payload_sha256": "d6d17e126a79ebd3a680e69425913e4bd803632a02dbb1b1aa117e1e99d21c0c",
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
      "compose_hash": "13570eadd833160b3c59d3c6301eb1e640c6a0f18c0ce9b07098ab8832c2de61",
      "report_data": "b0ddf9861e910df24dfde9742431d1b3ec9ba81a7570f3c3c715bec08040266d0000000000000000000000000000000000000000000000000000000000000000",
      "quote_hash": "3c3af56cfc1faf4943a9f6745930bc80d7a64f281f830c5d32013ef1a00c6f18"
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
  "tee_compose_hash": "13570eadd833160b3c59d3c6301eb1e640c6a0f18c0ce9b07098ab8832c2de61"
}
```

### compute_custom_script_encrypted

- Title: Privacy Compute custom JS function, encrypted payload
- Request type: `compute`
- Txid: `0x2813e67a6f2199eefd8ca78666ef9c7ee5e00dd6cae73eb8f709a4e2411159b7`
- Request ID: `90`
- Expected: Encrypted custom compute function returns 42.
- Actual: `42`

Public payload:
```json
{
  "encrypted_payload": "eyJ2IjoyLCJhbGciOiJYMjU1MTktSEtERi1TSEEyNTYtQUVTLTI1Ni1HQ00iLCJlcGsiOiJyeHdnY09CNFMrM0pRUDlOMGozc09GUlFXNGVVY0R0SDdUSmxVQnV4ZVdRPSIsIml2IjoiakF1dTVOUzJmeFJiT25yUyIsImN0IjoibjBuT2NrZzlUU1JybWE0dFVQUlRrL3FFeFpETERjbUQ4MmRFQjZBeStzTGZVemJBT2gvN3RoSTl3ZUhHeXhwK0x5WkkyTkk5QzJuNnNRdWVoU09IM0tGYXpHeHN5aS9LVVZRczFiUy9CdGx0MENzSkVkcVRMMS9EaStnQmI1SVVEcXB1dzNveGp0Ri9HQVc3UUl4eS8rWlNQMG1zSTZDMUZkTFJKUENTZTltZVM0M1VVdTg3dlpqckhuSlh6US9id1U1VzJVeG9CRmhhTDFFRGJvNjlpUT09IiwidGFnIjoibU9vaC9rbTNBRHlzL0VsaVY4OHdKQT09In0="
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
  "ciphertext_sha256": "206eea8883165ef256151982525d110cb0922c1723a22c07843e5436e57a5e5e"
}
```

On-chain request summary:
```json
{
  "request_type": "compute",
  "requester": "0x6d0656f6dd91469db1c90cc1e574380613f43738",
  "callback_contract": "0x89b05cac00804648c666b47ecb1c57bc185821b7",
  "callback_method": "onOracleResult",
  "payload_sha256": "b6a6bcc5ee14391eab2750b6b5e5d481cbdf1718a7f8a1c2e031397c3c79448b",
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
      "compose_hash": "13570eadd833160b3c59d3c6301eb1e640c6a0f18c0ce9b07098ab8832c2de61",
      "report_data": "b0f4393fd875178eef7c76663f79aaa92c960088a999036c310cb10915df920e0000000000000000000000000000000000000000000000000000000000000000",
      "quote_hash": "2932a07cfd7c000552b3a8be01fa4c8cfb52720f5f9d9d1e2e630e169c57d176"
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
  "tee_compose_hash": "13570eadd833160b3c59d3c6301eb1e640c6a0f18c0ce9b07098ab8832c2de61"
}
```

### oracle_custom_url_encrypted_params

- Title: Privacy Oracle custom URL, encrypted params
- Request type: `oracle`
- Txid: `0x5a17a54293e25335884f87cf4eff6fcb33789fd41fb9c188f45d1be1651508b5`
- Request ID: `91`
- Expected: Custom URL flow returns the echoed probe string.
- Actual: `"neo-morpheus"`

Public payload:
```json
{
  "url": "https://postman-echo.com/get?probe=neo-morpheus",
  "target_chain": "neo_n3",
  "encrypted_params": "eyJ2IjoyLCJhbGciOiJYMjU1MTktSEtERi1TSEEyNTYtQUVTLTI1Ni1HQ00iLCJlcGsiOiI5SkhDR2dkR09TQnEwMXZnNGloTitqMXFobTdNU3MzNTNVdEJOREgvT0VvPSIsIml2IjoiWDVwY2QyMjh6dGdYS2daWSIsImN0IjoiNE03VThkaGxJVUZlYkFBNVAzZmtHUksxaUNROVNDS3VGeFU9IiwidGFnIjoieU9WSXg5T2VuR28zeU10WHhBdFhGUT09In0="
}
```

Confidential payload summary:
```json
{
  "plaintext_patch": {
    "json_path": "args.probe"
  },
  "ciphertext_length": 268,
  "ciphertext_sha256": "5a102da4cc5ed53c9d7fc1fa431dcb3c0711068d24cd8effaa1cadf75fa086fb"
}
```

On-chain request summary:
```json
{
  "request_type": "oracle",
  "requester": "0x6d0656f6dd91469db1c90cc1e574380613f43738",
  "callback_contract": "0x89b05cac00804648c666b47ecb1c57bc185821b7",
  "callback_method": "onOracleResult",
  "payload_sha256": "8daec4721111bac6bd154834f130adcbbc664cd5425b17373ba9a051ee2d4a83",
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
      "compose_hash": "13570eadd833160b3c59d3c6301eb1e640c6a0f18c0ce9b07098ab8832c2de61",
      "report_data": "88f6521f7268720b8d1a27c2c3c75df3007cd8698769e053fd3b0fa9183be8ae0000000000000000000000000000000000000000000000000000000000000000",
      "quote_hash": "fc7e2903c4e14dc8547199d55c858817eabfa0c7f2f87ced8fe955e40161fe05"
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
  "tee_compose_hash": "13570eadd833160b3c59d3c6301eb1e640c6a0f18c0ce9b07098ab8832c2de61"
}
```

### oracle_custom_url_encrypted_script

- Title: Privacy Oracle custom URL, encrypted params plus custom JS function
- Request type: `oracle`
- Txid: `0x8dcfb552b8a341c5d6c6c8c5c16768ccd9a1773e3706df71e26053fd0114b183`
- Request ID: `92`
- Expected: Encrypted custom script transforms the echoed probe into neo-morpheus-script.
- Actual: `"neo-morpheus-script"`

Public payload:
```json
{
  "url": "https://postman-echo.com/get?probe=neo-morpheus",
  "target_chain": "neo_n3",
  "encrypted_params": "eyJ2IjoyLCJhbGciOiJYMjU1MTktSEtERi1TSEEyNTYtQUVTLTI1Ni1HQ00iLCJlcGsiOiJXM21PMmtIUHp6UCtTZ29Vcll4cExKdDBQeitUdlpKU25MTHMybmFPZHlJPSIsIml2IjoiWnhEVHVBRmJPYWdEanVRKyIsImN0IjoiK1lJZGRsazVSQlNOMXV0ZkpuN3BLdXJBUXJVb01wbk1iOEY2UE1ncGp4K2hYTVlrZGc4M1ZqelpkYmxLQm1HMm5KOWUxZ014VDdlbEQ2VnB2TzRPYXFWbnowZlBsRnEvNWdaYVY4aktKWGRiZkJ2NUYwdGgxWDcyMWdISm1BYkdWb0h3NWc9PSIsInRhZyI6Ijgxd1pOZ0ZlRFpjUFltejlxUE8wbkE9PSJ9"
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
  "ciphertext_sha256": "96a357fe819f9b51680d83efb60ca803cfc94131c850bc248977e80177c7a424"
}
```

On-chain request summary:
```json
{
  "request_type": "oracle",
  "requester": "0x6d0656f6dd91469db1c90cc1e574380613f43738",
  "callback_contract": "0x89b05cac00804648c666b47ecb1c57bc185821b7",
  "callback_method": "onOracleResult",
  "payload_sha256": "602bac69797bf54d6d4e2cc78a0b4092f75ad309a2c2ca7950916d42380eb068",
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
      "compose_hash": "13570eadd833160b3c59d3c6301eb1e640c6a0f18c0ce9b07098ab8832c2de61",
      "report_data": "1678f84181e65b1c817365ae843eeaa81fc2e6282a7aad54546d6830e26587270000000000000000000000000000000000000000000000000000000000000000",
      "quote_hash": "237d39127945a30af0df1aa8650975c42f6bde80a61b8e18b222e6f1997fc94a"
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
  "tee_compose_hash": "13570eadd833160b3c59d3c6301eb1e640c6a0f18c0ce9b07098ab8832c2de61"
}
```

### provider_encrypted_script

- Title: Privacy Oracle builtin provider, encrypted params plus custom JS function
- Request type: `privacy_oracle`
- Txid: `0x6231a5c3a5e0d57792decde73d78a68fa9425b4f15944e3bf9f0c6236594de95`
- Request ID: `93`
- Expected: Encrypted custom function over builtin provider result returns true.
- Actual: `true`

Public payload:
```json
{
  "provider": "twelvedata",
  "symbol": "NEO-USD",
  "target_chain": "neo_n3",
  "encrypted_params": "eyJ2IjoyLCJhbGciOiJYMjU1MTktSEtERi1TSEEyNTYtQUVTLTI1Ni1HQ00iLCJlcGsiOiIvVlgxa3RTWXVwYi9yOTBiT1JnWnlsemRWVi82MFVMRjBKVG5NeXh4S3dFPSIsIml2IjoiMFRGOS9pNVhTQVZWeUFScSIsImN0IjoiQXB3OUFzTU1xbEcvM3ptYWZ0SFZCeHh0MG5Kdyt6NWs3MXFqMlhCRUhDOTEycS9kMVEwK1pQYUNtSTNVVVRnWENCRXc3ZHBIOW50YjQ3Szh6ZzhVVU1GSWZwMFZGaDdFd252YndYbUR5Y1RPL1l6bC9VTUlrMlFhIiwidGFnIjoiTUswZnVIL0h6T05JL28wdlhsN3lZUT09In0="
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
  "ciphertext_sha256": "fed4468fffe722cfe4fb116f2f512c074d4a1418edd347eb43a819ccb80e476a"
}
```

On-chain request summary:
```json
{
  "request_type": "privacy_oracle",
  "requester": "0x6d0656f6dd91469db1c90cc1e574380613f43738",
  "callback_contract": "0x89b05cac00804648c666b47ecb1c57bc185821b7",
  "callback_method": "onOracleResult",
  "payload_sha256": "9194787a0809590a134c739aad2c7f63299569d5c93969a78c265c65f160e8cb",
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
    "extracted_value": "2.488",
    "result": true
  },
  "verification": {
    "output_hash": "ce76181f1da187fc8e2e47d09db0f2bf226a2868b160e15729cb6d242b7dfbea",
    "attestation_hash": "ce76181f1da187fc8e2e47d09db0f2bf226a2868b160e15729cb6d242b7dfbea",
    "signature": "7762bbc841ac4ac86666fb48d89da521718079a0b051562e3ea80236f29191fb6813f5f232c479c206682ffdc38317caf292191d61c82b82e39f6f7864e01a60",
    "public_key": "03ca637032787820b38737090580c5e4013cbf34624b7d5510a36b92fb49d5b42a",
    "tee_attestation": {
      "app_id": "966f16610bdfe1794a503e16c5ae0bc69a1d92f1",
      "compose_hash": "13570eadd833160b3c59d3c6301eb1e640c6a0f18c0ce9b07098ab8832c2de61",
      "report_data": "ce76181f1da187fc8e2e47d09db0f2bf226a2868b160e15729cb6d242b7dfbea0000000000000000000000000000000000000000000000000000000000000000",
      "quote_hash": "e89d99e89218a127843db1d82001eb30584f8e679d62fc3e1c77874e9c88354f"
    }
  }
}
```

Verification summary:
```json
{
  "output_hash": "ce76181f1da187fc8e2e47d09db0f2bf226a2868b160e15729cb6d242b7dfbea",
  "attestation_hash": "ce76181f1da187fc8e2e47d09db0f2bf226a2868b160e15729cb6d242b7dfbea",
  "public_key": "03ca637032787820b38737090580c5e4013cbf34624b7d5510a36b92fb49d5b42a",
  "tee_app_id": "966f16610bdfe1794a503e16c5ae0bc69a1d92f1",
  "tee_compose_hash": "13570eadd833160b3c59d3c6301eb1e640c6a0f18c0ce9b07098ab8832c2de61"
}
```
