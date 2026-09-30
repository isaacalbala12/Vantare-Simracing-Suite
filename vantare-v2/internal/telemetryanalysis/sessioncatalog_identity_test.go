package telemetryanalysis

import (
	"context"
	"errors"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

// T12j5 — resolución canónica contra el listado autorizado existente. Una
// sola consulta, cancelación comprobada antes y después aunque el source la
// ignore, comparación exacta de ID y tuple devuelto por valor. La pertenencia
// canónica nunca depende de vueltas completadas.

type identityCatalogSource struct {
	models []AuthorizedSessionModel
	err    error
	calls  int
	seen   context.Context
	inside func(context.Context)
}

func (source *identityCatalogSource) ListAuthorizedSessions(ctx context.Context) ([]AuthorizedSessionModel, error) {
	source.calls++
	source.seen = ctx
	if source.inside != nil {
		source.inside(ctx)
	}
	return source.models, source.err
}

func identityCatalogModel(t *testing.T, id, track, layout, car, class string, completed bool) AuthorizedSessionModel {
	t.Helper()
	model := catalogModel(t, id, "Race", completed, time.Unix(100, 0), strategyprojection.ClimateBucketDry)
	for i := range model.Session.Metadata {
		switch model.Session.Metadata[i].Key {
		case "TrackName":
			model.Session.Metadata[i].Value = track
		case "TrackLayout":
			model.Session.Metadata[i].Value = layout
		case "CarName":
			model.Session.Metadata[i].Value = car
		case "CarClass":
			model.Session.Metadata[i].Value = class
		}
	}
	return model
}

func identityCatalogCombination(t *testing.T, model AuthorizedSessionModel) CombinationIdentity {
	t.Helper()
	classified, err := ClassifyHistoricalSession(model.Session)
	if err != nil {
		t.Fatal(err)
	}
	return classified.Combination
}

func TestResolveCanonicalCombinationReturnsExactAuthorizedTuple(t *testing.T) {
	first := identityCatalogModel(t, "race-1", "Imola", "GP", "Oreca 07", "LMP2", true)
	second := identityCatalogModel(t, "race-2", "Fuji", "Classic", "499P", "Hypercar", true)
	source := &identityCatalogSource{models: []AuthorizedSessionModel{first, second}}
	catalog := NewSessionCatalog(source)
	var resolver func(context.Context, string) (CombinationIdentity, error) = catalog.ResolveCanonicalCombination
	want := identityCatalogCombination(t, second)
	got, err := resolver(context.Background(), want.ID)
	if err != nil {
		t.Fatalf("resolución conocida rechazada: %v", err)
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("tuple = %+v, want %+v", got, want)
	}
	if got.TrackName != "Fuji" || got.TrackLayout != "Classic" || got.CarName != "499P" || got.CarClass != "Hypercar" {
		t.Fatalf("caso del tuple no preservado: %+v", got)
	}
	got.TrackName = "caller mutation"
	again, err := catalog.ResolveCanonicalCombination(context.Background(), want.ID)
	if err != nil || !reflect.DeepEqual(again, want) {
		t.Fatalf("el resultado alias el catálogo: %v %+v", err, again)
	}
}

func TestResolveCanonicalCombinationDoesNotRequireCompletedLaps(t *testing.T) {
	model := identityCatalogModel(t, "practice-1", "Fuji", "Classic", "499P", "Hypercar", false)
	classified, err := ClassifyHistoricalSession(model.Session)
	if err != nil {
		t.Fatal(err)
	}
	if classified.Status != SessionStatusIdentifiedNotUsable {
		t.Fatal("fixture sin la precondición de no usable")
	}
	catalog := NewSessionCatalog(&identityCatalogSource{models: []AuthorizedSessionModel{model}})
	got, err := catalog.ResolveCanonicalCombination(context.Background(), classified.Combination.ID)
	if err != nil || !reflect.DeepEqual(got, classified.Combination) {
		t.Fatalf("pertenencia canónica exigió usabilidad: %v", err)
	}
}

func TestResolveCanonicalCombinationUnknownIDs(t *testing.T) {
	model := identityCatalogModel(t, "race-1", "Imola", "GP", "Oreca 07", "LMP2", true)
	known := identityCatalogCombination(t, model).ID
	absent := canonicalTestTarget("Monza", "GP", "Oreca 07", "LMP2").ID
	tests := []struct {
		name   string
		models []AuthorizedSessionModel
		id     string
	}{
		{"listado vacío disponible", nil, known},
		{"hash coherente no presente", []AuthorizedSessionModel{model}, absent},
		{"ID con dígito extra", []AuthorizedSessionModel{model}, known + "0"},
		{"ID recortado", []AuthorizedSessionModel{model}, known[:len(known)-1]},
		{"ID en mayúsculas", []AuthorizedSessionModel{model}, strings.ToUpper(known)},
		{"ID con espacios", []AuthorizedSessionModel{model}, " " + known + " "},
		{"ID vacío", []AuthorizedSessionModel{model}, ""},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			source := &identityCatalogSource{models: tc.models}
			got, err := NewSessionCatalog(source).ResolveCanonicalCombination(context.Background(), tc.id)
			if !errors.Is(err, ErrCanonicalCombinationUnknown) || got != (CombinationIdentity{}) || source.calls != 1 {
				t.Fatalf("llegó %v/%+v, calls=%d", err, got, source.calls)
			}
		})
	}
}

