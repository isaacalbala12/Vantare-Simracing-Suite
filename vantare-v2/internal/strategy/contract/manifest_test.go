package contract

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"
)

func TestContractManifestMatchesCommittedCrossLanguageFixture(t *testing.T) {
	wantJSON, err := os.ReadFile("testdata/contract_manifest_v1.json")
	if err != nil {
		t.Fatalf("read manifest fixture: %v", err)
	}
	var want ContractManifest
	if err := json.Unmarshal(wantJSON, &want); err != nil {
		t.Fatalf("decode manifest fixture: %v", err)
	}
	got := ManifestV1()
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("contract manifest drifted\ngot:  %#v\nwant: %#v", got, want)
	}
}
