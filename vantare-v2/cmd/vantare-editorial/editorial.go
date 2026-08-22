package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"sort"
	"strconv"
	"strings"
)

func buildReport(summaryBytes []byte) ([]byte, error) {
	summary, err := decodeSummary(summaryBytes)
	if err != nil {
		return nil, err
	}
	production, err := productionSummary(summary)
	if err != nil {
		return nil, err
	}

	var report strings.Builder
	report.WriteString("# Informe editorial de Strategy\n\n")
	report.WriteString("Este documento es una proyección allowlisted del resumen determinista. No contiene tablas crudas, texto de terceros, identidades administrativas ni digests técnicos.\n\n")
	fmt.Fprintf(&report, "- Cohorte mínima: %d contribuidores\n", summary.MinimumCohort)
	report.WriteString("- Ranking: determinista y ya calculado por el curador.\n")
	fmt.Fprintf(&report, "- Entrada: %d aceptados, %d rechazados y %d duplicados semánticos\n", summary.Input.Accepted, summary.Input.Rejected, summary.Input.Duplicates)

	publishable := publishableCombinations(production, summary.MinimumCohort)
	suppressed := len(production.Combinations) - len(publishable)
	report.WriteString("\n## Producción publicable\n")
	if len(publishable) == 0 {
		report.WriteString("\nNo hay combinaciones que cumplan la cohorte mínima.\n")
	}
	for index, combination := range publishable {
		fmt.Fprintf(&report, "\n### Combinación %d\n\n", index+1)
		fmt.Fprintf(&report, "- Evidencia: %d contribuidores y %d bundles semánticos.\n", combination.Contributors, combination.SemanticBundles)
		writeReferenceReport(&report, combination.Reference)
		for _, strategy := range publishableStrategies(combination, summary.MinimumCohort) {
			fmt.Fprintf(&report, "\n#### Estrategia %d\n\n", strategy.Rank)
			fmt.Fprintf(&report, "- Plan observado: %d stints; paradas en vueltas %s; compuestos %s.\n", strategy.Representative.StintCount, joinInts(strategy.Representative.PitLaps), strings.Join(strategy.Representative.Compounds, " → "))
			fmt.Fprintf(&report, "- Evidencia: %d contribuidores y %d bundles semánticos.\n", strategy.Contributors, strategy.SemanticBundles)
			if strategy.Score.Available {
				fmt.Fprintf(&report, "- Ranking determinista: puesto %d; tiempo normalizado %s s; factible %s; gate de ranking %s.\n", strategy.Rank, formatNumber(strategy.Score.NormalizedTotalSeconds), yesNo(strategy.Score.Feasible), yesNo(strategy.Score.RankingPassed))
			} else {
				report.WriteString("- Ranking determinista: no disponible.\n")
			}
		}
	}
	fmt.Fprintf(&report, "\n## Contenido suprimido\n\n- Combinaciones de producción omitidas por cohorte o publicabilidad: %d.\n", suppressed)
	return []byte(report.String()), nil
}

func writeReferenceReport(report *strings.Builder, reference referenceProfileSummary) {
	if !reference.Publishable {
		report.WriteString("- Perfil de referencia: no disponible.\n")
		return
	}
	report.WriteString("- Perfil de referencia: disponible.\n")
	if reference.Fuel != nil {
		fmt.Fprintf(report, "  - Fuel/vuelta: mediana %s; rango %s–%s; muestra %d vueltas.\n", formatNumber(reference.Fuel.MedianPerLap), formatNumber(reference.Fuel.RangeLower), formatNumber(reference.Fuel.RangeUpper), reference.Fuel.SampleLaps)
	}
	if reference.VirtualEnergy != nil {
		fmt.Fprintf(report, "  - VE/vuelta: mediana %s; rango %s–%s; muestra %d vueltas.\n", formatNumber(reference.VirtualEnergy.MedianPerLap), formatNumber(reference.VirtualEnergy.RangeLower), formatNumber(reference.VirtualEnergy.RangeUpper), reference.VirtualEnergy.SampleLaps)
	}
	if reference.Pit != nil {
		fmt.Fprintf(report, "  - Pit: %d observaciones; duración típica %s s.\n", reference.Pit.Count, formatNumber(reference.Pit.TypicalDurationSeconds))
	}
	if reference.Quality != nil {
		fmt.Fprintf(report, "  - Calidad: %d/%d sesiones válidas (%s%%).\n", reference.Quality.ValidSessions, reference.Quality.SampleSessions, formatNumber(reference.Quality.ValidRatio*100))
	}
}

