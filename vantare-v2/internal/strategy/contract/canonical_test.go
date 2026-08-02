package contract

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
)

type canonicalCorpus struct {
	Algorithm string `json:"algorithm"`
	Cases     []struct {
		Name                 string `json:"name"`
		InputJSON            string `json:"inputJson"`
		Accepted             bool   `json:"accepted"`
		ExpectedCanonicalHex string `json:"expectedCanonicalHex"`
		ExpectedSHA256       string `json:"expectedSha256"`
	} `json:"cases"`
}

func TestCanonicalHashV1EnforcesSharedResourceLimits(t *testing.T) {
	tooDeep := strings.Repeat("[", MaxCanonicalDepth+1) + "0" + strings.Repeat("]", MaxCanonicalDepth+1)
	if _, _, err := CanonicalizeAndHashJSONV1([]byte(tooDeep)); err == nil {
		t.Fatal("expected depth limit rejection")
	}
	tooLarge := strings.Repeat(" ", MaxCanonicalJSONBytes+1)
	if _, _, err := CanonicalizeAndHashJSONV1([]byte(tooLarge)); err == nil {
		t.Fatal("expected input size limit rejection")
	}
}

func TestCanonicalHashV1DoesNotTreatStringBytesAsContainerItems(t *testing.T) {
	input := `{"text":"` + strings.Repeat("a", MaxCanonicalContainerItems+1) + `"}`
	if _, _, err := CanonicalizeAndHashJSONV1([]byte(input)); err != nil {
		t.Fatalf("string above container item limit must remain valid: %v", err)
	}
}

func TestCanonicalHashV1MatchesAdversarialCorpus(t *testing.T) {
	data, err := os.ReadFile("testdata/canonicalization_v1.json")
	if err != nil {
		t.Fatal(err)
	}
	var corpus canonicalCorpus
	if err := json.Unmarshal(data, &corpus); err != nil {
		t.Fatal(err)
	}
	if corpus.Algorithm != HashAlgorithmV1 {
		t.Fatalf("corpus algorithm = %q, want %q", corpus.Algorithm, HashAlgorithmV1)
	}
	for _, test := range corpus.Cases {
		t.Run(test.Name, func(t *testing.T) {
			canonical, got, err := CanonicalizeAndHashJSONV1([]byte(test.InputJSON))
			if !test.Accepted {
				if err == nil {
					t.Fatalf("expected rejection, got %s", got)
				}
				return
			}
			if err != nil {
				t.Fatalf("CanonicalizeAndHashJSONV1: %v", err)
			}
			encoded := EncodeCanonicalHex(canonical)
			if encoded != test.ExpectedCanonicalHex || got != test.ExpectedSHA256 {
				t.Fatalf("canonical = %s, want %s\nhash = %s, want %s", encoded, test.ExpectedCanonicalHex, got, test.ExpectedSHA256)
			}
		})
	}
}

func FuzzCanonicalHashV1IsDeterministic(f *testing.F) {
	f.Add(`{"b":2,"a":1}`)
	f.Add(`{"text":"A&B<C>D"}`)
	f.Add(`[-0,1.5,9007199254740991]`)
	f.Fuzz(func(t *testing.T, input string) {
		_, first, firstErr := CanonicalizeAndHashJSONV1([]byte(input))
		_, second, secondErr := CanonicalizeAndHashJSONV1([]byte(input))
		if (firstErr == nil) != (secondErr == nil) || first != second {
			t.Fatalf("non-deterministic result: (%q, %v) != (%q, %v)", first, firstErr, second, secondErr)
		}
	})
}
