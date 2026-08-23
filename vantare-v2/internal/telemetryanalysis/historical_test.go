package telemetryanalysis

import (
	"context"
	"encoding/json"
	"errors"
	"math"
	"os"
	"reflect"
	"strings"
	"testing"
	"time"
)

func TestParseLMUDuckDBCatalogPreservesObservedShape(t *testing.T) {
	manifest := historicalTestManifest()
	catalog := LMUDuckDBCatalog{
		Metadata: []LMUDuckDBMetadata{
			{Key: "SessionType", Present: true, Value: ""},
			{Key: "DriverName"},
		},
		Continuous: []LMUDuckDBChannel{
			{
				Name: "Throttle Pos", FrequencyHz: 50, Unit: "%",
				Columns: []LMUDuckDBColumn{{Name: "value", Type: "FLOAT"}},
			},
			{
				Name: "OverheatingState", FrequencyHz: 2,
				Columns: []LMUDuckDBColumn{{Name: "value", Type: "BOOLEAN"}},
			},
		},
		Events: []LMUDuckDBChannel{
			{
				Name: "Gear",
				Columns: []LMUDuckDBColumn{
					{Name: "ts", Type: "DOUBLE"},
					{Name: "value", Type: "TINYINT"},
				},
			},
			{
				Name: "Future Event",
				Columns: []LMUDuckDBColumn{
					{Name: "ts", Type: "DOUBLE"},
					{Name: "value", Type: "HUGEINT"},
				},
			},
		},
	}

	session, err := ParseLMUDuckDBCatalog(manifest, catalog)
	if err != nil {
		t.Fatalf("ParseLMUDuckDBCatalog() error = %v", err)
	}

	if session.SchemaVersion != HistoricalSchemaVersion {
		t.Fatalf("SchemaVersion = %d, want %d", session.SchemaVersion, HistoricalSchemaVersion)
	}
	if session.ID != manifest.DedupeKey {
		t.Fatalf("ID = %q, want manifest dedupe key", session.ID)
	}
	if session.Provenance.Parser != manifest.Parser {
		t.Fatalf("Parser = %#v, want %#v", session.Provenance.Parser, manifest.Parser)
	}
	if session.Provenance.SchemaFingerprint == "" {
		t.Fatal("SchemaFingerprint is empty")
	}
	if got, want := len(session.Metadata), 2; got != want {
		t.Fatalf("len(Metadata) = %d, want %d", got, want)
	}
	driverName := metadataByKey(t, session, "DriverName")
	if !driverName.Sensitive || driverName.Redacted {
		t.Fatalf("sensitive metadata = %#v, want absent DriverName marked sensitive", driverName)
	}
	sessionType := metadataByKey(t, session, "SessionType")
	if !sessionType.Present || sessionType.Quality != QualityValid || sessionType.Value != "" {
		t.Fatalf("present empty metadata was lost: %#v", sessionType)
	}
	if got, want := len(session.Channels), 4; got != want {
		t.Fatalf("len(Channels) = %d, want %d", got, want)
	}

	throttle := channelBySourceName(t, session, "Throttle Pos")
	if throttle.Sampling.Kind != SamplingContinuousImplicitFrequency ||
		throttle.Sampling.FrequencyHz != 50 ||
		throttle.Sampling.Origin != TimeOriginUnknown {
		t.Fatalf("Throttle sampling = %#v", throttle.Sampling)
	}
	if throttle.Unit != (HistoricalUnit{Symbol: "%", Quality: QualityValid}) {
		t.Fatalf("Throttle unit = %#v", throttle.Unit)
	}

	overheat := channelBySourceName(t, session, "OverheatingState")
	if overheat.Unit.Quality != QualityUnknown || overheat.Unit.Symbol != "" {
		t.Fatalf("unknown unit = %#v", overheat.Unit)
	}

	gear := channelBySourceName(t, session, "Gear")
	if gear.Sampling.Kind != SamplingEventTimestamped ||
		gear.Sampling.Origin != TimeOriginSourceTimestamp {
		t.Fatalf("Gear sampling = %#v", gear.Sampling)
	}
	if got, want := gear.Columns, []HistoricalColumn{{Name: "value", Type: ScalarInteger}}; !reflect.DeepEqual(got, want) {
		t.Fatalf("Gear columns = %#v, want %#v", got, want)
	}

	future := channelBySourceName(t, session, "Future Event")
	if future.Columns[0].Type != ScalarUnknown || future.Capability != QualityUnknown {
		t.Fatalf("future type was not preserved as unknown: %#v", future)
	}
}

