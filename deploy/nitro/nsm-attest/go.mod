// Pinned module graph for the NSM attestation helper so the EIF build is
// reproducible and the resulting PCRs are independently verifiable.
//
// REFRESH: to update the pinned `github.com/hf/nsm` version, run inside a Go
// toolchain (Go is intentionally NOT required on the host; the EIF build runs Go
// in the `golang:1.22-bookworm@sha256:...` stage):
//
//   cd deploy/nitro/nsm-attest
//   GOFLAGS=-mod=mod go get github.com/hf/nsm@<commit-or-pseudo-version>
//   go mod tidy
//
// then commit the regenerated go.mod + go.sum. The version below is the latest
// available (the module ships no semver tags, only this pseudo-version):
//   proxy.golang.org/github.com/hf/nsm/@latest -> v0.0.0-20220930140112-cd181bd646b9
module nsm-attest

go 1.22

require github.com/hf/nsm v0.0.0-20220930140112-cd181bd646b9

require (
	github.com/fxamacker/cbor/v2 v2.2.0 // indirect
	github.com/x448/float16 v0.8.4 // indirect
)