func buildDecisionTemplate(summaryBytes []byte) ([]byte, error) {
	summary, err := decodeSummary(summaryBytes)
	if err != nil {
		return nil, err
	}
	production, err := productionSummary(summary)
	if err != nil {
		return nil, err
	}
	decision := editorialDecision{
		ContractVersion: decisionVersion,
		SummaryDigest:   digest(summaryBytes),
		Items:           []decisionItem{},
	}
	for index, combination := range publishableCombinations(production, summary.MinimumCohort) {
		item := decisionItem{
			EditorialLabel:   fmt.Sprintf("combinación-%d", index+1),
			CombinationID:    combination.CombinationID,
			IncludeReference: false,
			Strategies:       []strategyDecision{},
		}
		for _, strategy := range publishableStrategies(combination, summary.MinimumCohort) {
			item.Strategies = append(item.Strategies, strategyDecision{Rank: strategy.Rank, Include: false})
		}
		decision.Items = append(decision.Items, item)
	}
	return marshalIndented(decision, "decision template")
}

func buildApprovedSelection(summaryBytes, decisionBytes []byte) ([]byte, error) {
	summary, err := decodeSummary(summaryBytes)
	if err != nil {
		return nil, err
	}
	if summary.MinimumCohort < minimumProductionK {
		return nil, fmt.Errorf("summary minimum cohort %d is below production k=%d", summary.MinimumCohort, minimumProductionK)
	}
	production, err := productionSummary(summary)
	if err != nil {
		return nil, err
	}
	var decision editorialDecision
	if err := strictDecode(decisionBytes, &decision); err != nil {
		return nil, fmt.Errorf("decode editorial decision: %w", err)
	}
	if decision.ContractVersion != decisionVersion {
		return nil, fmt.Errorf("unsupported editorial decision %q", decision.ContractVersion)
	}
	if decision.SummaryDigest != digest(summaryBytes) {
		return nil, fmt.Errorf("decision belongs to a different curator summary; copy and edit the current template")
	}

	byCombination := make(map[string]combinationSummary, len(production.Combinations))
	for _, combination := range production.Combinations {
		byCombination[combination.CombinationID] = combination
	}
	expectedLabels := make(map[string]string)
	for index, combination := range publishableCombinations(production, summary.MinimumCohort) {
		expectedLabels[combination.CombinationID] = fmt.Sprintf("combinación-%d", index+1)
	}
	selection := approvedSelection{ContractVersion: selectionVersion, Items: []selectionItem{}}
	seenCombinations := make(map[string]bool, len(decision.Items))
	for _, item := range decision.Items {
		if seenCombinations[item.CombinationID] {
			return nil, fmt.Errorf("combination %q appears more than once in the decision", item.CombinationID)
		}
		seenCombinations[item.CombinationID] = true
		combination, ok := byCombination[item.CombinationID]
		if !ok {
			return nil, fmt.Errorf("combination %q does not exist in production-community", item.CombinationID)
		}
		if !combination.Publishable || combination.Contributors < summary.MinimumCohort {
			return nil, fmt.Errorf("combination %q does not meet production k=%d", item.CombinationID, summary.MinimumCohort)
		}
		if item.EditorialLabel != expectedLabels[item.CombinationID] {
			return nil, fmt.Errorf("editorial label for %q changed; copy the current decision template", item.CombinationID)
		}
		selected := selectionItem{
			Environment:        productionEnvironment,
			CombinationID:      item.CombinationID,
			IncludeReference:   item.IncludeReference,
			StrategyClusterIDs: []string{},
		}
		if item.IncludeReference && (!combination.Reference.Publishable || combination.Reference.Quality == nil) {
			return nil, fmt.Errorf("reference profile for %q is not publishable", item.CombinationID)
		}
		strategiesByRank := make(map[int]strategyClusterSummary, len(combination.Strategies))
		for _, strategy := range combination.Strategies {
			strategiesByRank[strategy.Rank] = strategy
		}
		seenRanks := make(map[int]bool, len(item.Strategies))
		for _, choice := range item.Strategies {
			if seenRanks[choice.Rank] {
				return nil, fmt.Errorf("strategy rank %d appears more than once for %q", choice.Rank, item.CombinationID)
			}
			seenRanks[choice.Rank] = true
			strategy, ok := strategiesByRank[choice.Rank]
			if !ok {
				return nil, fmt.Errorf("strategy rank %d does not exist for %q", choice.Rank, item.CombinationID)
			}
			if !choice.Include {
				continue
			}
			if !strategy.Publishable || strategy.Contributors < summary.MinimumCohort {
				return nil, fmt.Errorf("strategy rank %d for %q does not meet production k=%d", choice.Rank, item.CombinationID, summary.MinimumCohort)
			}
			selected.StrategyClusterIDs = append(selected.StrategyClusterIDs, strategy.ClusterDigest)
		}
		if selected.IncludeReference || len(selected.StrategyClusterIDs) > 0 {
			sort.Strings(selected.StrategyClusterIDs)
			selection.Items = append(selection.Items, selected)
		}
	}
	if len(selection.Items) == 0 {
		return nil, fmt.Errorf("decision approves no content; mark at least one reference profile or strategy")
	}
	sort.Slice(selection.Items, func(i, j int) bool {
		return selection.Items[i].CombinationID < selection.Items[j].CombinationID
	})
	return marshalIndented(selection, "approved selection")
}

