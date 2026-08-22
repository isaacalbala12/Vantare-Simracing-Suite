package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/vantare/overlays/v2/internal/strategy/catalog"
)

var errNotPublishable = errors.New("content is not publishable")

type buildMetadata struct {
	CatalogID       string
	Channel         string
	KeyEpoch        string
	Version         uint64
	PreviousVersion uint64
	PublishedAt     time.Time
	ExpiresAt       time.Time
}

func runBuild(args []string, stderr io.Writer) error {
	flags := flag.NewFlagSet("vantare-catalog build", flag.ContinueOnError)
	flags.SetOutput(stderr)
	summaryPath := flags.String("summary", "", "resumen determinista de vantare-curator")
	selectionPath := flags.String("selection", "", "selección aprobada por Isaac")
	outputPath := flags.String("out", "", "ruta del catálogo sin firmar")
	catalogID := flags.String("catalog-id", "vantare-strategy", "identificador del catálogo")
	channel := flags.String("channel", "stable", "canal del catálogo")
	keyEpoch := flags.String("key-epoch", "", "época de clave aprobada")
	version := flags.Uint64("version", 0, "versión monotónica dentro de la época")
	previousVersion := flags.Uint64("previous-version", 0, "última versión publicada en la época, o 0 para la primera")
	publishedAtText := flags.String("published-at", "", "fecha UTC RFC3339 revisada")
	expiresAtText := flags.String("expires-at", "", "expiración UTC RFC3339")
	if err := flags.Parse(args); err != nil {
		return fmt.Errorf("parse build flags: %w", err)
	}
	if err := requireNoPositionals(flags); err != nil {
		return err
	}
	if *summaryPath == "" || *selectionPath == "" || *outputPath == "" || *keyEpoch == "" || *publishedAtText == "" || *expiresAtText == "" {
		return fmt.Errorf("--summary, --selection, --out, --key-epoch, --published-at and --expires-at are required")
	}
	publishedAt, err := time.Parse(time.RFC3339, *publishedAtText)
	if err != nil {
		return fmt.Errorf("parse --published-at: %w", err)
	}
	expiresAt, err := time.Parse(time.RFC3339, *expiresAtText)
	if err != nil {
		return fmt.Errorf("parse --expires-at: %w", err)
	}
	summaryBytes, err := os.ReadFile(*summaryPath)
	if err != nil {
		return fmt.Errorf("read curator summary: %w", err)
	}
	selectionBytes, err := os.ReadFile(*selectionPath)
	if err != nil {
		return fmt.Errorf("read approved selection: %w", err)
	}
	encoded, err := buildUnsigned(summaryBytes, selectionBytes, buildMetadata{
		CatalogID: *catalogID, Channel: *channel, KeyEpoch: *keyEpoch, Version: *version,
		PreviousVersion: *previousVersion, PublishedAt: publishedAt, ExpiresAt: expiresAt,
	})
	if err != nil {
		return err
	}
	if err := os.WriteFile(*outputPath, encoded, 0o644); err != nil {
		return fmt.Errorf("write unsigned catalog: %w", err)
	}
	return nil
}