func TestSanitizedLMUDuckDBSchemaCorpus(t *testing.T) {
	content, err := os.ReadFile("testdata/lmu-duckdb-schema-v1.json")
	if err != nil {
		t.Fatal(err)
	}
	for _, forbidden := range []string{`C:\`, `/Users/`, `@`, `"value":`} {
		if strings.Contains(string(content), forbidden) {
			t.Fatalf("schema corpus contains forbidden marker %q", forbidden)
		}
	}
	var catalog LMUDuckDBCatalog
	if err := json.Unmarshal(content, &catalog); err != nil {
		t.Fatal(err)
	}
	if got, want := len(catalog.Metadata), 12; got != want {
		t.Fatalf("metadata keys = %d, want %d", got, want)
	}
	if got, want := len(catalog.Continuous), 56; got != want {
		t.Fatalf("continuous channels = %d, want %d", got, want)
	}
	if got, want := len(catalog.Events), 42; got != want {
		t.Fatalf("events = %d, want %d", got, want)
	}
	session, err := ParseLMUDuckDBCatalog(historicalTestManifest(), catalog)
	if err != nil {
		t.Fatal(err)
	}
	if got, want := session.Provenance.SchemaFingerprint, "6fe6c758a407078f87332e48660cb80b1643a480a85818bf4f332858cffc1d55"; got != want {
		t.Fatalf("schema fingerprint = %q, want %q", got, want)
	}
	if got, want := len(session.Channels), 98; got != want {
		t.Fatalf("normalized channels = %d, want %d", got, want)
	}
}

func TestParseLMUDuckDBCatalogRejectsInvalidShape(t *testing.T) {
	tests := []struct {
		name    string
		catalog LMUDuckDBCatalog
	}{
		{
			name: "continuous frequency is zero",
			catalog: LMUDuckDBCatalog{Continuous: []LMUDuckDBChannel{{
				Name: "Speed", Columns: []LMUDuckDBColumn{{Name: "value", Type: "FLOAT"}},
			}}},
		},
		{
			name: "continuous unexpectedly has timestamp",
			catalog: LMUDuckDBCatalog{Continuous: []LMUDuckDBChannel{{
				Name: "Speed", FrequencyHz: 100,
				Columns: []LMUDuckDBColumn{{Name: "ts", Type: "DOUBLE"}, {Name: "value", Type: "FLOAT"}},
			}}},
		},
		{
			name: "event lacks timestamp",
			catalog: LMUDuckDBCatalog{Events: []LMUDuckDBChannel{{
				Name: "Gear", Columns: []LMUDuckDBColumn{{Name: "value", Type: "TINYINT"}},
			}}},
		},
		{
			name: "duplicate source table",
			catalog: LMUDuckDBCatalog{
				Continuous: []LMUDuckDBChannel{{
					Name: "Same", FrequencyHz: 10,
					Columns: []LMUDuckDBColumn{{Name: "value", Type: "FLOAT"}},
				}},
				Events: []LMUDuckDBChannel{{
					Name:    "Same",
					Columns: []LMUDuckDBColumn{{Name: "ts", Type: "DOUBLE"}, {Name: "value", Type: "FLOAT"}},
				}},
			},
		},
		{
			name: "duplicate source table differs only by case",
			catalog: LMUDuckDBCatalog{
				Continuous: []LMUDuckDBChannel{{
					Name: "Speed", FrequencyHz: 10,
					Columns: []LMUDuckDBColumn{{Name: "value", Type: "FLOAT"}},
				}},
				Events: []LMUDuckDBChannel{{
					Name:    "speed",
					Columns: []LMUDuckDBColumn{{Name: "ts", Type: "DOUBLE"}, {Name: "value", Type: "FLOAT"}},
				}},
			},
		},
		{
			name: "duplicate column differs only by case",
			catalog: LMUDuckDBCatalog{Continuous: []LMUDuckDBChannel{{
				Name: "Speed", FrequencyHz: 10,
				Columns: []LMUDuckDBColumn{
					{Name: "Value", Type: "FLOAT"},
					{Name: "value", Type: "FLOAT"},
				},
			}}},
		},
		{
			name: "duplicate metadata differs only by case",
			catalog: LMUDuckDBCatalog{Metadata: []LMUDuckDBMetadata{
				{Key: "TrackName"},
				{Key: "trackname"},
			}},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, err := ParseLMUDuckDBCatalog(historicalTestManifest(), test.catalog)
			if !errors.Is(err, ErrInvalidHistoricalCatalog) {
				t.Fatalf("error = %v, want ErrInvalidHistoricalCatalog", err)
			}
		})
	}
}

func TestParseLMUDuckDBCatalogIsDeterministicAcrossCatalogOrder(t *testing.T) {
	manifest := historicalTestManifest()
	first := LMUDuckDBCatalog{
		Metadata: []LMUDuckDBMetadata{{Key: "TrackName", Present: true, Value: "Spa"}, {Key: "SessionType"}},
		Continuous: []LMUDuckDBChannel{
			{Name: "Throttle", FrequencyHz: 50, Columns: []LMUDuckDBColumn{{Name: "value", Type: "FLOAT"}}},
			{Name: "Brake", FrequencyHz: 50, Columns: []LMUDuckDBColumn{{Name: "value", Type: "FLOAT"}}},
		},
		Events: []LMUDuckDBChannel{
			{Name: "Lap", Columns: []LMUDuckDBColumn{{Name: "ts", Type: "DOUBLE"}, {Name: "value", Type: "USMALLINT"}}},
			{Name: "Gear", Columns: []LMUDuckDBColumn{{Name: "ts", Type: "DOUBLE"}, {Name: "value", Type: "TINYINT"}}},
		},
	}
	shuffled := LMUDuckDBCatalog{
		Metadata:   []LMUDuckDBMetadata{first.Metadata[1], first.Metadata[0]},
		Continuous: []LMUDuckDBChannel{first.Continuous[1], first.Continuous[0]},
		Events:     []LMUDuckDBChannel{first.Events[1], first.Events[0]},
	}

	want, err := ParseLMUDuckDBCatalog(manifest, first)
	if err != nil {
		t.Fatal(err)
	}
	got, err := ParseLMUDuckDBCatalog(manifest, shuffled)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("catalog order changed canonical session:\n got %#v\nwant %#v", got, want)
	}
}

func TestNormalizeLMUDuckDBPagePreservesQualityZeroAndOrder(t *testing.T) {
	session, err := ParseLMUDuckDBCatalog(historicalTestManifest(), LMUDuckDBCatalog{
		Continuous: []LMUDuckDBChannel{{
			Name: "Throttle Pos", FrequencyHz: 50, Unit: "%",
			Columns: []LMUDuckDBColumn{{Name: "value", Type: "FLOAT"}},
		}},
		Events: []LMUDuckDBChannel{{
			Name:    "Gear",
			Columns: []LMUDuckDBColumn{{Name: "ts", Type: "DOUBLE"}, {Name: "value", Type: "TINYINT"}},
		}},
	})
	if err != nil {
		t.Fatal(err)
	}

	throttle := channelBySourceName(t, session, "Throttle Pos")
	page, err := NormalizeLMUDuckDBPage(throttle, 25, []LMUDuckDBRow{
		{Values: []LMUDuckDBValue{{Kind: ScalarNumber, Number: 0}}},
		{Values: []LMUDuckDBValue{{Null: true}}},
		{Values: []LMUDuckDBValue{{Kind: ScalarNumber, Number: math.NaN()}}},
		{Values: []LMUDuckDBValue{{Kind: ScalarNumber, Number: 0.5, Quality: QualityStale}}},
	})
	if err != nil {
		t.Fatalf("NormalizeLMUDuckDBPage() error = %v", err)
	}

	if got, want := page.Samples[0].RelativeTimeSeconds, 0.5; got != want {
		t.Fatalf("first relative time = %v, want %v", got, want)
	}
	if got, want := page.Samples[1].RelativeTimeSeconds, 0.52; math.Abs(got-want) > 1e-12 {
		t.Fatalf("second relative time = %v, want %v", got, want)
	}
	wantQualities := []Quality{QualityValid, QualityMissing, QualityInvalid, QualityStale}
	for i, want := range wantQualities {
		if got := page.Samples[i].Values[0].Quality; got != want {
			t.Fatalf("sample %d quality = %q, want %q", i, got, want)
		}
	}
	if !page.Samples[0].Values[0].Present || page.Samples[0].Values[0].Scalar.Number != 0 {
		t.Fatalf("zero was not preserved: %#v", page.Samples[0].Values[0])
	}

	gear := channelBySourceName(t, session, "Gear")
	eventPage, err := NormalizeLMUDuckDBPage(gear, 0, []LMUDuckDBRow{
		{TimestampSeconds: numberPointer(11.625), Values: []LMUDuckDBValue{{Kind: ScalarInteger, Integer: 0}}},
		{TimestampSeconds: numberPointer(12.0), Values: []LMUDuckDBValue{{Kind: ScalarInteger, Integer: 1}}},
	})
	if err != nil {
		t.Fatalf("NormalizeLMUDuckDBPage(event) error = %v", err)
	}
	if eventPage.Samples[0].TimestampSeconds == nil || *eventPage.Samples[0].TimestampSeconds != 11.625 {
		t.Fatalf("event timestamp = %#v", eventPage.Samples[0].TimestampSeconds)
	}
	if eventPage.Samples[0].Values[0].Scalar.Integer != 0 ||
		eventPage.Samples[1].Values[0].Scalar.Integer != 1 {
		t.Fatalf("event order/zero not preserved: %#v", eventPage.Samples)
	}
}

func TestNormalizeLMUDuckDBPageRejectsDecreasingEventTimestamp(t *testing.T) {
	session, err := ParseLMUDuckDBCatalog(historicalTestManifest(), LMUDuckDBCatalog{
		Events: []LMUDuckDBChannel{{
			Name:    "Gear",
			Columns: []LMUDuckDBColumn{{Name: "ts", Type: "DOUBLE"}, {Name: "value", Type: "TINYINT"}},
		}},
	})
	if err != nil {
		t.Fatal(err)
	}

	_, err = NormalizeLMUDuckDBPage(session.Channels[0], 0, []LMUDuckDBRow{
		{TimestampSeconds: numberPointer(2), Values: []LMUDuckDBValue{{Kind: ScalarInteger}}},
		{TimestampSeconds: numberPointer(1), Values: []LMUDuckDBValue{{Kind: ScalarInteger}}},
	})
	if !errors.Is(err, ErrHistoricalTimestampOrder) {
		t.Fatalf("error = %v, want ErrHistoricalTimestampOrder", err)
	}
}

func TestLapChannelDoesNotInventLapBoundaries(t *testing.T) {
	session, err := ParseLMUDuckDBCatalog(historicalTestManifest(), LMUDuckDBCatalog{
		Events: []LMUDuckDBChannel{{
			Name:    "Lap",
			Columns: []LMUDuckDBColumn{{Name: "ts", Type: "DOUBLE"}, {Name: "value", Type: "USMALLINT"}},
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(session.Laps) != 0 {
		t.Fatalf("schema-only Lap channel invented boundaries: %#v", session.Laps)
	}
}

func TestLMUDuckDBParserUsesBoundedSourceWithoutLeakingErrors(t *testing.T) {
	source := &historicalSourceStub{
		catalog: LMUDuckDBCatalog{Continuous: []LMUDuckDBChannel{{
			Name: "Speed", FrequencyHz: 100, Unit: "km/h",
			Columns: []LMUDuckDBColumn{{Name: "value", Type: "FLOAT"}},
		}}},
		rows: []LMUDuckDBRow{
			{Values: []LMUDuckDBValue{{Kind: ScalarNumber, Number: 0}}},
			{Values: []LMUDuckDBValue{{Kind: ScalarNumber, Number: 1}}},
		},
	}
	parser, err := NewLMUDuckDBParser(historicalTestArtifact(), source, 2)
	if err != nil {
		t.Fatal(err)
	}
	session, err := parser.Inspect(context.Background())
	if err != nil {
		t.Fatal(err)
	}

	page, err := parser.ReadPage(context.Background(), session.Channels[0].ID, 0, 2)
	if err != nil {
		t.Fatal(err)
	}
	if got, want := len(page.Samples), 2; got != want {
		t.Fatalf("len(Samples) = %d, want %d", got, want)
	}
	if source.lastTable != "Speed" || source.lastStart != 0 || source.lastLimit != 2 {
		t.Fatalf("source request = %q/%d/%d", source.lastTable, source.lastStart, source.lastLimit)
	}

	if _, err := parser.ReadPage(context.Background(), session.Channels[0].ID, 0, 3); !errors.Is(err, ErrInvalidHistoricalPage) {
		t.Fatalf("oversized page error = %v, want ErrInvalidHistoricalPage", err)
	}

	source.err = errors.New("sensitive-source-detail")
	if _, err := parser.ReadPage(context.Background(), session.Channels[0].ID, 0, 2); !errors.Is(err, ErrHistoricalSource) ||
		strings.Contains(err.Error(), "sensitive-source-detail") {
		t.Fatalf("source error = %v, want sanitized ErrHistoricalSource", err)
	}
}

func TestLMUDuckDBParserHonorsCancellationBeforeSource(t *testing.T) {
	source := &historicalSourceStub{}
	parser, err := NewLMUDuckDBParser(historicalTestArtifact(), source, 8)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	if _, err := parser.Inspect(ctx); !errors.Is(err, context.Canceled) {
		t.Fatalf("Inspect() error = %v, want context.Canceled", err)
	}
	if source.catalogCalls != 0 {
		t.Fatalf("Catalog() calls = %d, want 0", source.catalogCalls)
	}
}

func TestLMUDuckDBParserChecksEventOrderAcrossPageBoundary(t *testing.T) {
	predecessor := LMUDuckDBRow{
		TimestampSeconds: numberPointer(10), Values: []LMUDuckDBValue{{Kind: ScalarInteger, Integer: 1}},
	}
	current := LMUDuckDBRow{
		TimestampSeconds: numberPointer(9), Values: []LMUDuckDBValue{{Kind: ScalarInteger, Integer: 2}},
	}
	source := &historicalSourceStub{
		catalog: LMUDuckDBCatalog{Events: []LMUDuckDBChannel{{
			Name:    "Gear",
			Columns: []LMUDuckDBColumn{{Name: "ts", Type: "DOUBLE"}, {Name: "value", Type: "TINYINT"}},
		}}},
		rowResults: [][]LMUDuckDBRow{{predecessor}, {current}},
	}
	parser, err := NewLMUDuckDBParser(historicalTestArtifact(), source, 2)
	if err != nil {
		t.Fatal(err)
	}
	session, err := parser.Inspect(context.Background())
	if err != nil {
		t.Fatal(err)
	}

	_, err = parser.ReadPage(context.Background(), session.Channels[0].ID, 1, 1)
	if !errors.Is(err, ErrHistoricalTimestampOrder) {
		t.Fatalf("ReadPage() error = %v, want ErrHistoricalTimestampOrder", err)
	}
	if !reflect.DeepEqual(source.readStarts, []int64{0, 1}) || !reflect.DeepEqual(source.readLimits, []int{1, 1}) {
		t.Fatalf("source boundary requests = %v/%v, want [0 1]/[1 1]", source.readStarts, source.readLimits)
	}
}

func TestLMUDuckDBParserFreezesInspectedCatalog(t *testing.T) {
	source := &historicalSourceStub{
		catalog: LMUDuckDBCatalog{Continuous: []LMUDuckDBChannel{{
			Name: "Speed", FrequencyHz: 100, Unit: "km/h",
			Columns: []LMUDuckDBColumn{{Name: "value", Type: "FLOAT"}},
		}}},
		rows: []LMUDuckDBRow{{Values: []LMUDuckDBValue{{Kind: ScalarNumber, Number: 1}}}},
	}
	parser, err := NewLMUDuckDBParser(historicalTestArtifact(), source, 8)
	if err != nil {
		t.Fatal(err)
	}
	session, err := parser.Inspect(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	channelID := session.Channels[0].ID
	session.Channels[0].SourceName = "metadata"
	session.Channels[0].Columns[0].Name = "private"
	session.Channels[0].Provenance.SourceTable = "metadata"

	page, err := parser.ReadPage(context.Background(), channelID, 0, 1)
	if err != nil {
		t.Fatal(err)
	}
	if source.lastTable != "Speed" || page.Samples[0].Values[0].Column != "value" {
		t.Fatalf("ReadPage trusted mutated descriptor: table=%q page=%#v", source.lastTable, page)
	}

	source.readCalls = 0
	if _, err := parser.ReadPage(context.Background(), "unknown-channel", 0, 1); !errors.Is(err, ErrInvalidHistoricalPage) {
		t.Fatalf("unknown channel error = %v, want ErrInvalidHistoricalPage", err)
	}
	if source.readCalls != 0 {
		t.Fatalf("unknown channel reached source %d times", source.readCalls)
	}
}

func TestLMUDuckDBParserRequiresInspectAndHardPageBudget(t *testing.T) {
	source := &historicalSourceStub{}
	if _, err := NewLMUDuckDBParser(historicalTestArtifact(), source, MaxLMUDuckDBPageRows+1); !errors.Is(err, ErrInvalidHistoricalPage) {
		t.Fatalf("oversized constructor error = %v, want ErrInvalidHistoricalPage", err)
	}
	parser, err := NewLMUDuckDBParser(historicalTestArtifact(), source, MaxLMUDuckDBPageRows)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := parser.ReadPage(context.Background(), "any", 0, 1); !errors.Is(err, ErrHistoricalNotInspected) {
		t.Fatalf("ReadPage before Inspect error = %v, want ErrHistoricalNotInspected", err)
	}
}

func TestLMUDuckDBParserEventEOFRestoresRequestedStart(t *testing.T) {
	source := &historicalSourceStub{catalog: LMUDuckDBCatalog{Events: []LMUDuckDBChannel{{
		Name:    "Gear",
		Columns: []LMUDuckDBColumn{{Name: "ts", Type: "DOUBLE"}, {Name: "value", Type: "TINYINT"}},
	}}}}
	parser, err := NewLMUDuckDBParser(historicalTestArtifact(), source, MaxLMUDuckDBPageRows)
	if err != nil {
		t.Fatal(err)
	}
	session, err := parser.Inspect(context.Background())
	if err != nil {
		t.Fatal(err)
	}

	page, err := parser.ReadPage(context.Background(), session.Channels[0].ID, 50, MaxLMUDuckDBPageRows)
	if err != nil {
		t.Fatal(err)
	}
	if page.Start != 50 || len(page.Samples) != 0 {
		t.Fatalf("EOF page = %#v, want requested start and no samples", page)
	}
	if !reflect.DeepEqual(source.readStarts, []int64{49, 50}) ||
		!reflect.DeepEqual(source.readLimits, []int{1, MaxLMUDuckDBPageRows}) {
		t.Fatalf("source requests = %v/%v, want predecessor and hard page separately", source.readStarts, source.readLimits)
	}

	source.rowResults = [][]LMUDuckDBRow{{{
		TimestampSeconds: numberPointer(49), Values: []LMUDuckDBValue{{Kind: ScalarInteger, Integer: 4}},
	}}, {}}
	source.rowResultCalls = 0
	source.readStarts = nil
	source.readLimits = nil
	page, err = parser.ReadPage(context.Background(), session.Channels[0].ID, 50, 1)
	if err != nil {
		t.Fatal(err)
	}
	if page.Start != 50 || len(page.Samples) != 0 {
		t.Fatalf("predecessor-only page = %#v, want requested start and no samples", page)
	}
}

func TestUnknownMetadataDefaultsSensitive(t *testing.T) {
	session, err := ParseLMUDuckDBCatalog(historicalTestManifest(), LMUDuckDBCatalog{
		Metadata: []LMUDuckDBMetadata{
			{Key: "CarName", Present: true, Value: "Synthetic Car"},
			{Key: "FutureIdentity", Present: true, Value: strings.Repeat("private", 100)},
			{Key: "TrackName", Present: true, Value: strings.Repeat("x", maxHistoricalNameLen+1)},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	carName := metadataByKey(t, session, "CarName")
	if carName.Sensitive {
		t.Fatalf("CarName should be explicitly public: %#v", carName)
	}
	futureIdentity := metadataByKey(t, session, "FutureIdentity")
	if !futureIdentity.Sensitive || !futureIdentity.Redacted ||
		futureIdentity.Value != "" || !futureIdentity.Present {
		t.Fatalf("unknown metadata must be present but redacted: %#v", futureIdentity)
	}
	trackName := metadataByKey(t, session, "TrackName")
	if trackName.Present || trackName.Quality != QualityInvalid {
		t.Fatalf("oversized public metadata should not reject session or leak value: %#v", trackName)
	}
}

func TestNormalizeLMUDuckDBPageRejectsUnboundedDirectBatch(t *testing.T) {
	channel := HistoricalChannel{
		ID: "bounded", Sampling: HistoricalSampling{Kind: SamplingContinuousImplicitFrequency, FrequencyHz: 1},
		Columns: []HistoricalColumn{{Name: "value", Type: ScalarNumber}},
	}
	rows := make([]LMUDuckDBRow, MaxLMUDuckDBPageRows+1)
	if _, err := NormalizeLMUDuckDBPage(channel, 0, rows); !errors.Is(err, ErrInvalidHistoricalPage) {
		t.Fatalf("error = %v, want ErrInvalidHistoricalPage", err)
	}
}

func TestLMUDuckDBParserRejectsArtifactMismatchAndTOCTOU(t *testing.T) {
	artifact := historicalTestArtifact()
	matching := artifact.evidence
	changedHash := matching
	changedHash.ContentSHA256 = strings.Repeat("f", 64)
	changedIdentity := matching
	changedIdentity.Metadata.Identity = "different-artifact"
	catalog := LMUDuckDBCatalog{Continuous: []LMUDuckDBChannel{{
		Name: "Speed", FrequencyHz: 100, Columns: []LMUDuckDBColumn{{Name: "value", Type: "FLOAT"}},
	}}}

	for _, test := range []struct {
		name     string
		evidence HistoricalArtifactEvidence
	}{
		{name: "hash mismatch before catalog", evidence: changedHash},
		{name: "identity mismatch before catalog", evidence: changedIdentity},
	} {
		t.Run(test.name, func(t *testing.T) {
			source := &historicalSourceStub{catalog: catalog, evidence: []HistoricalArtifactEvidence{test.evidence}}
			parser, err := NewLMUDuckDBParser(artifact, source, 8)
			if err != nil {
				t.Fatal(err)
			}
			if _, err := parser.Inspect(context.Background()); !errors.Is(err, ErrHistoricalArtifactChanged) {
				t.Fatalf("Inspect() error = %v, want ErrHistoricalArtifactChanged", err)
			}
			if source.catalogCalls != 0 {
				t.Fatalf("Catalog() calls = %d, want 0", source.catalogCalls)
			}
		})
	}

	t.Run("change after row read", func(t *testing.T) {
		source := &historicalSourceStub{
			catalog:  catalog,
			rows:     []LMUDuckDBRow{{Values: []LMUDuckDBValue{{Kind: ScalarNumber, Number: 1}}}},
			evidence: []HistoricalArtifactEvidence{matching, matching, matching, changedHash},
		}
		parser, err := NewLMUDuckDBParser(artifact, source, 8)
		if err != nil {
			t.Fatal(err)
		}
		session, err := parser.Inspect(context.Background())
		if err != nil {
			t.Fatal(err)
		}
		if _, err := parser.ReadPage(context.Background(), session.Channels[0].ID, 0, 1); !errors.Is(err, ErrHistoricalArtifactChanged) {
			t.Fatalf("ReadPage() error = %v, want ErrHistoricalArtifactChanged", err)
		}
	})
}

func TestDecimalRemainsUnknown(t *testing.T) {
	session, err := ParseLMUDuckDBCatalog(historicalTestManifest(), LMUDuckDBCatalog{
		Continuous: []LMUDuckDBChannel{{
			Name: "Future Decimal", FrequencyHz: 1,
			Columns: []LMUDuckDBColumn{{Name: "value", Type: "DECIMAL"}},
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if got := session.Channels[0].Columns[0].Type; got != ScalarUnknown {
		t.Fatalf("DECIMAL type = %q, want unknown", got)
	}
}

func channelBySourceName(t *testing.T, session HistoricalSession, name string) HistoricalChannel {
	t.Helper()
	for _, channel := range session.Channels {
		if channel.SourceName == name {
			return channel
		}
	}
	t.Fatalf("channel %q not found", name)
	return HistoricalChannel{}
}

func metadataByKey(t *testing.T, session HistoricalSession, key string) HistoricalMetadata {
	t.Helper()
	for _, metadata := range session.Metadata {
		if metadata.Key == key {
			return metadata
		}
	}
	t.Fatalf("metadata %q not found", key)
	return HistoricalMetadata{}
}

func historicalTestManifest() Manifest {
	manifest := Manifest{
		Version:       ManifestVersion,
		DedupeKey:     "15682c1244ee2ea2cd0e3fe0c9516d5edcfa98bc31e5013ff9ddbe423a7b4f78",
		ContentSHA256: "8bfc540f4576bd0f3a08d6cc701433ee5b88e3bdda11e0a7714cf1fa69255a26",
		Size:          128,
		Source: ManifestSource{
			Kind: SourceLMU, Format: "lmu-duckdb",
			Locator: "lmu://0123456789abcdef", Storage: StorageReference,
		},
		Parser:     ParserRef{ID: LMUDuckDBParserID, Version: LMUDuckDBParserVersion},
		Provenance: Provenance{Kind: ProvenanceSynthetic, EvidenceID: "ta03-test"},
	}
	manifest.DedupeKey = dedupeKey(manifest.ContentSHA256, manifest.Size)
	return manifest
}

func historicalTestArtifact() AuthorizedHistoricalArtifact {
	manifest := historicalTestManifest()
	return AuthorizedHistoricalArtifact{
		manifest: manifest,
		evidence: HistoricalArtifactEvidence{
			ContentSHA256: manifest.ContentSHA256,
			Metadata: ContentMetadata{
				Size: manifest.Size, ModTime: time.Date(2026, 7, 29, 12, 0, 0, 0, time.UTC),
				IsRegular: true, Identity: "ta03-artifact",
			},
		},
	}
}

func numberPointer(value float64) *float64 {
	return &value
}

type historicalSourceStub struct {
	catalog    LMUDuckDBCatalog
	rows       []LMUDuckDBRow
	rowResults [][]LMUDuckDBRow
	err        error
	evidence   []HistoricalArtifactEvidence

	catalogCalls   int
	readCalls      int
	lastTable      string
	lastStart      int64
	lastLimit      int
	readStarts     []int64
	readLimits     []int
	rowResultCalls int
	evidenceCalls  int
}

func (s *historicalSourceStub) ArtifactEvidence(context.Context) (HistoricalArtifactEvidence, error) {
	index := s.evidenceCalls
	s.evidenceCalls++
	if len(s.evidence) == 0 {
		return historicalTestArtifact().evidence, s.err
	}
	if index >= len(s.evidence) {
		index = len(s.evidence) - 1
	}
	return s.evidence[index], s.err
}

func (s *historicalSourceStub) Catalog(context.Context) (LMUDuckDBCatalog, error) {
	s.catalogCalls++
	return s.catalog, s.err
}

func (s *historicalSourceStub) ReadRows(
	_ context.Context,
	table string,
	start int64,
	limit int,
) ([]LMUDuckDBRow, error) {
	s.readCalls++
	s.lastTable = table
	s.lastStart = start
	s.lastLimit = limit
	s.readStarts = append(s.readStarts, start)
	s.readLimits = append(s.readLimits, limit)
	if len(s.rowResults) > 0 {
		index := s.rowResultCalls
		s.rowResultCalls++
		if index >= len(s.rowResults) {
			index = len(s.rowResults) - 1
		}
		return s.rowResults[index], s.err
	}
	return s.rows, s.err
}
