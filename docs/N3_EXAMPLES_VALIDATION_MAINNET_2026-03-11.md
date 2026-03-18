# Neo N3 Example Validation

Generated: 2026-03-11T08:31:18.399Z

## Environment

- Network: `mainnet`
- Consumer: `0x89b05cac00804648c666b47ecb1c57bc185821b7`
- Feed reader: `0x11e454261c21a32f1c9262472ca72a3156f9051f`
- Oracle: `0x017520f068fd602082fe5572596185e62a4ad991`
- Datafeed: `0x03013f49c42a14546c8bbe58f9d434c3517fccab`
- Request fee: `1000000`
- Request credit before run: `4000000`

## Case Matrix

| Case                       | Tx                                                                   | Request ID | Result           |
| -------------------------- | -------------------------------------------------------------------- | ---------- | ---------------- |
| provider_request           | `0x44041c38781f89abbf8ccbaceb6289c00ce23e858272b330fe72be1c6592ba5f` | `115`      | `"2.517"`        |
| compute_request            | `0xb39d14fd8b6fbc4f1adfd9c06de57f7ed83859c58e563088bb5f5081b5375e78` | `116`      | `{"value":"4"}`  |
| sponsored_provider_request | `0x7a9ad19ef845787e4039d25f445fde8773f0b0ce96575bf3d20e81a4adcbfce6` | `117`      | `"2.51"`         |
| custom_oracle_request      | `0x138715d83bf16ecddc3fc94a30c15ee09652f9f8e6fd579a239c72121e195e76` | `118`      | `"neo-morpheus"` |

## Provider Request

```json
{
  "txid": "0x44041c38781f89abbf8ccbaceb6289c00ce23e858272b330fe72be1c6592ba5f",
  "request_id": "115",
  "callback": {
    "request_type": "privacy_oracle",
    "success": true,
    "result_text": "{\"version\":\"morpheus-result/v1\",\"request_type\":\"privacy_oracle\",\"success\":true,\"result\":{\"mode\":\"fetch\",\"target_chain\":\"neo_n3\",\"request_source\":\"morpheus-relayer:neo_n3\",\"upstream_status\":200,\"extracted_value\":\"2.517\",\"result\":\"2.517\"},\"verification\":{\"output_hash\":\"bbd3adf3122374e0c6df2ae6623d3a8c0db472065ea62ea911a188abf340c7af\",\"attestation_hash\":\"bbd3adf3122374e0c6df2ae6623d3a8c0db472065ea62ea911a188abf340c7af\",\"signature\":\"44953122f2350adafaab3247f782b8ae47053a28bb8c3181e28d727582099e6e023d5fa7b910ff4573f8a5263e030896b042f606bee25c5e955efd77646f533f\",\"public_key\":\"03ca637032787820b38737090580c5e4013cbf34624b7d5510a36b92fb49d5b42a\",\"tee_attestation\":{\"app_id\":\"966f16610bdfe1794a503e16c5ae0bc69a1d92f1\",\"compose_hash\":\"0529396fc1e09cbb7b0078ef960a0d26d2cf4a04550378057702026de7423615\",\"report_data\":\"bbd3adf3122374e0c6df2ae6623d3a8c0db472065ea62ea911a188abf340c7af0000000000000000000000000000000000000000000000000000000000000000\",\"quote_hash\":\"c5753c1b1b9a535e25218534824ddd984d375ea93fa99ab1be5f28757ddc93b0\"}}}",
    "result_json": {
      "version": "morpheus-result/v1",
      "request_type": "privacy_oracle",
      "success": true,
      "result": {
        "mode": "fetch",
        "target_chain": "neo_n3",
        "request_source": "morpheus-relayer:neo_n3",
        "upstream_status": 200,
        "extracted_value": "2.517",
        "result": "2.517"
      },
      "verification": {
        "output_hash": "bbd3adf3122374e0c6df2ae6623d3a8c0db472065ea62ea911a188abf340c7af",
        "attestation_hash": "bbd3adf3122374e0c6df2ae6623d3a8c0db472065ea62ea911a188abf340c7af",
        "signature": "44953122f2350adafaab3247f782b8ae47053a28bb8c3181e28d727582099e6e023d5fa7b910ff4573f8a5263e030896b042f606bee25c5e955efd77646f533f",
        "public_key": "03ca637032787820b38737090580c5e4013cbf34624b7d5510a36b92fb49d5b42a",
        "tee_attestation": {
          "app_id": "966f16610bdfe1794a503e16c5ae0bc69a1d92f1",
          "compose_hash": "0529396fc1e09cbb7b0078ef960a0d26d2cf4a04550378057702026de7423615",
          "report_data": "bbd3adf3122374e0c6df2ae6623d3a8c0db472065ea62ea911a188abf340c7af0000000000000000000000000000000000000000000000000000000000000000",
          "quote_hash": "c5753c1b1b9a535e25218534824ddd984d375ea93fa99ab1be5f28757ddc93b0"
        }
      }
    },
    "error_text": ""
  }
}
```

