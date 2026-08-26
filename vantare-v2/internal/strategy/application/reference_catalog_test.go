package application

import (
	"context"
	"testing"

	strategycatalog "github.com/vantare/overlays/v2/internal/strategy/catalog"
)

type referenceCatalogStub struct {
	result strategycatalog.ConsumerResult
}

func (stub referenceCatalogStub) Load(context.Context) (strategycatalog.ConsumerResult, error) {
	return stub.result, nil
}

func TestListReferenceCatalogKeepsReferenceProvenanceAndSample(t *testing.T) {
	repo := &sessionCatalogRepository[any]{}
	reference := referenceCatalogStub{result: strategycatalog.ConsumerResult{
		Source: strategycatalog.SourceCandidate,
		Catalog: strategycatalog.PayloadV1{ContractVersion: strategycatalog.PayloadVersionV1, Source: strategycatalog.SourceV1{MinimumCohort: 3}, Combinations: []strategycatalog.CombinationV1{{
			CombinationID:    "spa-lmgt3",
			ReferenceProfile: &strategycatalog.ReferenceProfileV1{Provenance: strategycatalog.ReferenceProvenanceV1{Kind: "reference"}, Sample: strategycatalog.SampleV1{Contributors: 4, Sessions: 10}},
			Strategies:       []strategycatalog.StrategyV1{{Rank: 1, ClusterDigest: "cluster-1", Provenance: strategycatalog.ReferenceProvenanceV1{Kind: "reference"}, Sample: strategycatalog.SampleV1{Contributors: 4, Sessions: 10}}},
		}}},
	}}
	service := NewServiceWithSources[any](repo, nil, nil, reference)
	got, err := service.ListReferenceCatalog(context.Background(), ListReferenceCatalogCommand{CommandHeader: commandHeader("reference", OperationListReferenceCatalog, 0)})
	if err != nil || got.ReferenceCatalog == nil || got.ReferenceCatalog.Source != strategycatalog.SourceCandidate {
		t.Fatalf("reference result=%+v err=%v", got, err)
	}
	combination := got.ReferenceCatalog.Catalog.Combinations[0]
	if combination.ReferenceProfile.Provenance.Kind != "reference" || combination.ReferenceProfile.Sample.Contributors < 3 || combination.Strategies[0].Provenance.Kind != "reference" {
		t.Fatalf("reference evidence lost: %+v", combination)
	}
}
