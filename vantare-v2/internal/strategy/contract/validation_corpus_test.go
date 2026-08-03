package contract

import (
	"encoding/json"
	"os"
	"testing"
)

type validationCorpus struct {
	Hashes     []validationCase `json:"hashes"`
	Timestamps []validationCase `json:"timestamps"`
}

type validationCase struct {
	Name     string `json:"name"`
	Value    string `json:"value"`
	Accepted bool   `json:"accepted"`
}

func TestSharedValidationCorpus(t *testing.T) {
	data, err := os.ReadFile("testdata/validation_v1.json")
	if err != nil {
		t.Fatal(err)
	}
	var corpus validationCorpus
	if err := json.Unmarshal(data, &corpus); err != nil {
		t.Fatal(err)
	}
	for _, test := range corpus.Hashes {
		t.Run("hash/"+test.Name, func(t *testing.T) {
			err := validateContentHash("contentHash", test.Value)
			if (err == nil) != test.Accepted {
				t.Fatalf("accepted = %v, want %v, err = %v", err == nil, test.Accepted, err)
			}
		})
	}
	for _, test := range corpus.Timestamps {
		t.Run("timestamp/"+test.Name, func(t *testing.T) {
			_, err := parseCanonicalTimestamp("timestamp", test.Value)
			if (err == nil) != test.Accepted {
				t.Fatalf("accepted = %v, want %v, err = %v", err == nil, test.Accepted, err)
			}
		})
	}
}