## Compute Request

```json
{
  "txid": "0xb39d14fd8b6fbc4f1adfd9c06de57f7ed83859c58e563088bb5f5081b5375e78",
  "request_id": "116",
  "callback": {
    "request_type": "compute",
    "success": true,
    "result_text": "{\"version\":\"morpheus-result/v1\",\"request_type\":\"compute\",\"success\":true,\"result\":{\"mode\":\"builtin\",\"function\":\"math.modexp\",\"target_chain\":\"neo_n3\",\"result\":{\"value\":\"4\"}},\"verification\":{\"output_hash\":\"b0ddf9861e910df24dfde9742431d1b3ec9ba81a7570f3c3c715bec08040266d\",\"attestation_hash\":\"b0ddf9861e910df24dfde9742431d1b3ec9ba81a7570f3c3c715bec08040266d\",\"signature\":\"336696eee3d2b324125dc98bc366500380c944d877c67a68636a9a93d61d8702952ac4a971f49f71730796535b8821269fe45c2611c1d35577c6ba248b714ad7\",\"public_key\":\"03ca637032787820b38737090580c5e4013cbf34624b7d5510a36b92fb49d5b42a\",\"tee_attestation\":{\"app_id\":\"966f16610bdfe1794a503e16c5ae0bc69a1d92f1\",\"compose_hash\":\"0529396fc1e09cbb7b0078ef960a0d26d2cf4a04550378057702026de7423615\",\"report_data\":\"b0ddf9861e910df24dfde9742431d1b3ec9ba81a7570f3c3c715bec08040266d0000000000000000000000000000000000000000000000000000000000000000\",\"quote_hash\":\"cd229382c784c7e80ed0b4ebfc515fd77b4435d001e27a900a2156a0604a0a0d\"}}}",
    "result_json": {
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
          "quote_hash": "cd229382c784c7e80ed0b4ebfc515fd77b4435d001e27a900a2156a0604a0a0d"
        }
      }
    },
    "error_text": ""
  }
}
```

## Sponsored Provider Request

```json
{
  "txid": "0x7a9ad19ef845787e4039d25f445fde8773f0b0ce96575bf3d20e81a4adcbfce6",
  "request_id": "117",
  "callback": {
    "request_type": "privacy_oracle",
    "success": true,
    "result_text": "{\"version\":\"morpheus-result/v1\",\"request_type\":\"privacy_oracle\",\"success\":true,\"result\":{\"mode\":\"fetch\",\"target_chain\":\"neo_n3\",\"request_source\":\"morpheus-relayer:neo_n3\",\"upstream_status\":200,\"extracted_value\":\"2.51\",\"result\":\"2.51\"},\"verification\":{\"output_hash\":\"33ceecbc5c6aa779abc5de055c0dc9047b7ff011e13392f2f6ef79297fb8aa9e\",\"attestation_hash\":\"33ceecbc5c6aa779abc5de055c0dc9047b7ff011e13392f2f6ef79297fb8aa9e\",\"signature\":\"dbd0b7113a8c7174a5358c857aab11d3e1a09a0c8ffc8cb6ffb93819454494860fc48dbeac344967ac2337207f0383f74b939041dbe972d52829d215f00e4f34\",\"public_key\":\"03ca637032787820b38737090580c5e4013cbf34624b7d5510a36b92fb49d5b42a\",\"tee_attestation\":{\"app_id\":\"966f16610bdfe1794a503e16c5ae0bc69a1d92f1\",\"compose_hash\":\"0529396fc1e09cbb7b0078ef960a0d26d2cf4a04550378057702026de7423615\",\"report_data\":\"33ceecbc5c6aa779abc5de055c0dc9047b7ff011e13392f2f6ef79297fb8aa9e0000000000000000000000000000000000000000000000000000000000000000\",\"quote_hash\":\"338726bc7aeb8aa43dbe0ab9a78f9eee1453830c6793b72daea783409bfec35c\"}}}",
    "result_json": {
      "version": "morpheus-result/v1",
      "request_type": "privacy_oracle",
      "success": true,
      "result": {
        "mode": "fetch",
        "target_chain": "neo_n3",
        "request_source": "morpheus-relayer:neo_n3",
        "upstream_status": 200,
        "extracted_value": "2.51",
        "result": "2.51"
      },
      "verification": {
        "output_hash": "33ceecbc5c6aa779abc5de055c0dc9047b7ff011e13392f2f6ef79297fb8aa9e",
        "attestation_hash": "33ceecbc5c6aa779abc5de055c0dc9047b7ff011e13392f2f6ef79297fb8aa9e",
        "signature": "dbd0b7113a8c7174a5358c857aab11d3e1a09a0c8ffc8cb6ffb93819454494860fc48dbeac344967ac2337207f0383f74b939041dbe972d52829d215f00e4f34",
        "public_key": "03ca637032787820b38737090580c5e4013cbf34624b7d5510a36b92fb49d5b42a",
        "tee_attestation": {
          "app_id": "966f16610bdfe1794a503e16c5ae0bc69a1d92f1",
          "compose_hash": "0529396fc1e09cbb7b0078ef960a0d26d2cf4a04550378057702026de7423615",
          "report_data": "33ceecbc5c6aa779abc5de055c0dc9047b7ff011e13392f2f6ef79297fb8aa9e0000000000000000000000000000000000000000000000000000000000000000",
          "quote_hash": "338726bc7aeb8aa43dbe0ab9a78f9eee1453830c6793b72daea783409bfec35c"
        }
      }
    },
    "error_text": ""
  }
}
```