func decodeSummary(data []byte) (curatorSummary, error) {
	var summary curatorSummary
	if err := strictDecode(data, &summary); err != nil {
		return curatorSummary{}, fmt.Errorf("decode curator summary: %w", err)
	}
	if summary.ContractVersion != curatorSummaryVersion {
		return curatorSummary{}, fmt.Errorf("unsupported curator summary %q", summary.ContractVersion)
	}
	if summary.MinimumCohort <= 0 {
		return curatorSummary{}, fmt.Errorf("curator summary has invalid minimum cohort %d", summary.MinimumCohort)
	}
	return summary, nil
}

func productionSummary(summary curatorSummary) (environmentSummary, error) {
	var production *environmentSummary
	for index := range summary.Environments {
		if summary.Environments[index].Environment != productionEnvironment {
			continue
		}
		if production != nil {
			return environmentSummary{}, fmt.Errorf("curator summary contains production-community more than once")
		}
		production = &summary.Environments[index]
	}
	if production == nil {
		return environmentSummary{}, fmt.Errorf("curator summary does not contain production-community")
	}
	return *production, nil
}

func publishableCombinations(environment environmentSummary, minimumCohort int) []combinationSummary {
	var result []combinationSummary
	for _, combination := range environment.Combinations {
		if combination.Publishable && combination.Contributors >= maximum(minimumCohort, minimumProductionK) {
			result = append(result, combination)
		}
	}
	sort.Slice(result, func(i, j int) bool { return result[i].CombinationID < result[j].CombinationID })
	return result
}

func publishableStrategies(combination combinationSummary, minimumCohort int) []strategyClusterSummary {
	var result []strategyClusterSummary
	for _, strategy := range combination.Strategies {
		if strategy.Publishable && strategy.Contributors >= maximum(minimumCohort, minimumProductionK) {
			result = append(result, strategy)
		}
	}
	sort.Slice(result, func(i, j int) bool { return result[i].Rank < result[j].Rank })
	return result
}

func strictDecode(data []byte, destination any) error {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(destination); err != nil {
		return err
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		if err == nil {
			return fmt.Errorf("multiple JSON values")
		}
		return err
	}
	return nil
}

func marshalIndented(value any, description string) ([]byte, error) {
	encoded, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("encode %s: %w", description, err)
	}
	return append(encoded, '\n'), nil
}

func digest(data []byte) string {
	sum := sha256.Sum256(data)
	return "sha256:" + hex.EncodeToString(sum[:])
}

func formatNumber(value float64) string {
	rounded := math.Round(value*1000) / 1000
	return strconv.FormatFloat(rounded, 'f', -1, 64)
}

func joinInts(values []int) string {
	if len(values) == 0 {
		return "ninguna"
	}
	parts := make([]string, len(values))
	for index, value := range values {
		parts[index] = strconv.Itoa(value)
	}
	return strings.Join(parts, ", ")
}

func yesNo(value bool) string {
	if value {
		return "sí"
	}
	return "no"
}

func maximum(left, right int) int {
	if left > right {
		return left
	}
	return right
}
