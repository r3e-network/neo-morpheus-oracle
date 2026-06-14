#!/usr/bin/env bash
# Build the MERGED Morpheus Oracle compute+sign enclave image (EIF) AND capture
# its measurements (PCR0/1/2) into a committed, versioned manifest so the
# attestation verifier has a pinned source of truth.
#
# Derived from build-nitro-signer-eif.sh, with three additions required by the
# design (§4):
#   1. Uses Dockerfile.enclave (the merged image), not Dockerfile.signer.
#   2. Captures `nitro-cli build-enclave` Measurements JSON into
#      deploy/nitro/measurements/<release>.json and FAILS if PCRs are empty.
#   3. Optional --verify-reproducible: builds the docker image TWICE and asserts
#      identical image IDs (the reproducibility gate; PCRs are meaningless if the
#      image is not reproducible).
#
# Env / flags:
#   MORPHEUS_NITRO_IMAGE   docker tag for the enclave image (default morpheus-oracle-enclave:latest)
#   MORPHEUS_NITRO_EIF     output .eif path (default /opt/morpheus/nitro/morpheus-oracle.eif)
#   NITRO_CLI_ARTIFACTS    nitro-cli artifacts dir (default /opt/morpheus/nitro/artifacts)
#   NITRO_CLI_BLOBS        nitro-cli blobs dir (default /usr/share/nitro_enclaves/blobs)
#   MORPHEUS_RELEASE       release id for the manifest (default oracle-<UTC date>)
#   MORPHEUS_NETWORK       network label for the manifest (default testnet)
#   --verify-reproducible  build the docker image twice and require identical IDs
#   --no-eif               build (and optionally verify) the docker image only;
#                          skip nitro-cli build-enclave (for boxes without it)
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
image="${MORPHEUS_NITRO_IMAGE:-morpheus-oracle-enclave:latest}"
output="${MORPHEUS_NITRO_EIF:-/opt/morpheus/nitro/morpheus-oracle.eif}"
artifacts="${NITRO_CLI_ARTIFACTS:-/opt/morpheus/nitro/artifacts}"
blobs="${NITRO_CLI_BLOBS:-/usr/share/nitro_enclaves/blobs}"
network="${MORPHEUS_NETWORK:-testnet}"
release="${MORPHEUS_RELEASE:-oracle-$(date -u +%Y-%m-%d)}"
dockerfile="$repo_root/deploy/nitro/Dockerfile.enclave"
measurements_dir="$repo_root/deploy/nitro/measurements"
manifest="$measurements_dir/${release}.json"

verify_reproducible=0
build_eif=1
for arg in "$@"; do
  case "$arg" in
    --verify-reproducible) verify_reproducible=1 ;;
    --no-eif) build_eif=0 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

git_commit="$(git -C "$repo_root" rev-parse HEAD 2>/dev/null || echo unknown)"

echo "==> building enclave image $image from $dockerfile"
# SOURCE_DATE_EPOCH is also set in the Dockerfile; pass it through for any
# builder that honors it at the layer level.
DOCKER_BUILDKIT=1 SOURCE_DATE_EPOCH="${SOURCE_DATE_EPOCH:-1749859200}" \
  docker build -f "$dockerfile" -t "$image" "$repo_root"

image_id_1="$(docker image inspect --format '{{.Id}}' "$image")"
echo "==> image id: $image_id_1"

if [ "$verify_reproducible" -eq 1 ]; then
  echo "==> reproducibility check: rebuilding to a second tag"
  image2="${image%:*}:repro-check"
  DOCKER_BUILDKIT=1 SOURCE_DATE_EPOCH="${SOURCE_DATE_EPOCH:-1749859200}" \
    docker build -f "$dockerfile" -t "$image2" "$repo_root"
  image_id_2="$(docker image inspect --format '{{.Id}}' "$image2")"
  echo "    build #1 id: $image_id_1"
  echo "    build #2 id: $image_id_2"
  if [ "$image_id_1" != "$image_id_2" ]; then
    echo "ERROR: image is NOT reproducible (image IDs differ)" >&2
    echo "       PCRs derived from a non-reproducible image are not independently verifiable." >&2
    exit 1
  fi
  echo "    OK: identical image IDs -> reproducible docker build"
  docker image rm "$image2" >/dev/null 2>&1 || true