func buildUnsigned(summaryBytes, selectionBytes []byte, metadata buildMetadata) ([]byte, error) {
	if metadata.Version <= metadata.PreviousVersion {
		return nil, fmt.Errorf("version %d must be greater than previous version %d", metadata.Version, metadata.PreviousVersion)
	}
	var summary curatorSummary
	if err := strictDecode(summaryBytes, &summary); err != nil {
		return nil, fmt.Errorf("decode curator summary: %w", err)
	}
	if summary.ContractVersion != curatorSummaryVersion {
		return nil, fmt.Errorf("unsupported curator summary %q", summary.ContractVersion)
	}
	if summary.MinimumCohort < minimumProductionK {
		return nil, fmt.Errorf("%w: summary minimum cohort %d is below production k=%d", errNotPublishable, summary.MinimumCohort, minimumProductionK)
	}
	if strings.TrimSpace(summary.Engine.Version) == "" || strings.TrimSpace(summary.Engine.SourceHash) == "" {
		return nil, fmt.Errorf("curator summary engine version and source hash are required")
	}
	var selection approvedSelection
	if err := strictDecode(selectionBytes, &selection); err != nil {
		return nil, fmt.Errorf("decode approved selection: %w", err)
	}
	if selection.ContractVersion != selectionVersion {
		return nil, fmt.Errorf("unsupported selection %q", selection.ContractVersion)
	}
	if len(selection.Items) == 0 {
		return nil, fmt.Errorf("approved selection is empty")
	}

	production, err := productionSummary(summary.Environments)
	if err != nil {
		return nil, err
	}
	items := append([]selectionItem(nil), selection.Items...)
	sort.Slice(items, func(i, j int) bool { return items[i].CombinationID < items[j].CombinationID })
	combinations := make([]catalogCombination, 0, len(items))
	seen := make(map[string]bool, len(items))
	for _, item := range items {
		if item.Environment != productionEnvironment {
			return nil, fmt.Errorf("%w: environment %q can never enter a production catalog", errNotPublishable, item.Environment)
		}
		if strings.TrimSpace(item.CombinationID) == "" || seen[item.CombinationID] {
			return nil, fmt.Errorf("invalid or duplicate selected combination %q", item.CombinationID)
		}
		seen[item.CombinationID] = true
		if !item.IncludeReference && len(item.StrategyClusterIDs) == 0 {
			return nil, fmt.Errorf("selection %q contains no approved content", item.CombinationID)
		}
		combination, ok := findCombination(production.Combinations, item.CombinationID)
		if !ok || !combination.Publishable || combination.Contributors < summary.MinimumCohort {
			return nil, fmt.Errorf("%w: combination %q does not meet k=%d", errNotPublishable, item.CombinationID, summary.MinimumCohort)
		}
		built, err := buildCombination(combination, item, summary.MinimumCohort)
		if err != nil {
			return nil, err
		}
		combinations = append(combinations, built)
	}

	summaryDigest, err := catalog.PayloadDigestFor(summaryBytes)
	if err != nil {
		return nil, fmt.Errorf("digest curator summary: %w", err)
	}
	payload := catalogPayload{
		ContractVersion: payloadVersion,
		Source: catalogSource{
			SummaryContractVersion: summary.ContractVersion, SummaryDigest: summaryDigest,
			EngineVersion: summary.Engine.Version, EngineSourceHash: summary.Engine.SourceHash,
			MinimumCohort: summary.MinimumCohort,
		},
		Combinations: combinations,
	}
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("encode catalog payload: %w", err)
	}
	payloadDigest, err := catalog.PayloadDigestFor(payloadBytes)
	if err != nil {
		return nil, fmt.Errorf("digest catalog payload: %w", err)
	}
	envelope := catalog.Envelope{
		Domain: catalog.DomainV1, CatalogID: metadata.CatalogID, Channel: metadata.Channel,
		SchemaID: catalog.SchemaIDV1, SchemaVersion: catalog.SchemaVersionV1,
		KeyEpoch: metadata.KeyEpoch, Version: metadata.Version, PublishedAt: metadata.PublishedAt,
		ExpiresAt: metadata.ExpiresAt, PayloadDigest: payloadDigest,
	}
	if err := envelope.Validate(); err != nil {
		return nil, fmt.Errorf("validate unsigned envelope: %w", err)
	}
	encoded, err := json.Marshal(unsignedCatalog{Envelope: envelope, Payload: payload})
	if err != nil {
		return nil, fmt.Errorf("encode unsigned catalog: %w", err)
	}
	return encoded, nil
}

func productionSummary(environments []environmentSummary) (environmentSummary, error) {
	var result environmentSummary
	found := false
	for _, environment := range environments {
		if environment.Environment != productionEnvironment {
			continue
		}
		if found {
			return environmentSummary{}, fmt.Errorf("duplicate %q environment", productionEnvironment)
		}
		result, found = environment, true
	}
	if !found {
		return environmentSummary{}, fmt.Errorf("production environment not found")
	}
	seen := make(map[string]bool, len(result.Combinations))
	for _, combination := range result.Combinations {
		if strings.TrimSpace(combination.CombinationID) == "" || seen[combination.CombinationID] {
			return environmentSummary{}, fmt.Errorf("invalid or duplicate production combination %q", combination.CombinationID)
		}
		seen[combination.CombinationID] = true
	}
	return result, nil
}