func TestResolveCanonicalCombinationUnavailable(t *testing.T) {
	var nilCatalog *SessionCatalog
	if got, err := nilCatalog.ResolveCanonicalCombination(context.Background(), "lmu:x"); !errors.Is(err, ErrCanonicalCombinationUnavailable) || got != (CombinationIdentity{}) {
		t.Fatalf("catálogo nil: %v", err)
	}
	if got, err := NewSessionCatalog(nil).ResolveCanonicalCombination(context.Background(), "lmu:x"); !errors.Is(err, ErrCanonicalCombinationUnavailable) || got != (CombinationIdentity{}) {
		t.Fatalf("source nil: %v", err)
	}
}

func TestResolveCanonicalCombinationPropagatesIOError(t *testing.T) {
	boom := errors.New("catalog read failed")
	source := &identityCatalogSource{err: boom}
	got, err := NewSessionCatalog(source).ResolveCanonicalCombination(context.Background(), "lmu:x")
	if !errors.Is(err, boom) || errors.Is(err, ErrCanonicalCombinationUnknown) || got != (CombinationIdentity{}) || source.calls != 1 {
		t.Fatalf("error I/O sin propagar: %v", err)
	}
}

func TestResolveCanonicalCombinationContextGuards(t *testing.T) {
	model := identityCatalogModel(t, "race-1", "Imola", "GP", "Oreca 07", "LMP2", true)
	known := identityCatalogCombination(t, model).ID
	t.Run("cancelado antes", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		cancel()
		source := &identityCatalogSource{models: []AuthorizedSessionModel{model}}
		got, err := NewSessionCatalog(source).ResolveCanonicalCombination(ctx, known)
		if !errors.Is(err, context.Canceled) || got != (CombinationIdentity{}) || source.calls != 0 {
			t.Fatalf("llegó %v, calls=%d", err, source.calls)
		}
	})
	t.Run("cancelado durante listado", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		source := &identityCatalogSource{models: []AuthorizedSessionModel{model}, inside: func(context.Context) { cancel() }}
		got, err := NewSessionCatalog(source).ResolveCanonicalCombination(ctx, known)
		if !errors.Is(err, context.Canceled) || got != (CombinationIdentity{}) || source.calls != 1 {
			t.Fatalf("source ignoró cancelación y se aceptó: %v, calls=%d", err, source.calls)
		}
	})
	t.Run("cancelación prioritaria sobre error", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		boom := errors.New("catalog read failed")
		source := &identityCatalogSource{err: boom, inside: func(context.Context) { cancel() }}
		got, err := NewSessionCatalog(source).ResolveCanonicalCombination(ctx, known)
		if !errors.Is(err, context.Canceled) || errors.Is(err, boom) || got != (CombinationIdentity{}) {
			t.Fatalf("cancelación no prioritaria: %v", err)
		}
	})
	t.Run("mismo contexto una llamada", func(t *testing.T) {
		type ctxKey struct{}
		ctx := context.WithValue(context.Background(), ctxKey{}, "v")
		source := &identityCatalogSource{models: []AuthorizedSessionModel{model}}
		got, err := NewSessionCatalog(source).ResolveCanonicalCombination(ctx, known)
		if err != nil || got.ID != known || source.calls != 1 || source.seen == nil || source.seen.Value(ctxKey{}) != "v" {
			t.Fatalf("ctx no propagado o más de una llamada: %v calls=%d", err, source.calls)
		}
	})
}

func TestResolveCanonicalCombinationHonorsAuthorizedExclusions(t *testing.T) {
	mutate := func(edit func(*AuthorizedSessionModel)) AuthorizedSessionModel {
		model := identityCatalogModel(t, "excluded", "Zandvoort", "GP", "499P", "Hypercar", true)
		edit(&model)
		return model
	}
	absentID := canonicalTestTarget("Zandvoort", "GP", "499P", "Hypercar").ID
	tests := []struct {
		name  string
		model AuthorizedSessionModel
	}{
		{"modelo sin autorización", mutate(func(m *AuthorizedSessionModel) {
			m.Artifact = AuthorizedHistoricalArtifact{}
		})},
		{"provenance discordante", mutate(func(m *AuthorizedSessionModel) {
			m.Session.Provenance.Parser.Version = "other"
		})},
		{"metadata no clasificable", mutate(func(m *AuthorizedSessionModel) {
			for i := range m.Session.Metadata {
				if m.Session.Metadata[i].Key == "SessionType" {
					m.Session.Metadata[i].Value = "Warmup"
				}
			}
		})},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			source := &identityCatalogSource{models: []AuthorizedSessionModel{tc.model}}
			catalog := NewSessionCatalog(source)
			listing, err := catalog.ListSessionCombinations(context.Background())
			if err != nil || len(listing.Combinations) != 0 || len(listing.Exclusions) != 1 {
				t.Fatalf("el modelo no quedó excluido del listado: %+v", listing)
			}
			got, err := catalog.ResolveCanonicalCombination(context.Background(), absentID)
			if !errors.Is(err, ErrCanonicalCombinationUnknown) || got != (CombinationIdentity{}) {
				t.Fatalf("identidad excluida resuelta: %v", err)
			}
		})
	}
}
