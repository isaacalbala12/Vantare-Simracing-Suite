package replayoracle

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"testing"
)

// These tests validate the independently authored corpus, not product parity.
// Input and Facts are rule-specific semantic objects, not telemetry snapshots.
type timingsCase struct {
	ID               string                     `json:"id"`
	Name             string                     `json:"name"`
	Basis            string                     `json:"basis"`
	Anchors          []string                   `json:"anchors"`
	Evolutions       []string                   `json:"evolutions"`
	Input            map[string]json.RawMessage `json:"input"`
	Steps            []timingsStep              `json:"steps"`
	Draws            []timingsDraw              `json:"draws"`
	SourceExpected   timingsExpected            `json:"source_expected"`
	AcceptedExpected timingsExpected            `json:"accepted_expected"`
	Note             string                     `json:"note"`
}

type timingsExpected struct {
	Outcome string                     `json:"outcome"`
	Facts   map[string]json.RawMessage `json:"facts"`
}

type timingsStep struct {
	AtMS  int64  `json:"at_ms"`
	Event string `json:"event"`
}

type timingsDraw struct {
	Purpose      string `json:"purpose"`
	Min          int    `json:"min"`
	MaxExclusive int    `json:"max_exclusive"`
	Value        int    `json:"value"`
}

type timingsManifest struct {
	SchemaVersion int    `json:"schema_version"`
	Task          string `json:"task"`
	Reference     struct {
		CrewChiefCommit string `json:"crewchief_commit"`
		LedgerCommit    string `json:"ledger_commit"`
		LedgerSHA256    string `json:"ledger_sha256"`
	} `json:"reference"`
	Evidence map[string]string `json:"evidence"`
	Profile  struct {
		ID              string            `json:"id"`
		Settings        map[string]string `json:"settings"`
		Session         string            `json:"session"`
		Epoch           int               `json:"epoch"`
		Player          string            `json:"player"`
		CarClass        string            `json:"car_class"`
		Track           string            `json:"track"`
		Catalog         string            `json:"catalog"`
		Locale          string            `json:"locale"`
		VoicePack       string            `json:"voice_pack"`
		RuntimeDefaults map[string]bool   `json:"runtime_defaults"`
		Clock           string            `json:"clock"`
		Random          string            `json:"random"`
	} `json:"profile"`
	AcceptedEvolutions map[string]struct {
		Title    string `json:"title"`
		Accepted bool   `json:"accepted"`
		Record   string `json:"record"`
	} `json:"accepted_evolutions"`
	Sources map[string]struct {
		Path   string `json:"path"`
		Blob   string `json:"blob"`
		SHA256 string `json:"sha256"`
		Lines  int    `json:"lines"`
	} `json:"sources"`
	Anchors map[string]struct {
		Source string `json:"source"`
		Start  int    `json:"start"`
		End    int    `json:"end"`
		SHA256 string `json:"sha256"`
	} `json:"anchors"`
	Rules []struct {
		ID        string `json:"id"`
		File      string `json:"file"`
		CaseCount int    `json:"case_count"`
		SHA256    string `json:"sha256"`
	} `json:"rules"`
}

func TestTimingsIndependentFixtureCorpus(t *testing.T) {
	m, cases := readTimingsCorpus(t)
	if err := validateTimingsManifest(m); err != nil {
		t.Fatal(err)
	}
	seen := make(map[string]bool)
	evolutions := make(map[string]bool)
	for _, rule := range m.Rules {
		for _, c := range cases[rule.ID] {
			if seen[c.ID] {
				t.Fatalf("duplicate case %s", c.ID)
			}
			seen[c.ID] = true
			for _, id := range c.Evolutions {
				evolutions[id] = true
			}
			t.Run(c.ID, func(t *testing.T) {
				if !strings.HasPrefix(c.ID, rule.ID+"-") {
					t.Fatal("case in wrong rule file")
				}
				if err := validateTimingsCase(m, c); err != nil {
					t.Fatal(err)
				}
			})
		}
	}
	for id := range m.AcceptedEvolutions {
		if !evolutions[id] {
			t.Errorf("accepted evolution %s has no fixture", id)
		}
	}
}