## Custom Oracle Request

```json
{
  "txid": "0x138715d83bf16ecddc3fc94a30c15ee09652f9f8e6fd579a239c72121e195e76",
  "request_id": "118",
  "callback": {
    "request_type": "oracle",
    "success": true,
    "result_text": "{\"version\":\"morpheus-result/v1\",\"request_type\":\"oracle\",\"success\":true,\"result\":{\"mode\":\"fetch\",\"target_chain\":\"neo_n3\",\"request_source\":\"morpheus-relayer:neo_n3\",\"upstream_status\":200,\"extracted_value\":\"neo-morpheus\",\"result\":\"neo-morpheus\"},\"verification\":{\"output_hash\":\"88f6521f7268720b8d1a27c2c3c75df3007cd8698769e053fd3b0fa9183be8ae\",\"attestation_hash\":\"88f6521f7268720b8d1a27c2c3c75df3007cd8698769e053fd3b0fa9183be8ae\",\"signature\":\"c4ada4730c986f9ba13fca516a4817a1326aeccc9c58382489b012a98a11c6daed4b97fc1f1447442fef1df35ab1421e713b8068470e132f445a64108b6d4605\",\"public_key\":\"03ca637032787820b38737090580c5e4013cbf34624b7d5510a36b92fb49d5b42a\",\"tee_attestation\":{\"app_id\":\"966f16610bdfe1794a503e16c5ae0bc69a1d92f1\",\"compose_hash\":\"0529396fc1e09cbb7b0078ef960a0d26d2cf4a04550378057702026de7423615\",\"report_data\":\"88f6521f7268720b8d1a27c2c3c75df3007cd8698769e053fd3b0fa9183be8ae0000000000000000000000000000000000000000000000000000000000000000\",\"quote_hash\":\"4eba0d48b67fbe905a7301ac2449fc6bb151d31f58c134a4f7eb16d89ba1037e\"}}}",
    "result_json": {
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
          "quote_hash": "4eba0d48b67fbe905a7301ac2449fc6bb151d31f58c134a4f7eb16d89ba1037e"
        }
      }
    },
    "error_text": ""
  }
}
```

## On-Chain Feed Snapshot

```json
{
  "pair": "TWELVEDATA:NEO-USD",
  "round_id": "1773053390",
  "price": "253",
  "timestamp": "1773158674",
  "attestation_hash": "0x7358c62a588d295f19b56833c2c57e736a04939688ad375c9b32ec12b2e3f2e9",
  "source_set_id": "1",
  "reader_pairs": [
    "TWELVEDATA:NEO-USD",
    "TWELVEDATA:GAS-USD",
    "TWELVEDATA:FLM-USD",
    "TWELVEDATA:BTC-USD",
    "TWELVEDATA:ETH-USD",
    "TWELVEDATA:SOL-USD",
    "TWELVEDATA:TRX-USD",
    "TWELVEDATA:PAXG-USD",
    "TWELVEDATA:WTI-USD",
    "TWELVEDATA:USDT-USD",
    "TWELVEDATA:USDC-USD",
    "TWELVEDATA:BNB-USD",
    "TWELVEDATA:XRP-USD",
    "TWELVEDATA:DOGE-USD"
  ]
}
```
