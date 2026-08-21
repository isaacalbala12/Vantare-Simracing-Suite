package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestInspectFileReportsSchemaAndNeverValues(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	path := filepath.Join(dir, expectedName)
	steamID := "7656119" + "1234567890"
	secretClaims := `{"uid":"private-user-id","exp":123456,"privateClaim":"private-value"}`
	secretToken := strings.Join([]string{
		base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"HS256"}`)),
		base64.RawURLEncoding.EncodeToString([]byte(secretClaims)),
		base64.RawURLEncoding.EncodeToString([]byte("secret-signature")),
	}, ".")
	body := `{"session":{"accessToken":"` + secretToken + `","steamId":"` + steamID + `"},"private-person-name":{"value":"never-print-me"}}`
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}

	got, err := inspectFile(path)
	if err != nil {
		t.Fatalf("inspectFile() error = %v", err)
	}
	encoded, err := json.Marshal(got)
	if err != nil {
		t.Fatal(err)
	}
	for _, forbidden := range []string{secretToken, "private-user-id", "privateClaim", "private-value", steamID, "private-person-name", "never-print-me"} {
		if bytes.Contains(encoded, []byte(forbidden)) {
			t.Fatalf("report leaked sensitive value %q: %s", forbidden, encoded)
		}
	}
	joined := strings.Join(got.Schema, "\n")
	for _, want := range []string{"session:object", "session.accesstoken:string", "session.steamid:string", "<field>:object", "<field>.value:string"} {
		if !strings.Contains(joined, want) {
			t.Errorf("schema missing %q: %s", want, joined)
		}
	}
	if got.SensitiveCandidates.JWTLike != 1 || got.SensitiveCandidates.SteamIDLike != 1 {
		t.Fatalf("candidate counts = %+v", got.SensitiveCandidates)
	}
	if len(got.JWTPayloadSchemas) != 1 || got.JWTPayloadSchemas[0].Count != 1 {
		t.Fatalf("JWT payload schemas = %+v", got.JWTPayloadSchemas)
	}
	if got.JWTExpiry.Expired != 1 || got.JWTExpiry.Unexpired != 0 || got.JWTExpiry.MissingOrInvalid != 0 {
		t.Fatalf("JWT expiry = %+v", got.JWTExpiry)
	}
	jwtJoined := strings.Join(got.JWTPayloadSchemas[0].Schema, "\n")
	for _, want := range []string{"exp:number", "uid:string", "<claim>:string"} {
		if !strings.Contains(jwtJoined, want) {
			t.Errorf("JWT schema missing %q: %s", want, jwtJoined)
		}
	}
}

func TestInspectFileRecursesIntoEncodedJSONWithoutEmittingIt(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	path := filepath.Join(dir, expectedName)
	nested := `{"token":"opaqueSecretValueThatMustNeverAppear123456789"}`
	body, err := json.Marshal(map[string]any{"localStorage": nested})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, body, 0o600); err != nil {
		t.Fatal(err)
	}

	got, err := inspectFile(path)
	if err != nil {
		t.Fatalf("inspectFile() error = %v", err)
	}
	encoded, err := json.Marshal(got)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(encoded, []byte("opaqueSecretValue")) {
		t.Fatalf("report leaked nested sensitive value: %s", encoded)
	}
	joined := strings.Join(got.Schema, "\n")
	if !strings.Contains(joined, "localstorage.<encoded-json>.token:string") {
		t.Fatalf("nested schema missing: %s", joined)
	}
}

func TestRunRequiresExplicitConsentBeforeReading(t *testing.T) {
	t.Parallel()

	var output bytes.Buffer
	err := run([]string{"-file", filepath.Join("does-not-exist", expectedName)}, &output)
	if err == nil || !strings.Contains(err.Error(), "confirm-sensitive-file") {
		t.Fatalf("run() error = %v, want consent failure", err)
	}
	if output.Len() != 0 {
		t.Fatalf("run() wrote output before consent: %q", output.String())
	}
}

func TestInspectFileRejectsUnexpectedNameAndSymlink(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	wrong := filepath.Join(dir, "other.json")
	if err := os.WriteFile(wrong, []byte(`{}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := inspectFile(wrong); err == nil || !strings.Contains(err.Error(), expectedName) {
		t.Fatalf("inspectFile(wrong name) error = %v", err)
	}

	target := filepath.Join(dir, "target.json")
	if err := os.WriteFile(target, []byte(`{"token":"secret"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(dir, expectedName)
	if err := os.Symlink(target, link); err != nil {
		t.Skipf("symlink unavailable: %v", err)
	}
	if _, err := inspectFile(link); err == nil || !strings.Contains(err.Error(), "symlink") {
		t.Fatalf("inspectFile(symlink) error = %v", err)
	}
}

func TestInspectFileRejectsTrailingDocumentWithoutOutput(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	path := filepath.Join(dir, expectedName)
	if err := os.WriteFile(path, []byte(`{"token":"first"} {"token":"second"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := inspectFile(path); err == nil || !strings.Contains(err.Error(), "more than one") {
		t.Fatalf("inspectFile() error = %v", err)
	}
}

func TestInspectFileRejectsOversizeInput(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	path := filepath.Join(dir, expectedName)
	if err := os.WriteFile(path, bytes.Repeat([]byte("x"), maxFileSize+1), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := inspectFile(path); err == nil || !strings.Contains(err.Error(), "size") {
		t.Fatalf("inspectFile() error = %v, want size rejection", err)
	}
}
