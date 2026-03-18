# Mainnet Privacy Validation

Generated: 2026-03-11T03:24:07.789Z

## Environment

- Network: `mainnet`
- Chain: `neo_n3`
- Oracle: `0x017520f068fd602082fe5572596185e62a4ad991`
- Example consumer (custom contract): `0x89b05cac00804648c666b47ecb1c57bc185821b7`
- Request fee: `1000000`
- Total deposited during run: `7000000`
- Remaining fee credit after run: `0`

## Case Matrix

| Case                               | Request Type   | Tx                                                                   | Request ID | Result                  | Pass |
| ---------------------------------- | -------------- | -------------------------------------------------------------------- | ---------- | ----------------------- | ---- |
| provider_plain                     | privacy_oracle | `0x4fb49cff2356fa7b0bb378c294aa0eeac1ddc07b5791ebe7b4c36bd4223bc984` | `108`      | `"2.503"`               | yes  |
| provider_encrypted_params          | privacy_oracle | `0xb23f818efa9a792ecda0e5ee7c6fdea6cbbe2b63a8d2e0462e8227e900dde9cc` | `109`      | `"2.503"`               | yes  |
| compute_builtin_encrypted          | compute        | `0x6785367384bba7f398a9cdcf3170c702df7cb5b67dbac8d781397bd773d10f85` | `110`      | `{"value":"4"}`         | yes  |
| compute_custom_script_encrypted    | compute        | `0xb4ba994236103643d7610ca7b9b7366ee134c65d87fc09fe0ad89603bff0ad14` | `111`      | `42`                    | yes  |
| oracle_custom_url_encrypted_params | oracle         | `0x731f9061e56509a795082f4575cf1636bb1c902d628b75186ff6d7e12feed956` | `112`      | `"neo-morpheus"`        | yes  |
| oracle_custom_url_encrypted_script | oracle         | `0x57b9618406863a1ed15c6e660900228c40ed695d3dff8de9807b2894171c2d7e` | `113`      | `"neo-morpheus-script"` | yes  |
| provider_encrypted_script          | privacy_oracle | `0x4393b903844d51822f28192937652bcc0eb63d400824f3b9bfb34a9e24045d83` | `114`      | `true`                  | yes  |

## Detailed Results

### provider_plain

