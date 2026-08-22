package main

import (
	"crypto/ed25519"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/vantare/overlays/v2/internal/strategy/catalog"
)

func runSign(args []string, stderr io.Writer) error {
	flags := flag.NewFlagSet("vantare-catalog sign", flag.ContinueOnError)
	flags.SetOutput(stderr)
	inputPath := flags.String("in", "", "catálogo sin firmar ya revisado")
	outputPath := flags.String("out", "", "ruta del catálogo firmado")
	privateKeyPath := flags.String("private-key-file", "", "fichero offline con seed Ed25519 hexadecimal")
	keyID := flags.String("key-id", "", "identificador público de la clave")
	if err := flags.Parse(args); err != nil {
		return fmt.Errorf("parse sign flags: %w", err)
	}
	if err := requireNoPositionals(flags); err != nil {
		return err
	}
	if *inputPath == "" || *outputPath == "" || *privateKeyPath == "" || *keyID == "" {
		return fmt.Errorf("--in, --out, --private-key-file and --key-id are required")
	}
	unsignedBytes, err := os.ReadFile(*inputPath)
	if err != nil {
		return fmt.Errorf("read unsigned catalog: %w", err)
	}
	seedBytes, err := os.ReadFile(*privateKeyPath)
	if err != nil {
		return fmt.Errorf("read private key file: %w", err)
	}
	encoded, err := signUnsigned(unsignedBytes, seedBytes, *keyID)
	if err != nil {
		return err
	}
	if err := os.WriteFile(*outputPath, encoded, 0o644); err != nil {
		return fmt.Errorf("write signed catalog: %w", err)
	}
	return nil
}

func signUnsigned(unsignedBytes, seedBytes []byte, keyID string) ([]byte, error) {
	if strings.TrimSpace(keyID) == "" {
		return nil, fmt.Errorf("keyId required")
	}
	var unsigned unsignedCatalog
	if err := strictDecode(unsignedBytes, &unsigned); err != nil {
		return nil, fmt.Errorf("decode unsigned catalog: %w", err)
	}
	payloadBytes, err := json.Marshal(unsigned.Payload)
	if err != nil {
		return nil, fmt.Errorf("encode reviewed payload: %w", err)
	}
	digest, err := catalog.PayloadDigestFor(payloadBytes)
	if err != nil {
		return nil, fmt.Errorf("digest reviewed payload: %w", err)
	}
	if digest != unsigned.Envelope.PayloadDigest {
		return nil, fmt.Errorf("reviewed payload digest does not match envelope")
	}
	seed, err := hex.DecodeString(strings.TrimSpace(string(seedBytes)))
	if err != nil {
		return nil, fmt.Errorf("decode private key seed: %w", err)
	}
	if len(seed) != ed25519.SeedSize {
		return nil, fmt.Errorf("private key file must contain exactly %d seed bytes", ed25519.SeedSize)
	}
	privateKey := ed25519.NewKeyFromSeed(seed)
	signature, err := catalog.SignEnvelope(privateKey, unsigned.Envelope)
	if err != nil {
		return nil, fmt.Errorf("sign envelope: %w", err)
	}
	signed := catalog.SignedCatalog{
		Envelope: unsigned.Envelope, Payload: payloadBytes, Signature: signature, KeyID: keyID,
	}
	publicKey := privateKey.Public().(ed25519.PublicKey)
	if err := catalog.VerifySignedCatalog(catalog.VerificationInput{
		Signed: signed, TrustedKeys: map[string]ed25519.PublicKey{unsigned.Envelope.KeyEpoch: publicKey},
		MinEpoch: unsigned.Envelope.KeyEpoch, MinVersion: unsigned.Envelope.Version,
		SeenEpoch: unsigned.Envelope.KeyEpoch, SeenVersion: unsigned.Envelope.Version,
		Now: unsigned.Envelope.PublishedAt,
	}); err != nil {
		return nil, fmt.Errorf("verify signed catalog round trip: %w", err)
	}
	encoded, err := json.Marshal(signed)
	if err != nil {
		return nil, fmt.Errorf("encode signed catalog: %w", err)
	}
	return encoded, nil
}
