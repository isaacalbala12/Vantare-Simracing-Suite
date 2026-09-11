package license

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"testing"
)

func tokenWithIdentityClaims(t *testing.T, claims map[string]string) string {
	t.Helper()
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"none"}`))
	payload, err := json.Marshal(claims)
	if err != nil {
		t.Fatal(err)
	}
	return header + "." + base64.RawURLEncoding.EncodeToString(payload) + ".signature"
}

func TestSessionSubjectRemainsInternalAccountUUID(t *testing.T) {
	for _, test := range []struct {
		name    string
		claims  map[string]string
		want    string
		wantErr error
	}{
		{
			name:    "Clerk subject is not the Vantare account",
			claims:  map[string]string{"sub": "user_2abc123"},
			wantErr: ErrMissingSession,
		},
		{
			name: "an unconsumed link claim cannot replace the subject",
			claims: map[string]string{
				"sub":        "user_2abc123",
				"account_id": testSubject,
			},
			wantErr: ErrMissingSession,
		},
		{
			name:   "Vantare account UUID remains the subject",
			claims: map[string]string{"sub": testSubject},
			want:   testSubject,
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			got, err := subjectFromJWT(tokenWithIdentityClaims(t, test.claims))
			if !errors.Is(err, test.wantErr) {
				t.Fatalf("subjectFromJWT() error = %v, want %v", err, test.wantErr)
			}
			if got != test.want {
				t.Fatalf("subjectFromJWT() = %q, want %q", got, test.want)
			}
		})
	}
}
