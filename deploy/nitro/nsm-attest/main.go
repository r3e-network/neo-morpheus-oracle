// nsm-attest: minimal AWS Nitro Security Module (NSM) attestation helper.
//
// Runs INSIDE the Nitro enclave. Opens /dev/nsm, requests an attestation
// document (COSE_Sign1, signed by the AWS Nitro Attestation PKI) optionally
// bound to a caller-supplied nonce, user data, and public key, and prints the
// document base64-encoded as JSON on stdout.
//
// Output: {"ok":true,"attestation_b64":"..."} or {"ok":false,"error":"..."}.
package main

import (
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"os"

	"github.com/hf/nsm"
	"github.com/hf/nsm/request"
)

func emit(v map[string]any, code int) {
	b, _ := json.Marshal(v)
	fmt.Println(string(b))
	os.Exit(code)
}

func fail(msg string) {
	emit(map[string]any{"ok": false, "error": msg}, 1)
}

func decodeHex(label, s string) []byte {
	if s == "" {
		return nil
	}
	b, err := hex.DecodeString(s)
	if err != nil {
		fail(fmt.Sprintf("invalid %s hex: %v", label, err))
	}
	return b
}

func main() {
	nonceHex := flag.String("nonce", "", "caller nonce (hex) for freshness")
	userDataHex := flag.String("user-data", "", "user data (hex) bound into the document")
	publicKeyHex := flag.String("public-key", "", "public key (hex) bound into the document")
	flag.Parse()

	nonce := decodeHex("nonce", *nonceHex)
	userData := decodeHex("user-data", *userDataHex)
	publicKey := decodeHex("public-key", *publicKeyHex)

	sess, err := nsm.OpenDefaultSession()
	if err != nil {
		fail(fmt.Sprintf("open /dev/nsm: %v (not running inside a Nitro enclave?)", err))
	}
	defer sess.Close()

	res, err := sess.Send(&request.Attestation{
		Nonce:     nonce,
		UserData:  userData,
		PublicKey: publicKey,
	})
	if err != nil {
		fail(fmt.Sprintf("nsm attestation request: %v", err))
	}
	if res.Error != "" {
		fail(fmt.Sprintf("nsm error code: %s", string(res.Error)))
	}
	if res.Attestation == nil || len(res.Attestation.Document) == 0 {
		fail("nsm returned an empty attestation document")
	}

	emit(map[string]any{
		"ok":              true,
		"attestation_b64": base64.StdEncoding.EncodeToString(res.Attestation.Document),
		"document_len":    len(res.Attestation.Document),
	}, 0)
}
