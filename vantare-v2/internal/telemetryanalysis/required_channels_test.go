package telemetryanalysis

import (
	"go/ast"
	"go/parser"
	"go/token"
	"slices"
	"strconv"
	"testing"
)

func TestRequiredHistoricalPageChannelsComeFromDerivationFamilies(t *testing.T) {
	t.Parallel()

	families := historicalPageChannelFamilies()
	wantFamilies := []string{"consumption_pace", "derived_curves", "lap_validity", "pit_observation"}
	gotFamilies := make([]string, 0, len(families))
	for family, channels := range families {
		gotFamilies = append(gotFamilies, family)
		if len(channels) == 0 {
			t.Fatalf("family %q declares no channels", family)
		}
	}
	slices.Sort(gotFamilies)
	if !slices.Equal(gotFamilies, wantFamilies) {
		t.Fatalf("families = %v, want %v", gotFamilies, wantFamilies)
	}

	declared := map[string]struct{}{}
	for _, channels := range families {
		for _, channel := range channels {
			declared[channel] = struct{}{}
		}
	}
	got := RequiredHistoricalPageChannels()
	if !slices.IsSorted(got) {
		t.Fatalf("required channels are not sorted: %v", got)
	}
	if len(got) != len(declared) {
		t.Fatalf("required channels = %v, family declarations = %v", got, declared)
	}
	for _, channel := range got {
		if _, ok := declared[channel]; !ok {
			t.Fatalf("required channel %q is not declared by a derivation family", channel)
		}
	}
}

func TestDerivationSourceCannotRequestAnUndeclaredHistoricalChannel(t *testing.T) {
	t.Parallel()

	files := map[string][]string{
		"consumptionpace.go": consumptionPaceHistoricalPageChannels(),
		"derivedcurves.go":   derivedCurvesHistoricalPageChannels(),
		"lapvalidity.go":     lapValidityHistoricalPageChannels(),
		"pitobserved.go":     pitObservationHistoricalPageChannels(),
	}
	for filename, declaredChannels := range files {
		declared := make(map[string]struct{}, len(declaredChannels))
		for _, channel := range declaredChannels {
			declared[channel] = struct{}{}
		}
		parsed, err := parser.ParseFile(token.NewFileSet(), filename, nil, 0)
		if err != nil {
			t.Fatalf("parse %s: %v", filename, err)
		}
		ast.Inspect(parsed, func(node ast.Node) bool {
			indexed, ok := node.(*ast.IndexExpr)
			if !ok {
				return true
			}
			identifier, ok := indexed.X.(*ast.Ident)
			literal, literalOK := indexed.Index.(*ast.BasicLit)
			if !ok || identifier.Name != "grouped" || !literalOK || literal.Kind != token.STRING {
				return true
			}
			channel, unquoteErr := strconv.Unquote(literal.Value)
			if unquoteErr != nil {
				t.Errorf("unquote %s channel %s: %v", filename, literal.Value, unquoteErr)
				return true
			}
			if _, declaredByFamily := declared[channel]; !declaredByFamily {
				t.Errorf("%s requests historical channel %q but its family does not declare it", filename, channel)
			}
			return true
		})
	}
}
