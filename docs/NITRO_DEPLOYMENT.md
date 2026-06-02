# AWS Nitro signer deployment

This runbook moves mainnet request fulfillment signing out of the host and into
an AWS Nitro Enclave. The host relayer talks only to `127.0.0.1:8787`; that port
is a vsock proxy into the enclave.

## Files

- `deploy/nitro/nitro-signer-server.mjs` implements `/health`, `/keys/derived`,
  and `/sign/payload` for pinned Neo N3 roles.
- `deploy/nitro/Dockerfile.signer` builds the enclave image.
- `deploy/nitro/build-nitro-signer-eif.sh` builds the EIF on the Nitro host.
- `deploy/nitro/start-nitro-signer.sh` runs the enclave and local vsock proxy.
- `deploy/systemd/morpheus-nitro-signer.service` owns enclave lifecycle.
- `deploy/systemd/morpheus-relayer-nitro.service` starts the relayer against the
  local Nitro signer.

## Secret rendering

Run from the repo root:

```bash
npm run render:nitro-env -- --network mainnet --output-dir .secrets/nitro
```

The renderer reads `.env`, `.env.local`, `deploy/phala/morpheus.mainnet.env`,
`deploy/phala/morpheus.hub.env`, and the historical workspace secret export. It
refuses to render unless the mainnet `updater` and `oracle_verifier` secrets
match `config/signer-identities.json`.

The generated files are local-only plaintext inputs for KMS sealing:

- `.secrets/nitro/morpheus-nitro-signer.env`
- `.secrets/nitro/morpheus-relayer.env`

Copy only `morpheus-relayer.env` to the parent host. Do not copy plaintext
`morpheus-nitro-signer.env` into a normal host service. Nitro CLI does not
support `--env-file`; signer material must be encrypted with KMS and made
available to the enclave as ciphertext that only the enclave PCR policy can
decrypt.

## Host install

```bash
sudo dnf install -y docker jq socat aws-nitro-enclaves-cli aws-nitro-enclaves-cli-devel
sudo systemctl enable --now docker nitro-enclaves-allocator
sudo install -d -m 0700 /opt/morpheus/nitro
sudo cp deploy/systemd/morpheus-nitro-signer.service /etc/systemd/system/
sudo cp deploy/systemd/morpheus-relayer-nitro.service /etc/systemd/system/
sudo deploy/nitro/build-nitro-signer-eif.sh
sudo systemctl daemon-reload
sudo systemctl enable --now morpheus-nitro-signer
curl -fsS http://127.0.0.1:8787/health
sudo systemctl enable --now morpheus-relayer-nitro
```

## Safety

Do not set `MORPHEUS_ALLOW_UNPINNED_SIGNERS=true` for mainnet. If the renderer
cannot find the pinned updater/verifier material, stop and recover the correct
signer or perform an explicit on-chain role rotation.
