package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestBuildReportIsDeterministicAndAllowlisted(t *testing.T) {
	summary := readSummaryFixture(t)
	first, err := buildReport(summary)
	if err != nil {
		t.Fatalf("first report: %v", err)
	}
	second, err := buildReport(summary)
	if err != nil {
		t.Fatalf("second report: %v", err)
	}
	if !bytes.Equal(first, second) {
		t.Fatal("same summary produced different report bytes")
	}
	for _, expected := range []string{"### Combinación 1", "#### Estrategia 1", "4 contribuidores", "Cohorte mínima: 3"} {
		if !bytes.Contains(first, []byte(expected)) {
			t.Fatalf("report does not contain %q:\n%s", expected, first)
		}
	}
	for _, forbidden := range []string{
		"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		"sourceHash", "sourceRef", "rejections", "spa-lmgt3", "test-only", "controlled-only", "lemans-hyper",
	} {
		if bytes.Contains(first, []byte(forbidden)) {
			t.Fatalf("report exposes forbidden value %q:\n%s", forbidden, first)
		}
	}
}

func TestDecisionTemplateStartsClosedAndContainsNoClusterDigests(t *testing.T) {
	template, err := buildDecisionTemplate(readSummaryFixture(t))
	if err != nil {
		t.Fatalf("build template: %v", err)
	}
	var decision editorialDecision
	if err := strictDecode(template, &decision); err != nil {
		t.Fatalf("decode template: %v", err)
	}
	if decision.ContractVersion != decisionVersion || len(decision.Items) != 1 {
		t.Fatalf("decision = %+v", decision)
	}
	item := decision.Items[0]
	if item.EditorialLabel != "combinación-1" || item.CombinationID != "spa-lmgt3" || item.IncludeReference || len(item.Strategies) != 1 || item.Strategies[0].Include {
		t.Fatalf("template is not fail-closed: %+v", item)
	}
	if bytes.Contains(template, []byte("bbbbbbbbbbbbbbbb")) {
		t.Fatalf("template exposes cluster digest: %s", template)
	}
}

func TestBuildApprovedSelectionResolvesRanksForCatalog(t *testing.T) {
	summary := readSummaryFixture(t)
	template, err := buildDecisionTemplate(summary)
	if err != nil {
		t.Fatalf("build template: %v", err)
	}
	var decision editorialDecision
	if err := strictDecode(template, &decision); err != nil {
		t.Fatalf("decode template: %v", err)
	}
	decision.Items[0].IncludeReference = true
	decision.Items[0].Strategies[0].Include = true
	approvedDecision, err := json.Marshal(decision)
	if err != nil {
		t.Fatalf("encode decision: %v", err)
	}

	selectionBytes, err := buildApprovedSelection(summary, approvedDecision)
	if err != nil {
		t.Fatalf("build selection: %v", err)
	}
	var selection approvedSelection
	if err := strictDecode(selectionBytes, &selection); err != nil {
		t.Fatalf("decode selection: %v", err)
	}
	if selection.ContractVersion != selectionVersion || len(selection.Items) != 1 {
		t.Fatalf("selection = %+v", selection)
	}
	item := selection.Items[0]
	if item.Environment != productionEnvironment || item.CombinationID != "spa-lmgt3" || !item.IncludeReference ||
		len(item.StrategyClusterIDs) != 1 || !strings.HasPrefix(item.StrategyClusterIDs[0], "bbbbbbbb") {
		t.Fatalf("selection item = %+v", item)
	}
}

func TestBuildApprovedSelectionRejectsUnsafeDecisions(t *testing.T) {
	summary := readSummaryFixture(t)
	template, err := buildDecisionTemplate(summary)
	if err != nil {
		t.Fatalf("build template: %v", err)
	}
	var baseline editorialDecision
	if err := strictDecode(template, &baseline); err != nil {
		t.Fatalf("decode template: %v", err)
	}
	tests := []struct {
		name   string
		mutate func(*editorialDecision)
		want   string
	}{
		{name: "empty approval", mutate: func(*editorialDecision) {}, want: "approves no content"},
		{name: "stale summary", mutate: func(value *editorialDecision) { value.SummaryDigest = "sha256:stale" }, want: "different curator summary"},
		{name: "unknown combination", mutate: func(value *editorialDecision) {
			value.Items[0].CombinationID = "unknown"
			value.Items[0].IncludeReference = true
		}, want: "does not exist in production-community"},
		{name: "unknown rank", mutate: func(value *editorialDecision) {
			value.Items[0].Strategies[0] = strategyDecision{Rank: 99, Include: true}
		}, want: "does not exist"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			value := baseline
			value.Items = append([]decisionItem(nil), baseline.Items...)
			value.Items[0].Strategies = append([]strategyDecision(nil), baseline.Items[0].Strategies...)
			test.mutate(&value)
			encoded, err := json.Marshal(value)
			if err != nil {
				t.Fatalf("encode decision: %v", err)
			}
			_, err = buildApprovedSelection(summary, encoded)
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("error = %v, want %q", err, test.want)
			}
		})
	}
}

func readSummaryFixture(t *testing.T) []byte {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("..", "vantare-catalog", "testdata", "curator-summary-v2.json"))
	if err != nil {
		t.Fatalf("read summary fixture: %v", err)
	}
	return data
}