func readTimingsCorpus(t *testing.T) (timingsManifest, map[string][]timingsCase) {
	t.Helper()
	base := filepath.Join("testdata", "timings")
	raw, err := os.ReadFile(filepath.Join(base, "manifest.json"))
	if err != nil {
		t.Fatal(err)
	}
	var m timingsManifest
	if err := decodeTimingsJSON(raw, &m); err != nil {
		t.Fatal(err)
	}
	cases := make(map[string][]timingsCase)
	for _, rule := range m.Rules {
		if rule.File != strings.ToLower(rule.ID)+".json" {
			t.Fatalf("unexpected fixture path %q", rule.File)
		}
		raw, err := os.ReadFile(filepath.Join(base, rule.File))
		if err != nil {
			t.Fatal(err)
		}
		if got := fmt.Sprintf("%x", sha256.Sum256(raw)); got != rule.SHA256 {
			t.Fatalf("%s SHA256 = %s, want %s; review expected values before updating manifest", rule.File, got, rule.SHA256)
		}
		var group []timingsCase
		if err := decodeTimingsJSON(raw, &group); err != nil {
			t.Fatalf("%s: %v", rule.File, err)
		}
		if len(group) != rule.CaseCount || len(group) == 0 {
			t.Fatalf("%s count = %d, want %d nonempty cases", rule.ID, len(group), rule.CaseCount)
		}
		cases[rule.ID] = group
	}
	return m, cases
}

func decodeTimingsJSON(raw []byte, target any) error {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return fmt.Errorf("decode timings fixture: %w", err)
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		return errors.New("timings fixture must contain exactly one JSON value")
	}
	return nil
}

func validateTimingsManifest(m timingsManifest) error {
	if m.SchemaVersion != 1 || m.Task != "VAN-745 / #1316" ||
		m.Reference.CrewChiefCommit != "4c3865e09a347d4c806c0bc0cd66aae335fbc610" ||
		m.Reference.LedgerCommit != "166ff3c5b040cb9c4b0b143675af2642043da848" ||
		m.Reference.LedgerSHA256 != "e0758d2aaa9b753ba5de1d80d31e1bf4e3e93aa5fe312af5a56bf8308e097f79" {
		return errors.New("unpinned corpus reference")
	}
	for _, key := range []string{"crewchief_execution", "product_replay", "online_voice", "offline_voice", "acoustic", "lmu"} {
		if m.Evidence[key] != "NOT_RUN" {
			return fmt.Errorf("%s cannot be certified by fixture integrity", key)
		}
	}
	want := strings.Fields("TIM-REL TIM-SAMPLE TIM-STATE TIM-PRECISION TIM-CADENCE TIM-SELECT TIM-SILENCE TIM-END TIM-AUTO TIM-QUEUE TIM-LAPPING TIM-LAPMODE TIM-QUERY TIM-STATUS TIM-CORNERS")
	var got []string
	for _, rule := range m.Rules {
		got = append(got, rule.ID)
	}
	slices.Sort(got)
	slices.Sort(want)
	if !slices.Equal(got, want) {
		return fmt.Errorf("rule coverage = %v, want %v", got, want)
	}
	// encoding/json sorts map keys. This pins every key and value, not just count.
	settings, err := json.Marshal(m.Profile.Settings)
	if err != nil {
		return fmt.Errorf("encode default settings: %w", err)
	}
	if fmt.Sprintf("%x", sha256.Sum256(settings)) != "3ff00d0c491d9f92c16149db2937153a0ed03b9df427aa19ecb33b5217a411c0" {
		return errors.New("default settings differ from reviewed source profile")
	}
	if m.Profile.Epoch < 1 || m.Profile.ID == "" || m.Profile.Player == "" || m.Profile.Session == "" ||
		m.Profile.CarClass == "" || m.Profile.Track == "" || m.Profile.Catalog == "" ||
		m.Profile.Locale == "" || m.Profile.VoicePack == "" || m.Profile.Clock == "" || m.Profile.Random == "" {
		return errors.New("missing synthetic profile input")
	}
	if len(m.AcceptedEvolutions) != 9 {
		return errors.New("incomplete accepted decisions")
	}
	for i := 1; i <= 9; i++ {
		a := m.AcceptedEvolutions[fmt.Sprintf("A%d", i)]
		if !a.Accepted || a.Title == "" || a.Record == "" {
			return fmt.Errorf("A%d lacks acceptance record", i)
		}
	}
	for name, anchor := range m.Anchors {
		source, ok := m.Sources[anchor.Source]
		if !ok || source.Path == "" || anchor.Start < 1 || anchor.End < anchor.Start || anchor.End > source.Lines ||
			!timingsHex(source.Blob, 20) || !timingsHex(source.SHA256, 32) || !timingsHex(anchor.SHA256, 32) {
			return fmt.Errorf("invalid source anchor %s", name)
		}
	}
	return nil
}

