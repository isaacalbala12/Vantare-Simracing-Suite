package service_test

import (
	"go/parser"
	"go/token"
	"strconv"
	"strings"
	"testing"
)

func TestEngineerServiceHasNoLiveOrSyntheticTelemetrySource(t *testing.T) {
	tree, err := parser.ParseFile(token.NewFileSet(), "engineer_service.go", nil, parser.ImportsOnly)
	if err != nil {
		t.Fatal(err)
	}
	for _, imported := range tree.Imports {
		path, err := strconv.Unquote(imported.Path.Value)
		if err != nil {
			t.Fatal(err)
		}
		for _, forbidden := range []string{
			"/internal/engineer/simulator",
			"/internal/engineer/replay",
			"/internal/engineer/telemetry/service",
			"/internal/engineer/lmu",
		} {
			if strings.HasSuffix(path, forbidden) {
				t.Fatalf("EngineerService imports forbidden source package %q", path)
			}
		}
	}
}
