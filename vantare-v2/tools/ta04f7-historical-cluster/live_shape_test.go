package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func freezeV2ForLiveTest(t *testing.T) Manifest {
	t.Helper()
	body, err := os.ReadFile(filepath.Join("..", "..", "docs", "vantare-program", "research", "telemetry-analysis", "ta04f7-historical-cluster-freeze-v2.json"))
	if err != nil {
		t.Fatal(err)
	}
	if got := fmt.Sprintf("%x", sha256.Sum256(body)); got != "041c41842fe1d822a6097f44076a8b0fbddc01dbf568c7760af72ee8fb841349" {
		t.Fatalf("freeze-v2 SHA-256 = %s", got)
	}
	m, err := strictDecode(body)
	if err != nil {
		t.Fatal(err)
	}
	return m
}

func positiveLiveControl(t *testing.T) (Manifest, Manifest) {
	t.Helper()
	freeze := freezeV2ForLiveTest(t)
	control := freeze
	control.Groups = append([]Group(nil), freeze.Groups...)
	control.ProtocolSHA = liveProtocolSHA
	control.RunnerSHA = "1111111111111111111111111111111111111111"
	control.Mode = liveShapeMode
	control.Population.InventoryCandidates++
	control.Population.CanonicalRecordings++
	control.Population.InsufficientLapsRecordings++
	control.Groups = append(control.Groups, Group{
		GroupOrdinal:               49,
		DiscoveredRecordings:       1,
		InsufficientLapsRecordings: 1,
		Decision:                   "stop_insufficient",
		CrossRecordingConfidence:   "none",
	})
	return freeze, control
}

func cloneManifest(t *testing.T, m Manifest) Manifest {
	t.Helper()
	body, err := encodeManifest(m)
	if err != nil {
		t.Fatal(err)
	}
	got, err := strictDecode(body)
	if err != nil {
		t.Fatal(err)
	}
	return got
}

func TestLiveInventoryControlPositiveAndC1(t *testing.T) {
	freeze, control := positiveLiveControl(t)
	if err := validateLiveInventoryControl(freeze, control); err != nil {
		t.Fatalf("positive control: %v", err)
	}
	cases := []struct {
		name string
		mut  func(*Group)
	}{
		{"count", func(g *Group) { g.DiscoveredRecordings++ }},
		{"slot", func(g *Group) { g.PassedSlots++ }},
		{"decision", func(g *Group) { g.Decision = "stop_insufficient" }},
		{"confidence", func(g *Group) { g.CrossRecordingConfidence = "limited" }},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			bad := cloneManifest(t, control)
			tc.mut(&bad.Groups[0])
			if validateLiveInventoryControl(freeze, bad) == nil {
				t.Fatal("C1 mutation accepted")
			}
		})
	}
}