func timingsHex(value string, size int) bool {
	decoded, err := hex.DecodeString(value)
	return err == nil && len(decoded) == size
}

func validateTimingsCase(m timingsManifest, c timingsCase) error {
	if c.ID == "" || c.Name == "" || c.Note == "" || len(c.Input) == 0 || len(c.Steps) == 0 ||
		c.SourceExpected.Outcome == "" || c.AcceptedExpected.Outcome == "" || len(c.Anchors) == 0 {
		return errors.New("incomplete semantic scenario")
	}
	for _, key := range c.Anchors {
		if _, ok := m.Anchors[key]; !ok {
			return fmt.Errorf("unknown source anchor %s", key)
		}
	}
	for _, id := range c.Evolutions {
		if !m.AcceptedEvolutions[id].Accepted {
			return fmt.Errorf("unaccepted evolution %s", id)
		}
	}
	switch c.Basis {
	case "source":
		if len(c.Evolutions) != 0 || !reflect.DeepEqual(c.SourceExpected, c.AcceptedExpected) {
			return errors.New("source parity case contains an unclassified deviation")
		}
	case "accepted_evolution":
		if len(c.Evolutions) == 0 {
			return errors.New("evolution case lacks decision")
		}
	case "contract_adaptation":
		// Epoch, missing data and priority names belong to Vantare's contract.
	default:
		return fmt.Errorf("unknown comparison basis %q", c.Basis)
	}
	clock := NewVirtualClock(0)
	started := false
	for _, step := range c.Steps {
		if step.Event == "" || step.AtMS < 0 || step.AtMS > MaxVirtualTimeMS {
			return errors.New("invalid trace step")
		}
		if err := clock.Advance(step.AtMS - clock.NowMS()); err != nil {
			return fmt.Errorf("advance %s: %w", c.ID, err)
		}
		started = started || step.Event == "started"
	}
	if string(c.AcceptedExpected.Facts["consumed"]) == "true" && !started {
		return errors.New("accepted consumption requires started")
	}
	if c.AcceptedExpected.Outcome == "cancelled" && string(c.AcceptedExpected.Facts["consumed"]) != "false" {
		return errors.New("cancellation must explicitly preserve consumption")
	}
	draws := timingsDrawTape{draws: c.Draws}
	for _, draw := range c.Draws {
		if _, err := draws.next(draw.Purpose, draw.Min, draw.MaxExclusive); err != nil {
			return err
		}
	}
	return nil
}

// timingsDrawTape records each injected choice; it never shares text randomness.
type timingsDrawTape struct {
	draws     []timingsDraw
	nextIndex int
}

func (tape *timingsDrawTape) next(purpose string, min, maxExclusive int) (int, error) {
	if tape.nextIndex >= len(tape.draws) {
		return 0, errors.New("unrecorded random draw")
	}
	draw := tape.draws[tape.nextIndex]
	if purpose == "" || draw.Purpose != purpose || draw.Min != min || draw.MaxExclusive != maxExclusive ||
		min >= maxExclusive || draw.Value < min || draw.Value >= maxExclusive {
		return 0, errors.New("random draw purpose, range or exclusive upper bound mismatch")
	}
	tape.nextIndex++
	return draw.Value, nil
}