- Title: Privacy Oracle builtin provider, public params
- Request type: `privacy_oracle`
- Txid: `0x4fb49cff2356fa7b0bb378c294aa0eeac1ddc07b5791ebe7b4c36bd4223bc984`
- Request ID: `108`
- Expected: Extracted value is a non-empty NEO/USD price string.
- Actual: `"2.503"`

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
    "extracted_value": "2.503",
    "result": "2.503"
  },
  "verification": {
    "output_hash": "dc7a9aaf9d98631cd40e41469a4bd6967e10816a216509e1ba426973b0b9a49a",
    "attestation_hash": "dc7a9aaf9d98631cd40e41469a4bd6967e10816a216509e1ba426973b0b9a49a",
    "signature": "c5604f9f744f519bbda66e01095dc0c91c508dca27e2bb5c85fa4beae7c3aadcddb71a516cd319a72f2b8ae5c2a7a01eddabc8ac8274628f724d6f6bc95007af",
    "public_key": "03ca637032787820b38737090580c5e4013cbf34624b7d5510a36b92fb49d5b42a",
    "tee_attestation": {
      "app_id": "966f16610bdfe1794a503e16c5ae0bc69a1d92f1",
      "compose_hash": "0529396fc1e09cbb7b0078ef960a0d26d2cf4a04550378057702026de7423615",
      "report_data": "dc7a9aaf9d98631cd40e41469a4bd6967e10816a216509e1ba426973b0b9a49a0000000000000000000000000000000000000000000000000000000000000000",
      "quote_hash": "b84f5b16e1f9842ab637592653192a369e073157992e998657e14df87386b743"
    }
  }
}
```

Verification summary:

```json
{
  "output_hash": "dc7a9aaf9d98631cd40e41469a4bd6967e10816a216509e1ba426973b0b9a49a",
  "attestation_hash": "dc7a9aaf9d98631cd40e41469a4bd6967e10816a216509e1ba426973b0b9a49a",
  "public_key": "03ca637032787820b38737090580c5e4013cbf34624b7d5510a36b92fb49d5b42a",
  "tee_app_id": "966f16610bdfe1794a503e16c5ae0bc69a1d92f1",
  "tee_compose_hash": "0529396fc1e09cbb7b0078ef960a0d26d2cf4a04550378057702026de7423615"
}
```

### provider_encrypted_params

- Title: Privacy Oracle builtin provider, encrypted params in user tx
- Request type: `privacy_oracle`
- Txid: `0xb23f818efa9a792ecda0e5ee7c6fdea6cbbe2b63a8d2e0462e8227e900dde9cc`
- Request ID: `109`
- Expected: Encrypted json_path is merged inside TEE and returns a price string.
- Actual: `"2.503"`

Public payload:

```json
{
  "provider": "twelvedata",
  "symbol": "NEO-USD",
  "target_chain": "neo_n3",
  "encrypted_params": "eyJ2IjoyLCJhbGciOiJYMjU1MTktSEtERi1TSEEyNTYtQUVTLTI1Ni1HQ00iLCJlcGsiOiI0T3NnRmFMRUc3a0o2ZmNqU1JzWHZjTXdUMkRrcVRoeVFmRlQwbndLc2dFPSIsIml2IjoiU2MydlVTUzF3M3dhcmVuKyIsImN0IjoiRUlZTTdsazFjeFlMeDhWVVdxb1dhY0RRNzF1USIsInRhZyI6IlhxTjBNMnI5NnJYb1JjM1ZGTnZiaGc9PSJ9"
}
```

Confidential payload summary:

```json
{
  "plaintext_patch": {
    "json_path": "price"
  },
  "ciphertext_length": 256,
  "ciphertext_sha256": "31d49eb76074e118507b6285d6b41a38e06427b043dfdd16420d1d5e34950368"
}
```

On-chain request summary:

```json
{
  "request_type": "privacy_oracle",
  "requester": "0x6d0656f6dd91469db1c90cc1e574380613f43738",
  "callback_contract": "0x89b05cac00804648c666b47ecb1c57bc185821b7",
  "callback_method": "onOracleResult",
  "payload_sha256": "6f235a5f1ecd4fa6ba730b9dd2a3e42b8dbb8a3af7e865b1799241919dd1e846",
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
    "extracted_value": "2.503",
    "result": "2.503"
  },
  "verification": {
    "output_hash": "dc7a9aaf9d98631cd40e41469a4bd6967e10816a216509e1ba426973b0b9a49a",
    "attestation_hash": "dc7a9aaf9d98631cd40e41469a4bd6967e10816a216509e1ba426973b0b9a49a",
    "signature": "c5604f9f744f519bbda66e01095dc0c91c508dca27e2bb5c85fa4beae7c3aadcddb71a516cd319a72f2b8ae5c2a7a01eddabc8ac8274628f724d6f6bc95007af",
    "public_key": "03ca637032787820b38737090580c5e4013cbf34624b7d5510a36b92fb49d5b42a",
    "tee_attestation": {
      "app_id": "966f16610bdfe1794a503e16c5ae0bc69a1d92f1",
      "compose_hash": "0529396fc1e09cbb7b0078ef960a0d26d2cf4a04550378057702026de7423615",
      "report_data": "dc7a9aaf9d98631cd40e41469a4bd6967e10816a216509e1ba426973b0b9a49a0000000000000000000000000000000000000000000000000000000000000000",
      "quote_hash": "5e82c95c7c484009e07a56eae9782abab3a98853a80e3b2b136cc390a1f957c1"
    }
  }
}
```

Verification summary:

```json
{
  "output_hash": "dc7a9aaf9d98631cd40e41469a4bd6967e10816a216509e1ba426973b0b9a49a",
  "attestation_hash": "dc7a9aaf9d98631cd40e41469a4bd6967e10816a216509e1ba426973b0b9a49a",
  "public_key": "03ca637032787820b38737090580c5e4013cbf34624b7d5510a36b92fb49d5b42a",
  "tee_app_id": "966f16610bdfe1794a503e16c5ae0bc69a1d92f1",
  "tee_compose_hash": "0529396fc1e09cbb7b0078ef960a0d26d2cf4a04550378057702026de7423615"
}
```

### compute_builtin_encrypted

- Title: Privacy Compute builtin function, encrypted payload
- Request type: `compute`
- Txid: `0x6785367384bba7f398a9cdcf3170c702df7cb5b67dbac8d781397bd773d10f85`
- Request ID: `110`
- Expected: math.modexp returns 4.
- Actual: `{"value":"4"}`

Public payload:

```json
{
  "encrypted_payload": "eyJ2IjoyLCJhbGciOiJYMjU1MTktSEtERi1TSEEyNTYtQUVTLTI1Ni1HQ00iLCJlcGsiOiJkQjEwWHNoZ3FNdnV4MzFlWnhFakZtYTJzeXJHdXBrZXRMN1c4d0RtVFFnPSIsIml2IjoiUUV3NDNTRmlXVTVISzdyRyIsImN0IjoieTdoQlRCVGI0dXBDUEVBckxsUWVHUGlVQ3lQQzBRWnR2eHpzZmFxaDRlR1NqRHRPOUhORUNQVDNuQWc5ZU5GaUFtdmFTQUc1bXBoazlpR3lpV2RTU2pyZldGZTBUKzJuQUJXOFY0ejRzV1hVUDI3dytOYzZUMzVVZU9SVzV6UzdCR0owOENIMTFCcXYyY0daSVVSd20wYlNldkFkTUpBPSIsInRhZyI6IjJpWVNOV1B3eEJUUjVqcU5NNFY4d3c9PSJ9"
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
  "ciphertext_sha256": "27245fca1bc82a4ab1a2cec392a1afe990b8f359ba9194df2f4594f9c2064248"
}
```

On-chain request summary:

```json
{
  "request_type": "compute",
  "requester": "0x6d0656f6dd91469db1c90cc1e574380613f43738",
  "callback_contract": "0x89b05cac00804648c666b47ecb1c57bc185821b7",
  "callback_method": "onOracleResult",
  "payload_sha256": "a598018d5f3379dc4d68c39a8f7be42558d316c64eed6fcfc59e20b11742620f",
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
      "compose_hash": "0529396fc1e09cbb7b0078ef960a0d26d2cf4a04550378057702026de7423615",
      "report_data": "b0ddf9861e910df24dfde9742431d1b3ec9ba81a7570f3c3c715bec08040266d0000000000000000000000000000000000000000000000000000000000000000",
      "quote_hash": "bddf9130ff970a33769feeecc239c7f4355677d17ae25a2bfdff5454140582b4"
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
  "tee_compose_hash": "0529396fc1e09cbb7b0078ef960a0d26d2cf4a04550378057702026de7423615"
}
```

### compute_custom_script_encrypted

- Title: Privacy Compute custom JS function, encrypted payload
- Request type: `compute`
- Txid: `0xb4ba994236103643d7610ca7b9b7366ee134c65d87fc09fe0ad89603bff0ad14`
- Request ID: `111`
- Expected: Encrypted custom compute function returns 42.
- Actual: `42`

Public payload:

```json
{
  "encrypted_payload": "eyJ2IjoyLCJhbGciOiJYMjU1MTktSEtERi1TSEEyNTYtQUVTLTI1Ni1HQ00iLCJlcGsiOiI0TE11UFhpYSsyYUJsSGpKTTVnZm5MRTlhN0ZxWXkxTDFLcVlMa2U3NlhZPSIsIml2IjoiZHVIS0hXOGE5dDFJaDczLyIsImN0IjoiZWg1OHM4aHpqbjZQdmovVkNROFVQSEJqbmJYTHF2Q1dDRHZxcUNBdVlUeGNXazkybFM2cXFsMEYwcTN3VDFJOVJheHBlZmpsUVdxVXdGMmFPb1NIWWI3TkZ3b2JJVlFhWlMvN1cvNW0rb3lvLzY3SWJpQk1SYTFuQWpWOXVvVmpyUTNiWDVhcm1uNm0vOWNVdEo1Y2pPUCtLdE1XME51anVZczAwbnI5SGtkOXJUb3RSc2VkRnR1NnV1bjBkaUhGZ2JUbGQvQS9ORmJZTVEwU2hKYURGQT09IiwidGFnIjoibUc1cVYyVENwK2NIQkJlbDlMOHVUZz09In0="
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
  "ciphertext_sha256": "6775b3f3a584c835b80906376595dcde674e986f9f3efad5859b1c0f0c423aad"
}
```

On-chain request summary:

```json
{
  "request_type": "compute",
  "requester": "0x6d0656f6dd91469db1c90cc1e574380613f43738",
  "callback_contract": "0x89b05cac00804648c666b47ecb1c57bc185821b7",
  "callback_method": "onOracleResult",
  "payload_sha256": "b273c0c33f2d4291f76f630379df7492d939c9187c1a4a211ee6a9380920cf8d",
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
      "compose_hash": "0529396fc1e09cbb7b0078ef960a0d26d2cf4a04550378057702026de7423615",
      "report_data": "b0f4393fd875178eef7c76663f79aaa92c960088a999036c310cb10915df920e0000000000000000000000000000000000000000000000000000000000000000",
      "quote_hash": "242ce2d74be5b4e23ece9c342f3f17d48be8d9b720dd3931f64764006fd72eb4"
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
  "tee_compose_hash": "0529396fc1e09cbb7b0078ef960a0d26d2cf4a04550378057702026de7423615"
}
```

### oracle_custom_url_encrypted_params

- Title: Privacy Oracle custom URL, encrypted params
- Request type: `oracle`
- Txid: `0x731f9061e56509a795082f4575cf1636bb1c902d628b75186ff6d7e12feed956`
- Request ID: `112`
- Expected: Custom URL flow returns the echoed probe string.
- Actual: `"neo-morpheus"`

Public payload:

```json
{
  "url": "https://postman-echo.com/get?probe=neo-morpheus",
  "target_chain": "neo_n3",
  "encrypted_params": "eyJ2IjoyLCJhbGciOiJYMjU1MTktSEtERi1TSEEyNTYtQUVTLTI1Ni1HQ00iLCJlcGsiOiIrUnUwWjJORUExUEc4MllZWXRVUmVURDdKaGdmWTFiWm1vQ1cySSt5M3hNPSIsIml2IjoiV0FBUHNDWm5tRjN3bHZGTyIsImN0IjoiL1ZnV1NuQWNVa1BRSHNSSzBRNGxlNnoyTmdCbFVMOXB3U1U9IiwidGFnIjoid1RZVWl2YWRrdTBXSUJCNEtSYWFhQT09In0="
}
```

Confidential payload summary:

```json
{
  "plaintext_patch": {
    "json_path": "args.probe"
  },
  "ciphertext_length": 268,
  "ciphertext_sha256": "44dfb5ae323a5857c8d714aecbb03a6bd9b821a4947678002ce3bbf6b969b56b"
}
```

On-chain request summary:

```json
{
  "request_type": "oracle",
  "requester": "0x6d0656f6dd91469db1c90cc1e574380613f43738",
  "callback_contract": "0x89b05cac00804648c666b47ecb1c57bc185821b7",
  "callback_method": "onOracleResult",
  "payload_sha256": "7402fd1c164a8ad4ee242805ebd6b3e3eb17de40836155a0f0a7b20e4d6ee54e",
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
      "compose_hash": "0529396fc1e09cbb7b0078ef960a0d26d2cf4a04550378057702026de7423615",
      "report_data": "88f6521f7268720b8d1a27c2c3c75df3007cd8698769e053fd3b0fa9183be8ae0000000000000000000000000000000000000000000000000000000000000000",
      "quote_hash": "4a8513297161904d9284fca2b29c4b164bc340f546a091e70adab02cb9daef2a"
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
  "tee_compose_hash": "0529396fc1e09cbb7b0078ef960a0d26d2cf4a04550378057702026de7423615"
}
```

### oracle_custom_url_encrypted_script

- Title: Privacy Oracle custom URL, encrypted params plus custom JS function
- Request type: `oracle`
- Txid: `0x57b9618406863a1ed15c6e660900228c40ed695d3dff8de9807b2894171c2d7e`
- Request ID: `113`
- Expected: Encrypted custom script transforms the echoed probe into neo-morpheus-script.
- Actual: `"neo-morpheus-script"`

Public payload:

```json
{
  "url": "https://postman-echo.com/get?probe=neo-morpheus",
  "target_chain": "neo_n3",
  "encrypted_params": "eyJ2IjoyLCJhbGciOiJYMjU1MTktSEtERi1TSEEyNTYtQUVTLTI1Ni1HQ00iLCJlcGsiOiJXcUxBQzlGU1VmRjB4czB0b2VBT3pqSmk1OWIyL3RBVFJnQVBqVStqZzI4PSIsIml2IjoiLytXUjlNRjl0YjZGODlnRSIsImN0IjoiVHBraXFRQnJGQ2FqYWI3WXBTdEhmcGU5UHIxYUZRblRxY3VvQ09iUmdWbVZXemZUZVRXZ2d5d2xKZy9DR3o0c1R2NWdXV2d6amlncEdGNHc3MW52MXpDajV2NkJzTkJlOGRXVGhldDZHMEY2M1hKa1Ria3R3WXorVXVzN1VaWEFBMEZNSEE9PSIsInRhZyI6ImxHQ0tLUUF5K3JlOXROWDZSTmxITmc9PSJ9"
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
  "ciphertext_sha256": "b0c74abdabd523e0c2dd777be5b4efd139ef22468c1c63d71f809d32feea436d"
}
```

On-chain request summary:

```json
{
  "request_type": "oracle",
  "requester": "0x6d0656f6dd91469db1c90cc1e574380613f43738",
  "callback_contract": "0x89b05cac00804648c666b47ecb1c57bc185821b7",
  "callback_method": "onOracleResult",
  "payload_sha256": "c3cdf916ee20a8c58a200bc175cd9105406ad6dcbddd44085e15c4653f704d74",
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
      "compose_hash": "0529396fc1e09cbb7b0078ef960a0d26d2cf4a04550378057702026de7423615",
      "report_data": "1678f84181e65b1c817365ae843eeaa81fc2e6282a7aad54546d6830e26587270000000000000000000000000000000000000000000000000000000000000000",
      "quote_hash": "9777700f1445769bb5126109e38bbc1b264356c543beb1c1a5986751a4091732"
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
  "tee_compose_hash": "0529396fc1e09cbb7b0078ef960a0d26d2cf4a04550378057702026de7423615"
}
```

### provider_encrypted_script

- Title: Privacy Oracle builtin provider, encrypted params plus custom JS function
- Request type: `privacy_oracle`
- Txid: `0x4393b903844d51822f28192937652bcc0eb63d400824f3b9bfb34a9e24045d83`
- Request ID: `114`
- Expected: Encrypted custom function over builtin provider result returns true.
- Actual: `true`

Public payload:

```json
{
  "provider": "twelvedata",
  "symbol": "NEO-USD",
  "target_chain": "neo_n3",
  "encrypted_params": "eyJ2IjoyLCJhbGciOiJYMjU1MTktSEtERi1TSEEyNTYtQUVTLTI1Ni1HQ00iLCJlcGsiOiJ5UkxIL3JmaGR4OU5mR3pKalRKQnRXbFlvYm5Ndlh3eGRLVmxhZGh6YTNRPSIsIml2IjoiRDB1WFZiSTdwbmNhcTRVdiIsImN0IjoicFBrT1l3cFdpVSsyaDM2SUZHODhmbGZwRjBIZnpTUEpqVjAwaDM0czJlSEFaTTY0ak9uVVZYV2taYUpJaGptQm1LN0FpeUNUL05WUGhvbHNmdmVKQmwwdEVWMUx6U0hyTm9BNUl6dE8xYUFsU3FQM0s4UlFjT1BPIiwidGFnIjoiL3A3cVlQZmhncjMvMFJWTE14a0R1UT09In0="
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
  "ciphertext_sha256": "9149f9eb9cd252c6bca5911da390ccf29052d0fa9f5f61e67175c8bf7bd57b4e"
}
```

On-chain request summary:

```json
{
  "request_type": "privacy_oracle",
  "requester": "0x6d0656f6dd91469db1c90cc1e574380613f43738",
  "callback_contract": "0x89b05cac00804648c666b47ecb1c57bc185821b7",
  "callback_method": "onOracleResult",
  "payload_sha256": "c058cbbb976f7edc467aaa5a3bb960fd1f0f404d836c2d7a7f65a273b0051e08",
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
    "extracted_value": "2.499",
    "result": true
  },
  "verification": {
    "output_hash": "6d95bd7bfc7a79cc1e015cd494e370454f8a93f6602bd36bf783a6045cb85da8",
    "attestation_hash": "6d95bd7bfc7a79cc1e015cd494e370454f8a93f6602bd36bf783a6045cb85da8",
    "signature": "7cd1aee89b60a3058fe63b80fb3b0ff5934c966f19d8ec8e3a1efdfde2432b6eafa080f6138544c313351e27994d66eaf09f58a437fa2e4ed5f1acfdef46a81a",
    "public_key": "03ca637032787820b38737090580c5e4013cbf34624b7d5510a36b92fb49d5b42a",
    "tee_attestation": {
      "app_id": "966f16610bdfe1794a503e16c5ae0bc69a1d92f1",
      "compose_hash": "0529396fc1e09cbb7b0078ef960a0d26d2cf4a04550378057702026de7423615",
      "report_data": "6d95bd7bfc7a79cc1e015cd494e370454f8a93f6602bd36bf783a6045cb85da80000000000000000000000000000000000000000000000000000000000000000",
      "quote_hash": "88a60caf0c55f1dd978e037fbbf5b50bfba90a334a56637a9b2719b73e0b6530"
    }
  }
}
```

Verification summary:

```json
{
  "output_hash": "6d95bd7bfc7a79cc1e015cd494e370454f8a93f6602bd36bf783a6045cb85da8",
  "attestation_hash": "6d95bd7bfc7a79cc1e015cd494e370454f8a93f6602bd36bf783a6045cb85da8",
  "public_key": "03ca637032787820b38737090580c5e4013cbf34624b7d5510a36b92fb49d5b42a",
  "tee_app_id": "966f16610bdfe1794a503e16c5ae0bc69a1d92f1",
  "tee_compose_hash": "0529396fc1e09cbb7b0078ef960a0d26d2cf4a04550378057702026de7423615"
}
```