func findCombination(combinations []combinationSummary, id string) (combinationSummary, bool) {
	for _, combination := range combinations {
		if combination.CombinationID == id {
			return combination, true
		}
	}
	return combinationSummary{}, false
}

func buildCombination(source combinationSummary, selection selectionItem, minimumCohort int) (catalogCombination, error) {
	quality, err := publishableQuality(source.Reference.Quality)
	if err != nil {
		return catalogCombination{}, fmt.Errorf("%w: combination %q: %v", errNotPublishable, source.CombinationID, err)
	}
	provenance := referenceProvenance{Kind: "reference", Environment: productionEnvironment}
	result := catalogCombination{CombinationID: source.CombinationID, Strategies: []catalogStrategy{}}
	if selection.IncludeReference {
		if !source.Reference.Publishable {
			return catalogCombination{}, fmt.Errorf("%w: reference profile %q", errNotPublishable, source.CombinationID)
		}
		result.Reference = &catalogReferenceProfile{
			TargetContractVersion: source.Reference.TargetContractVersion,
			Provenance:            provenance,
			Sample:                catalogSample{SemanticBundles: source.SemanticBundles, Contributors: source.Contributors, Sessions: quality.SampleSessions},
			Quality:               quality, Fuel: source.Reference.Fuel, VirtualEnergy: source.Reference.VirtualEnergy,
			Pace: source.Reference.Pace, StintPaceCurve: source.Reference.StintPaceCurve, Pit: source.Reference.Pit,
		}
	}
	clusterIDs := append([]string(nil), selection.StrategyClusterIDs...)
	sort.Strings(clusterIDs)
	seen := make(map[string]bool, len(clusterIDs))
	selectedStrategies := make([]strategyClusterSummary, 0, len(clusterIDs))
	for _, clusterID := range clusterIDs {
		if clusterID == "" || seen[clusterID] {
			return catalogCombination{}, fmt.Errorf("invalid or duplicate strategy cluster %q", clusterID)
		}
		seen[clusterID] = true
		strategy, ok := findStrategy(source.Strategies, clusterID)
		if !ok || !strategy.Publishable || strategy.Contributors < minimumCohort {
			return catalogCombination{}, fmt.Errorf("%w: strategy cluster %q does not meet k=%d", errNotPublishable, clusterID, minimumCohort)
		}
		selectedStrategies = append(selectedStrategies, strategy)
	}
	sort.Slice(selectedStrategies, func(i, j int) bool {
		if selectedStrategies[i].Rank != selectedStrategies[j].Rank {
			return selectedStrategies[i].Rank < selectedStrategies[j].Rank
		}
		return selectedStrategies[i].ClusterDigest < selectedStrategies[j].ClusterDigest
	})
	for _, strategy := range selectedStrategies {
		result.Strategies = append(result.Strategies, catalogStrategy{
			Rank: strategy.Rank, ClusterDigest: strategy.ClusterDigest, Representative: strategy.Representative,
			Provenance: provenance,
			Sample:     catalogSample{SemanticBundles: strategy.SemanticBundles, Contributors: strategy.Contributors, Sessions: quality.SampleSessions},
			Quality:    quality, Score: strategy.Score,
		})
	}
	return result, nil
}

func publishableQuality(value *qualitySummary) (qualitySummary, error) {
	if value == nil || value.SampleSessions <= 0 || value.ValidSessions+value.InvalidSessions != value.SampleSessions {
		return qualitySummary{}, fmt.Errorf("sample quality is missing or inconsistent")
	}
	if value.ValidRatio < 0 || value.ValidRatio > 1 {
		return qualitySummary{}, fmt.Errorf("valid ratio is outside [0,1]")
	}
	return *value, nil
}

func findStrategy(strategies []strategyClusterSummary, digest string) (strategyClusterSummary, bool) {
	for _, strategy := range strategies {
		if strategy.ClusterDigest == digest {
			return strategy, true
		}
	}
	return strategyClusterSummary{}, false
}

func strictDecode(data []byte, destination any) error {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(destination); err != nil {
		return err
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		if err == nil {
			return fmt.Errorf("trailing JSON value")
		}
		return fmt.Errorf("trailing JSON data: %w", err)
	}
	return nil
}