func TestLiveInventoryControlC2ToC5FailClosed(t *testing.T) {
	freeze, control := positiveLiveControl(t)
	cases := []struct {
		name string
		mut  func(*Manifest)
	}{
		{"new eligible", func(m *Manifest) { m.Groups[48].EligibleRecordings = 1; m.Groups[48].InsufficientLapsRecordings = 0 }},
		{"new slot", func(m *Manifest) { m.Groups[48].EvaluatedSlots = 1; m.Groups[48].PassedSlots = 1 }},
		{"new decision", func(m *Manifest) { m.Groups[48].Decision = "technical_go_local_shape_local_only" }},
		{"new mismatch", func(m *Manifest) { m.Groups[48].InsufficientLapsRecordings = 2 }},
		{"new empty", func(m *Manifest) { m.Groups[48].DiscoveredRecordings = 0; m.Groups[48].InsufficientLapsRecordings = 0 }},
		{"negative candidates", func(m *Manifest) { m.Population.InventoryCandidates = 318 }},
		{"negative canonical", func(m *Manifest) { m.Population.CanonicalRecordings = 185 }},
		{"negative insufficient", func(m *Manifest) { m.Population.InsufficientLapsRecordings = 182 }},
		{"negative invalid", func(m *Manifest) { m.Population.DataInvalid = 132 }},
		{"eligible total", func(m *Manifest) { m.Population.EligibleRecordings = 4 }},
		{"duplicate", func(m *Manifest) { m.Population.Duplicates = 1 }},
		{"authorization", func(m *Manifest) { m.Population.AuthorizationRejected = 1 }},
		{"stability", func(m *Manifest) { m.Population.StabilityRejected = 1 }},
		{"artifact", func(m *Manifest) { m.Population.ArtifactGuardRejected = 1 }},
		{"candidate equation", func(m *Manifest) { m.Population.InventoryCandidates++ }},
		{"canonical equation", func(m *Manifest) { m.Population.CanonicalRecordings++ }},
		{"new group sum", func(m *Manifest) { m.Groups[48].DiscoveredRecordings++; m.Groups[48].InsufficientLapsRecordings++ }},
		{"group 1 decision", func(m *Manifest) { m.Groups[0].Decision = "stop_insufficient" }},
		{"group 37 confidence", func(m *Manifest) { m.Groups[36].CrossRecordingConfidence = "limited" }},
		{"group 36 decision", func(m *Manifest) { m.Groups[35].Decision = "stop_insufficient" }},
		{"outcome", func(m *Manifest) { m.Outcome = "stop_insufficient" }},
		{"inventory", func(m *Manifest) { m.InventoryStable = false }},
		{"cleanup", func(m *Manifest) { m.Cleanup.OpenReaders = 1 }},
		{"local shape", func(m *Manifest) { m.LocalShape = "valid" }},
		{"product", func(m *Manifest) { m.ProductMapAuthorization = true }},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			bad := cloneManifest(t, control)
			tc.mut(&bad)
			if validateLiveInventoryControl(freeze, bad) == nil {
				t.Fatal("invalid live control accepted")
			}
		})
	}
}

func TestLiveManifestHeaderIsEnumerated(t *testing.T) {
	_, control := positiveLiveControl(t)
	if err := control.Validate(); err != nil {
		t.Fatal(err)
	}
	control.ProtocolSHA = shapeProtocolSHA
	if err := control.Validate(); err == nil {
		t.Fatal("foreign protocol accepted")
	}
}

func TestLiveCLIRequiresExactExpandedGate3Arguments(t *testing.T) {
	good := []string{
		"-mode=" + liveShapeMode,
		"-gate3-authorized",
		"-protocol-sha=" + liveProtocolSHA,
		"-runner-sha=" + strings.Repeat("1", 40),
		"-output=" + expectedLiveShapeOutputPath,
		"-control-output=" + expectedLiveControlOutputPath,
	}
	var out, errw bytes.Buffer
	built := false
	if code := runCLIWithDeps(good, &out, &errw, func(string) Backend { built = true; return &seamBackend{} }); code == 2 {
		t.Fatalf("exact arguments rejected: %q", errw.String())
	}
	if built {
		t.Fatal("test path unexpectedly reached backend")
	}
	for _, mutate := range []func([]string){
		func(a []string) { a[1] = "-gate3-authorized=false" },
		func(a []string) { a[0] = "-mode=existing-authorized-shape" },
		func(a []string) { a[2] = "-protocol-sha=" + shapeProtocolSHA },
		func(a []string) { a[3] = "-runner-sha=$runner" },
		func(a []string) { a[4] = "-output=$shape" },
		func(a []string) { a[5] = "-control-output=$control" },
	} {
		args := append([]string(nil), good...)
		mutate(args)
		out.Reset()
		errw.Reset()
		if code := runCLIWithDeps(args, &out, &errw, func(string) Backend { t.Fatal("invalid args reached backend"); return nil }); code != 2 {
			t.Fatalf("invalid args returned %d: %v", code, args)
		}
	}
}