fi

if [ "$build_eif" -eq 0 ]; then
  echo "==> --no-eif: skipping nitro-cli build-enclave + manifest capture"
  exit 0
fi

mkdir -p "$(dirname "$output")" "$artifacts" "$measurements_dir"
export NITRO_CLI_ARTIFACTS="$artifacts"
export NITRO_CLI_BLOBS="$blobs"

echo "==> nitro-cli build-enclave -> $output"
# build-enclave prints a JSON object with a "Measurements" field
# ({HashAlgorithm, PCR0, PCR1, PCR2}). Capture stdout to derive the manifest.
build_output="$(nitro-cli build-enclave --docker-uri "$image" --output-file "$output")"
echo "$build_output"

# Extract PCRs from the build-enclave JSON. node is present on the box (it runs
# the worker); use it for robust JSON parsing rather than fragile grep.
pcr0="$(printf '%s' "$build_output" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);process.stdout.write((j.Measurements&&j.Measurements.PCR0)||"")}catch(e){process.stdout.write("")}})')"
pcr1="$(printf '%s' "$build_output" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);process.stdout.write((j.Measurements&&j.Measurements.PCR1)||"")}catch(e){process.stdout.write("")}})')"
pcr2="$(printf '%s' "$build_output" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);process.stdout.write((j.Measurements&&j.Measurements.PCR2)||"")}catch(e){process.stdout.write("")}})')"
hash_algo="$(printf '%s' "$build_output" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);process.stdout.write((j.Measurements&&j.Measurements.HashAlgorithm)||"SHA384")}catch(e){process.stdout.write("SHA384")}})')"

# FAIL if PCRs are empty (a manifest with empty PCRs is worse than none — it
# would make the verifier accept anything or fail confusingly).
if [ -z "$pcr0" ] || [ -z "$pcr1" ] || [ -z "$pcr2" ]; then
  echo "ERROR: nitro-cli build-enclave returned empty PCR(s)" >&2
  echo "       PCR0='$pcr0' PCR1='$pcr1' PCR2='$pcr2'" >&2
  echo "       refusing to write an empty measurements manifest." >&2
  exit 1
fi

eif_sha256=""
if [ -f "$output" ]; then
  eif_sha256="$(sha256sum "$output" 2>/dev/null | awk '{print $1}' || shasum -a 256 "$output" 2>/dev/null | awk '{print $1}')"
fi

built_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

echo "==> writing manifest $manifest"
RELEASE="$release" APP_ID="morpheus-oracle" NETWORK="$network" \
GIT_COMMIT="$git_commit" EIF_SHA256="$eif_sha256" HASH_ALGO="$hash_algo" \
PCR0="$pcr0" PCR1="$pcr1" PCR2="$pcr2" BUILT_AT="$built_at" IMAGE_ID="$image_id_1" \
node -e '
const fs = require("node:fs");
const m = {
  release: process.env.RELEASE,
  app_id: process.env.APP_ID,
  network: process.env.NETWORK,
  git_commit: process.env.GIT_COMMIT,
  image_id: process.env.IMAGE_ID,
  eif_sha256: process.env.EIF_SHA256 || null,
  hash_algorithm: process.env.HASH_ALGO || "SHA384",
  pcr0: process.env.PCR0,
  pcr1: process.env.PCR1,
  pcr2: process.env.PCR2,
  built_at: process.env.BUILT_AT,
};
fs.writeFileSync(process.argv[1], JSON.stringify(m, null, 2) + "\n");
' "$manifest"

echo "==> measurements captured:"
cat "$manifest"
echo
echo "==> DONE. Commit $manifest (review the PCRs) and ship it to the verifier."