func TestTimingsFixtureRejectsInvalidEvidence(t *testing.T) {
	mutations := map[string]func(*timingsManifest){
		"setting replaced at same count": func(m *timingsManifest) {
			delete(m.Profile.Settings, "chief_name")
			m.Profile.Settings["invented"] = "Jim (default)"
		},
		"non cadence default changed": func(m *timingsManifest) { m.Profile.Settings["chief_name"] = "other" },
		"false product pass":          func(m *timingsManifest) { m.Evidence["product_replay"] = "PASS" },
		"missing rule":                func(m *timingsManifest) { m.Rules = m.Rules[1:] },
		"duplicate rule":              func(m *timingsManifest) { m.Rules[0] = m.Rules[1] },
		"missing setting":             func(m *timingsManifest) { delete(m.Profile.Settings, "enable_gap_messages") },
		"modified reference":          func(m *timingsManifest) { m.Reference.CrewChiefCommit = strings.Repeat("0", 40) },
		"missing catalog":             func(m *timingsManifest) { m.Profile.Catalog = "" },
		"missing acceptance":          func(m *timingsManifest) { delete(m.AcceptedEvolutions, "A1") },
		"missing source":              func(m *timingsManifest) { delete(m.Sources, "timings") },
	}
	for name, mutate := range mutations {
		t.Run(name, func(t *testing.T) {
			m, _ := readTimingsCorpus(t)
			mutate(&m)
			if err := validateTimingsManifest(m); err == nil {
				t.Fatal("invalid evidence accepted")
			}
		})
	}
}

func TestTimingsFixtureRejectsInvalidScenarios(t *testing.T) {
	mutations := map[string]func(*timingsCase){
		"empty input":            func(c *timingsCase) { c.Input = nil },
		"missing expected":       func(c *timingsCase) { c.SourceExpected.Outcome = "" },
		"unknown source":         func(c *timingsCase) { c.Anchors = []string{"invented"} },
		"unknown evolution":      func(c *timingsCase) { c.Evolutions = []string{"A10"} },
		"unclassified deviation": func(c *timingsCase) { c.AcceptedExpected.Outcome = "invented" },
		"backward clock":         func(c *timingsCase) { c.Steps = []timingsStep{{AtMS: 2, Event: "sample"}, {AtMS: 1, Event: "sample"}} },
		"clock overflow":         func(c *timingsCase) { c.Steps[0].AtMS = MaxVirtualTimeMS + 1 },
		"exclusive random bound": func(c *timingsCase) {
			c.Draws = []timingsDraw{{Purpose: "cadence_front", Min: 4, MaxExclusive: 9, Value: 9}}
		},
		"prestart consumption": func(c *timingsCase) {
			c.Basis = "contract_adaptation"
			c.AcceptedExpected.Facts = map[string]json.RawMessage{"consumed": json.RawMessage("true")}
		},
	}
	for name, mutate := range mutations {
		t.Run(name, func(t *testing.T) {
			m, groups := readTimingsCorpus(t)
			c := groups["TIM-REL"][0]
			mutate(&c)
			if err := validateTimingsCase(m, c); err == nil {
				t.Fatal("invalid scenario accepted")
			}
		})
	}
}

func TestTimingsJSONRejectsUnknownFieldsAndTrailingData(t *testing.T) {
	for _, raw := range []string{`{"invented":1}`, `{} {}`} {
		var c timingsCase
		if err := decodeTimingsJSON([]byte(raw), &c); err == nil {
			t.Fatalf("accepted %s", raw)
		}
	}
}

func TestTimingsRandomTapeRejectsUnrecordedOrTextDraws(t *testing.T) {
	tape := timingsDrawTape{draws: []timingsDraw{{Purpose: "cadence_front", Min: 4, MaxExclusive: 9, Value: 8}}}
	if _, err := tape.next("text", 4, 9); err == nil {
		t.Fatal("text randomness consumed cadence choice")
	}
	if got, err := tape.next("cadence_front", 4, 9); err != nil || got != 8 {
		t.Fatalf("recorded draw = %d, %v; want 8, nil", got, err)
	}
	if _, err := tape.next("cadence_front", 4, 9); err == nil {
		t.Fatal("unrecorded draw accepted")
	}
}