func TestLiveGitPreflightBindsProtocolAndAuthorization(t *testing.T) {
	const project = `C:\repo\vantare-v2`
	runner := strings.Repeat("1", 40)
	base := scriptedGit(filepath.Dir(project), branchRef, runner, liveAuthorizationSHA, "")
	run := func(ctx context.Context, args ...string) ([]byte, error) {
		if strings.Join(args, " ") == "rev-parse "+liveAuthorizationSHA+"^" {
			return []byte(liveProtocolSHA + "\n"), nil
		}
		return base(ctx, args...)
	}
	cfg := RunConfig{ProtocolSHA: liveProtocolSHA, AuthorizationSHA: liveAuthorizationSHA, RunnerSHA: runner, ProjectDir: project, Mode: liveShapeMode}
	if err := gitPreflight(context.Background(), cfg, run); err != nil {
		t.Fatal(err)
	}
	for name, mutate := range map[string]func(*RunConfig){
		"protocol":      func(c *RunConfig) { c.ProtocolSHA = strings.Repeat("2", 40) },
		"authorization": func(c *RunConfig) { c.AuthorizationSHA = strings.Repeat("3", 40) },
	} {
		t.Run(name, func(t *testing.T) {
			bad := cfg
			mutate(&bad)
			if gitPreflight(context.Background(), bad, run) == nil {
				t.Fatal("wrong authority accepted")
			}
		})
	}
}

func TestLiveToolsDoNotReferenceRejectedArtifacts(t *testing.T) {
	needle := "reject" + "ed-"
	for _, dir := range []string{".", filepath.Join("..", "ta04f8-shape-figure")} {
		files, err := filepath.Glob(filepath.Join(dir, "*.go"))
		if err != nil {
			t.Fatal(err)
		}
		for _, path := range files {
			body, err := os.ReadFile(path)
			if err != nil {
				t.Fatal(err)
			}
			if bytes.Contains(bytes.ToLower(body), []byte(needle)) {
				t.Fatal(fmt.Sprintf("custody artifact referenced by %s", filepath.Base(path)))
			}
		}
	}
}

func TestLiveShapeGateUsesNewModePathsAndTempTag(t *testing.T) {
	root := t.TempDir()
	p := shapeGatePaths{
		Protocol: liveProtocolSHA, Authorization: liveAuthorizationSHA, Runner: strings.Repeat("1", 40),
		ShapeOut: filepath.Join(root, "shape.json"), ControlOut: filepath.Join(root, "control.json"),
		Root: root, Project: root, Mode: liveShapeMode, Tag: "ta04f9",
	}
	var out, errw bytes.Buffer
	if code := runShapeGate(p, &out, &errw, func(string) Backend { return newSyntheticShapeBackend() }); code != 0 {
		t.Fatalf("exit=%d stderr=%q", code, errw.String())
	}
	shapeBody, err := os.ReadFile(p.ShapeOut)
	if err != nil {
		t.Fatal(err)
	}
	shape, err := strictDecodeShapeExport(shapeBody, shapeAuthorizedOrdinals)
	if err != nil || shape.Version != "ta04f9/v1" || shape.Mode != liveShapeMode || shape.ProtocolSHA != liveProtocolSHA {
		t.Fatalf("live shape: %#v err=%v", shape, err)
	}
	controlBody, err := os.ReadFile(p.ControlOut)
	if err != nil {
		t.Fatal(err)
	}
	control, err := strictDecode(controlBody)
	if err != nil || control.Mode != liveShapeMode || control.ProtocolSHA != liveProtocolSHA {
		t.Fatalf("live control: %#v err=%v", control, err)
	}
	for _, final := range []string{p.ShapeOut, p.ControlOut} {
		if _, err := os.Lstat(tempPathTagged(final, "ta04f9", p.Protocol, p.Runner)); !os.IsNotExist(err) {
			t.Fatalf("live temp remains: %s", final)
		}
		if _, err := os.Lstat(tempPathTagged(final, "ta04f8", p.Protocol, p.Runner)); !os.IsNotExist(err) {
			t.Fatalf("legacy temp touched: %s", final)
		}
	}
}
