package main

import (
	"bytes"
	"context"
	"errors"
	"math"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// ellipse builds a deterministic closed shape of n points, rigidly rotated by
// rot and translated by (tx,ty). Index correspondence is preserved.
func ellipse(n int, a, b, rot, tx, ty float64) []Point {
	out := make([]Point, n)
	c, s := math.Cos(rot), math.Sin(rot)
	for i := 0; i < n; i++ {
		th := 2 * math.Pi * (float64(i) + 0.5) / float64(n)
		x, y := a*math.Cos(th), b*math.Sin(th)
		out[i] = Point{c*x - s*y + tx, s*x + c*y + ty}
	}
	return out
}

func TestCanonicalShapeCentroidZeroRotationInvariantAndSignFixed(t *testing.T) {
	base, err := canonicalShape(ellipse(gridSize, 100, 60, 0, 0, 0))
	if err != nil {
		t.Fatal(err)
	}
	if len(base) != gridSize {
		t.Fatalf("cardinality %d", len(base))
	}
	var sx, sy float64
	for _, p := range base {
		sx += p[0]
		sy += p[1]
	}
	if math.Abs(sx/gridSize) > 0.05 || math.Abs(sy/gridSize) > 0.05 {
		t.Fatalf("centroid not zero: %g %g", sx/gridSize, sy/gridSize)
	}
	if base[0][0] <= 0 {
		t.Fatalf("sign not canonicalised: %v", base[0])
	}
	for _, tc := range []struct{ rot, tx, ty float64 }{{0.7, 17, -23}, {-2.4, -1000, 5000}, {math.Pi, 0, 0}} {
		got, err := canonicalShape(ellipse(gridSize, 100, 60, tc.rot, tc.tx, tc.ty))
		if err != nil {
			t.Fatalf("%+v: %v", tc, err)
		}
		for i := range got {
			if math.Abs(got[i][0]-base[i][0]) > 0.2 || math.Abs(got[i][1]-base[i][1]) > 0.2 {
				t.Fatalf("%+v: bin %d %v != %v", tc, i, got[i], base[i])
			}
		}
	}
}

// E1: the dimensionless anisotropy ratio must reject shapes whose principal
// axis is numerically unstable, instead of returning an arbitrary rotation.
func TestCanonicalShapeRejectsNearIsotropicShapes(t *testing.T) {
	for _, b := range []float64{100, 99.99999, 99.999999} {
		if _, err := canonicalShape(ellipse(gridSize, 100, b, 0, 0, 0)); err == nil {
			t.Fatalf("near isotropic b=%v accepted", b)
		}
	}
	if _, err := canonicalShape(ellipse(gridSize, 100, 99.9, 0, 0, 0)); err != nil {
		t.Fatalf("clearly anisotropic shape rejected: %v", err)
	}
}

// lemniscate places bin 0 exactly at the centroid, so a bin 0 sign rule cannot
// decide the frame. Sxy is zero and Sxx/Syy differ, so the shape is otherwise
// perfectly well conditioned.
func lemniscate(n int, a, b float64) []Point {
	out := make([]Point, n)
	for i := 0; i < n; i++ {
		th := 2 * math.Pi * float64(i) / float64(n)
		out[i] = Point{a * math.Sin(th), b * math.Sin(2*th)}
	}
	return out
}

// E2: a bin below epsilon_sign must not decide the frame. Two shapes that
// differ only in a sub epsilon bin 0 must canonicalise identically.
func TestCanonicalShapeSignTieBreakIgnoresSubEpsilonBins(t *testing.T) {
	build := func(x0 float64) []Point {
		s := lemniscate(gridSize, 100, 40)
		s[0] = Point{x0, 0}
		return s
	}
	pos, err := canonicalShape(build(1e-9))
	if err != nil {
		t.Fatal(err)
	}
	neg, err := canonicalShape(build(-1e-9))
	if err != nil {
		t.Fatal(err)
	}
	for i := range pos {
		if pos[i] != neg[i] {
			t.Fatalf("sub epsilon bin 0 decided the sign: bin %d %v != %v", i, pos[i], neg[i])
		}
	}
	// the frame is fixed by the first bin above epsilon_sign
	first := -1
	for i, p := range pos {
		if math.Abs(p[0]) > shapeSignEpsilon {
			first = i
			break
		}
	}
	if first < 0 || pos[first][0] <= 0 {
		t.Fatalf("first significant bin %d not positive", first)
	}
}

func TestCanonicalShapeRejectsDegenerateNonFiniteAndBadCardinality(t *testing.T) {
	flat := make([]Point, gridSize)
	if _, err := canonicalShape(flat); err == nil {
		t.Fatal("zero shape must be degenerate")
	}
	bad := ellipse(gridSize, 100, 60, 0, 0, 0)
	bad[7] = Point{math.NaN(), 0}
	if _, err := canonicalShape(bad); err == nil {
		t.Fatal("NaN must fail")
	}
	bad = ellipse(gridSize, 100, 60, 0, 0, 0)
	bad[9] = Point{0, math.Inf(1)}
	if _, err := canonicalShape(bad); err == nil {
		t.Fatal("Inf must fail")
	}
	if _, err := canonicalShape(ellipse(gridSize-1, 100, 60, 0, 0, 0)); err == nil {
		t.Fatal("cardinality must fail")
	}
}

func TestCanonicalShapeRoundsToOneDecimalWithoutNegativeZero(t *testing.T) {
	got, err := canonicalShape(ellipse(gridSize, 100, 60, 0, 0, 0))
	if err != nil {
		t.Fatal(err)
	}
	for i, p := range got {
		for _, v := range []float64{p[0], p[1]} {
			if v*10 != math.Trunc(v*10) {
				t.Fatalf("bin %d not rounded to 0.1: %v", i, v)
			}
			if v == 0 && math.Signbit(v) {
				t.Fatalf("bin %d negative zero", i)
			}
		}
	}
}

func shapeFixture(t *testing.T, ordinals []int) ShapeExport {
	t.Helper()
	x := ShapeExport{Version: "ta04f8/v1", ProtocolSHA: shapeProtocolSHA, RunnerSHA: "synthetic", Mode: shapeMode, Grid: gridSize, Units: "relative_metres", LocalShape: "unknown"}
	pts, err := canonicalShape(ellipse(gridSize, 100, 60, 0, 0, 0))
	if err != nil {
		t.Fatal(err)
	}
	for _, o := range ordinals {
		x.Panels = append(x.Panels, ShapePanel{o, "technical_go_local_shape_local_only", "none", pts})
	}
	return x
}

func TestShapeExportCanonicalSchemaRoundTripAndRejections(t *testing.T) {
	auth := []int{1, 37}
	body, err := encodeShapeExport(shapeFixture(t, auth), auth)
	if err != nil {
		t.Fatal(err)
	}
	if len(body) > shapeExportMaxBytes {
		t.Fatalf("size cap: %d", len(body))
	}
	if _, err = strictDecodeShapeExport(body, auth); err != nil {
		t.Fatal(err)
	}
	head := "{\n  \"version\": \"ta04f8/v1\",\n  \"protocol_sha\": \"" + shapeProtocolSHA + "\",\n  \"runner_sha\": \"synthetic\",\n  \"mode\": \"" + shapeMode + "\",\n  \"grid\": 1000,\n  \"units\": \"relative_metres\",\n  \"scale_is_geodetic\": false,\n  \"orientation_is_absolute\": false,\n  \"panels\": [\n"
	if !bytes.HasPrefix(body, []byte(head)) {
		t.Fatalf("noncanonical key order:\n%s", body[:min(len(body), 400)])
	}
	if !bytes.HasSuffix(body, []byte("  \"local_shape\": \"unknown\",\n  \"product_map_authorization\": false\n}\n")) {
		t.Fatal("noncanonical tail")
	}
	for _, bad := range []struct {
		name string
		body []byte
	}{
		{"unknown field", bytes.Replace(body, []byte("\"grid\": 1000"), []byte("\"grid\": 1000,\n  \"extra\": 1"), 1)},
		{"reordered", bytes.Replace(body, []byte("\"units\": \"relative_metres\","), []byte(""), 1)},
		{"geodetic true", bytes.Replace(body, []byte("\"scale_is_geodetic\": false"), []byte("\"scale_is_geodetic\": true"), 1)},
		{"authorised true", bytes.Replace(body, []byte("\"product_map_authorization\": false"), []byte("\"product_map_authorization\": true"), 1)},
		{"local shape", bytes.Replace(body, []byte("\"local_shape\": \"unknown\""), []byte("\"local_shape\": \"valid\""), 1)},
		{"decision", bytes.Replace(body, []byte("technical_go_local_shape_local_only"), []byte("technical_no_go_local_shape"), 1)},
	} {
		if _, err := strictDecodeShapeExport(bad.body, auth); err == nil {
			t.Fatalf("%s accepted", bad.name)
		}
	}
	for _, bad := range [][]int{{1}, {1, 37, 2}, {1, 36}, {37, 1}} {
		if err := shapeFixture(t, bad).Validate(auth); err == nil {
			t.Fatalf("panel set %v accepted", bad)
		}
	}
	short := shapeFixture(t, auth)
	short.Panels[0].Shape = short.Panels[0].Shape[:gridSize-1]
	if err := short.Validate(auth); err == nil {
		t.Fatal("short shape accepted")
	}
	nf := shapeFixture(t, auth)
	nf.Panels[1].Shape[3][1] = math.NaN()
	if err := nf.Validate(auth); err == nil {
		t.Fatal("non finite accepted")
	}
}

func controlFixture(mode, protocol, runner string, invalid int) Manifest {
	return Manifest{Version: "ta04f7/v1", ProtocolSHA: protocol, RunnerSHA: runner, Mode: mode, Outcome: "analysis_complete", InventoryStable: true,
		Population: Population{InventoryCandidates: 2 + invalid, DataInvalid: invalid, CanonicalRecordings: 2, InsufficientLapsRecordings: 1, EligibleRecordings: 1},
		Groups:     []Group{{GroupOrdinal: 1, DiscoveredRecordings: 2, InsufficientLapsRecordings: 1, EligibleRecordings: 1, ContributingRecordings: 1, PassingRecordings: 1, EvaluatedSlots: 2, PassedSlots: 2, Decision: "technical_go_local_shape_local_only", CrossRecordingConfidence: "none"}},
		LocalShape: "unknown"}
}

func TestManifestControlEqualityElidesExactlyThreeKeys(t *testing.T) {
	freeze, err := encodeManifest(controlFixture("", protocolSHA, "a536d41c04ba24bf99de07242349e9cdc7490d0a", 3))
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(freeze, []byte("\"mode\"")) {
		t.Fatal("ta04f7 manifest must not carry a mode key")
	}
	control, err := encodeManifest(controlFixture(shapeMode, shapeProtocolSHA, "0000000000000000000000000000000000000000", 3))
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Contains(control, []byte("\"mode\": \""+shapeMode+"\"")) {
		t.Fatal("control manifest must carry the enumerated mode key")
	}
	if err = manifestControlEqual(freeze, control); err != nil {
		t.Fatalf("equal manifests rejected: %v", err)
	}
	mutated, err := encodeManifest(controlFixture(shapeMode, shapeProtocolSHA, "0000000000000000000000000000000000000000", 4))
	if err != nil {
		t.Fatal(err)
	}
	if err = manifestControlEqual(freeze, mutated); err == nil {
		t.Fatal("mutated population accepted")
	}
}

// The committed freeze-v2 is the reference the gate 3 control manifest must
// reproduce once protocol_sha, runner_sha and mode are elided.
func TestFreezeV2IsCanonicalAndControlComparable(t *testing.T) {
	body, err := os.ReadFile(filepath.Join("..", "..", "docs", "vantare-program", "research", "telemetry-analysis", "ta04f7-historical-cluster-freeze-v2.json"))
	if err != nil {
		t.Skipf("freeze-v2 unavailable: %v", err)
	}
	freeze, err := strictDecode(body)
	if err != nil {
		t.Fatalf("freeze-v2 is not canonical: %v", err)
	}
	if freeze.Mode != "" || freeze.ProtocolSHA != protocolSHA {
		t.Fatalf("freeze-v2 header: %q %q", freeze.Mode, freeze.ProtocolSHA)
	}
	local := 0
	for _, g := range freeze.Groups {
		if g.Decision == "technical_go_local_shape_local_only" {
			if local >= len(shapeAuthorizedOrdinals) || g.GroupOrdinal != shapeAuthorizedOrdinals[local] {
				t.Fatalf("unexpected local-only group %d", g.GroupOrdinal)
			}
			local++
		}
	}
	if local != len(shapeAuthorizedOrdinals) {
		t.Fatalf("local-only groups: %d", local)
	}
	control := freeze
	control.Mode = shapeMode
	control.ProtocolSHA = shapeProtocolSHA
	control.RunnerSHA = "0000000000000000000000000000000000000000"
	cb, err := encodeManifest(control)
	if err != nil {
		t.Fatal(err)
	}
	if err = manifestControlEqual(body, cb); err != nil {
		t.Fatal(err)
	}
	drift := freeze
	drift.Mode = shapeMode
	drift.ProtocolSHA = shapeProtocolSHA
	drift.RunnerSHA = "0000000000000000000000000000000000000000"
	drift.Population.DataInvalid++
	drift.Population.InventoryCandidates++
	db, err := encodeManifest(drift)
	if err != nil {
		t.Fatal(err)
	}
	if err = manifestControlEqual(body, db); err == nil {
		t.Fatal("population drift accepted")
	}
}

func TestManifestModeIsBoundToTheShapeProtocol(t *testing.T) {
	if err := controlFixture(shapeMode, protocolSHA, "r", 0).Validate(); err == nil {
		t.Fatal("shape mode with ta04f7 protocol accepted")
	}
	if err := controlFixture("", shapeProtocolSHA, "r", 0).Validate(); err == nil {
		t.Fatal("ta04f8 protocol without mode accepted")
	}
	if err := controlFixture("other", shapeProtocolSHA, "r", 0).Validate(); err == nil {
		t.Fatal("unknown mode accepted")
	}
}

func TestSyntheticShapeArtifactsDeterministicSanitisedAndSelective(t *testing.T) {
	m1, s1, err := syntheticShapeArtifacts()
	if err != nil {
		t.Fatal(err)
	}
	m2, s2, err := syntheticShapeArtifacts()
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(m1, m2) || !bytes.Equal(s1, s2) {
		t.Fatal("nondeterministic synthetic shape artifacts")
	}
	x, err := strictDecodeShapeExport(s1, shapeAuthorizedOrdinals)
	if err != nil {
		t.Fatal(err)
	}
	// E8: the synthetic fixture must traverse the real topology, not a reduced
	// single panel one.
	if len(x.Panels) != 2 || x.Panels[0].GroupOrdinal != 1 || x.Panels[1].GroupOrdinal != 37 {
		t.Fatalf("synthetic panels must be [1 37], got %d panels", len(x.Panels))
	}
	for _, p := range x.Panels {
		if p.Decision != "technical_go_local_shape_local_only" || p.CrossRecordingConfidence != "none" {
			t.Fatalf("non local-only panel selected: %+v", p.GroupOrdinal)
		}
	}
	cm, err := strictDecode(m1)
	if err != nil {
		t.Fatal(err)
	}
	if len(cm.Groups) != 37 {
		t.Fatalf("synthetic must build 37 groups, got %d", len(cm.Groups))
	}
	for _, g := range cm.Groups {
		want := "stop_insufficient"
		if g.GroupOrdinal == 1 || g.GroupOrdinal == 37 {
			want = "technical_go_local_shape_local_only"
		}
		if g.Decision != want {
			t.Fatalf("group %d decision %q, want %q", g.GroupOrdinal, g.Decision, want)
		}
	}
	if cm.Mode != shapeMode || cm.ProtocolSHA != shapeProtocolSHA {
		t.Fatalf("control manifest not in shape mode: %q %q", cm.Mode, cm.ProtocolSHA)
	}
	selected := map[int]bool{}
	for _, p := range x.Panels {
		selected[p.GroupOrdinal] = true
	}
	for _, g := range cm.Groups {
		if selected[g.GroupOrdinal] != (g.Decision == "technical_go_local_shape_local_only") {
			t.Fatalf("group %d decision %q selected=%v", g.GroupOrdinal, g.Decision, selected[g.GroupOrdinal])
		}
	}
	for _, forbidden := range []string{"centerline", "latitude", "longitude", "lat0", "lon0", "TrackName", "CarClass", "session-", "candidate-", "p95", "p99", "commitment", "digest", "group-"} {
		for _, b := range [][]byte{m1, s1} {
			if bytes.Contains(bytes.ToLower(b), []byte(strings.ToLower(forbidden))) {
				t.Fatalf("privacy leak %q", forbidden)
			}
		}
	}
}

func TestRealShapeGateCannotRunWithoutExplicitGate3Flag(t *testing.T) {
	called := false
	factory := func(string) Backend { called = true; return newSyntheticBackend() }
	for _, args := range [][]string{
		{"-mode=existing-authorized-shape"},
		{"-mode=existing-authorized-shape", "-protocol-sha=" + shapeProtocolSHA, "-runner-sha=0123456789012345678901234567890123456789", "-output=" + expectedShapeOutputPath},
		{"-mode=existing-authorized-shape", "-protocol-sha=" + shapeProtocolSHA, "-runner-sha=0123456789012345678901234567890123456789", "-output=" + expectedShapeOutputPath, "-control-output=" + expectedControlOutputPath},
	} {
		var out, errw bytes.Buffer
		if code := runCLIWithDeps(args, &out, &errw, factory); code != 2 {
			t.Fatalf("%v: exit %d", args, code)
		}
		if called {
			t.Fatalf("%v: backend constructed without gate 3 authorisation", args)
		}
		if out.Len() != 0 {
			t.Fatalf("%v: stdout leaked %q", args, out.String())
		}
	}
}

// E4: the four gate 3 paths are checked before the backend exists, and both
// guards stay valid at publish time.
func TestGate3PreflightsFourPathsBeforeBackendAndRevalidatesBothGuards(t *testing.T) {
	const runner = "0123456789012345678901234567890123456789"
	paths := func(root string) shapeGatePaths {
		return shapeGatePaths{Protocol: shapeProtocolSHA, Runner: runner,
			ShapeOut: filepath.Join(root, "shape.json"), ControlOut: filepath.Join(root, "control.json"),
			Root: root, Project: root}
	}
	all := func(p shapeGatePaths) []string {
		return []string{p.ControlOut, p.ShapeOut,
			tempPathTagged(p.ControlOut, "ta04f8", p.Protocol, p.Runner),
			tempPathTagged(p.ShapeOut, "ta04f8", p.Protocol, p.Runner)}
	}
	for i := range all(paths("x")) {
		root := t.TempDir()
		p := paths(root)
		if err := os.WriteFile(all(p)[i], []byte("{}\n"), 0600); err != nil {
			t.Fatal(err)
		}
		var out, errw bytes.Buffer
		built := false
		code := runShapeGate(p, &out, &errw, func(string) Backend { built = true; return newSyntheticShapeBackend() })
		if code != 1 {
			t.Fatalf("path %d: exit %d", i, code)
		}
		if built {
			t.Fatalf("path %d: backend built despite a preexisting output", i)
		}
		if out.Len() != 0 {
			t.Fatalf("path %d: stdout %q", i, out.String())
		}
	}
	root := t.TempDir()
	p := paths(root)
	var out, errw bytes.Buffer
	if code := runShapeGate(p, &out, &errw, func(string) Backend { return newSyntheticShapeBackend() }); code != 0 {
		t.Fatalf("clean run exit %d stderr=%q", code, errw.String())
	}
	for _, f := range all(p)[:2] {
		body, err := os.ReadFile(f)
		if err != nil {
			t.Fatal(err)
		}
		if len(body) == 0 {
			t.Fatalf("%s empty", f)
		}
	}
	for _, f := range all(p)[2:] {
		if _, err := os.Lstat(f); !errors.Is(err, os.ErrNotExist) {
			t.Fatalf("temp remains: %s", f)
		}
	}
	shape, err := os.ReadFile(p.ShapeOut)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = strictDecodeShapeExport(shape, shapeAuthorizedOrdinals); err != nil {
		t.Fatalf("published shape not canonical: %v", err)
	}
	control, err := os.ReadFile(p.ControlOut)
	if err != nil {
		t.Fatal(err)
	}
	cm, err := strictDecode(control)
	if err != nil {
		t.Fatalf("published control not canonical: %v", err)
	}
	if cm.Mode != shapeMode || cm.Outcome != "analysis_complete" {
		t.Fatalf("control %q %q", cm.Mode, cm.Outcome)
	}
}

func TestRevalidateGuardsRejectsAnyReplacedAncestor(t *testing.T) {
	const runner = "0123456789012345678901234567890123456789"
	root := t.TempDir()
	a := filepath.Join(root, "a")
	b := filepath.Join(root, "b")
	for _, d := range []string{a, b} {
		if err := os.Mkdir(d, 0700); err != nil {
			t.Fatal(err)
		}
	}
	ga, err := preflightOutputTagged(root, filepath.Join(a, "x.json"), "ta04f8", shapeProtocolSHA, runner)
	if err != nil {
		t.Fatal(err)
	}
	gb, err := preflightOutputTagged(root, filepath.Join(b, "y.json"), "ta04f8", shapeProtocolSHA, runner)
	if err != nil {
		t.Fatal(err)
	}
	if err = revalidateGuards(ga, gb); err != nil {
		t.Fatalf("intact guards rejected: %v", err)
	}
	// replacing the ancestor of the *other* output must still invalidate the run
	if err = os.Remove(b); err != nil {
		t.Fatal(err)
	}
	if err = os.Mkdir(b, 0700); err != nil {
		t.Fatal(err)
	}
	if err = revalidateGuards(ga, gb); err == nil {
		t.Fatal("replaced ancestor accepted")
	}
}

// custodyErratumSHA is the ta04f8 gate 3 preflight protocol anchor erratum.
// Both tools must be pinned to it before a new gate 3 run is authorised.
const custodyErratumSHA = "bc13c7015a44b108ed63e1c00d70e43811acb57e"

func TestShapeProtocolSHAMatchesCustodyErratum(t *testing.T) {
	if shapeProtocolSHA != custodyErratumSHA {
		t.Fatalf("shapeProtocolSHA = %q, want %q", shapeProtocolSHA, custodyErratumSHA)
	}
}

// seamBackend proves how far an invocation got without any discovery.
type seamBackend struct{ preflight, discover, process int }

var errSeamSentinel = errors.New("seam_preflight_sentinel")

func (b *seamBackend) Preflight(context.Context, RunConfig) error {
	b.preflight++
	return errSeamSentinel
}
func (b *seamBackend) Discover(context.Context) ([]InventoryItem, error) {
	b.discover++
	return nil, errSeamSentinel
}
func (b *seamBackend) Process(context.Context, InventoryItem) (CandidateResult, error) {
	b.process++
	return CandidateResult{}, errSeamSentinel
}
func (b *seamBackend) Cleanup() error  { return nil }
func (b *seamBackend) Ledger() Cleanup { return Cleanup{} }

// G4 positive: the exact expanded arguments clear argument validation. The
// orchestration fault was a rejection at this seam, so the regression asserts
// the invocation is no longer classified data_invalid.
func TestCLISeamAcceptsExactExpandedArguments(t *testing.T) {
	args := []string{
		"-mode=existing-authorized-shape",
		"-gate3-authorized",
		"-protocol-sha=" + shapeProtocolSHA,
		"-runner-sha=" + "0123456789012345678901234567890123456789",
		"-output=" + expectedShapeOutputPath,
		"-control-output=" + expectedControlOutputPath,
	}
	if len(args) != 6 {
		t.Fatalf("frozen invocation has %d elements", len(args))
	}
	for _, a := range args {
		if strings.Contains(a, "$") {
			t.Fatalf("unexpanded argument %q", a)
		}
	}
	var out, errw bytes.Buffer
	built := false
	code := runCLIWithDeps(args, &out, &errw, func(string) Backend { built = true; return &seamBackend{} })
	if code == 2 {
		t.Fatalf("exact expanded arguments rejected as data_invalid: %q", errw.String())
	}
	// this test never reaches gate 3: the test working directory is not the
	// authorised project root, so the output guard stops it before any backend.
	if built {
		t.Fatal("backend built from a test working directory")
	}
	if out.Len() != 0 {
		t.Fatalf("stdout %q", out.String())
	}
}

// G4 negative: an unquoted -flag=$variable token reaching the runner as a
// literal is rejected before any backend exists.
func TestCLISeamRejectsUnexpandedLiteralArguments(t *testing.T) {
	for _, bad := range [][]string{
		{"-mode=existing-authorized-shape", "-gate3-authorized", "-protocol-sha=$protocol", "-runner-sha=$runner", "-output=$shape", "-control-output=$control"},
		{"-mode=existing-authorized-shape", "-gate3-authorized", "-protocol-sha=" + shapeProtocolSHA, "-runner-sha=$runner", "-output=" + expectedShapeOutputPath, "-control-output=" + expectedControlOutputPath},
		{"-mode=existing-authorized-shape", "-gate3-authorized", "-protocol-sha=" + shapeProtocolSHA, "-runner-sha=0123456789012345678901234567890123456789", "-output=$shape", "-control-output=" + expectedControlOutputPath},
		{"-mode=existing-authorized-shape", "-gate3-authorized", "-protocol-sha=" + shapeProtocolSHA, "-runner-sha=0123456789012345678901234567890123456789", "-output=" + expectedShapeOutputPath, "-control-output=$control"},
	} {
		var out, errw bytes.Buffer
		code := runCLIWithDeps(bad, &out, &errw, func(string) Backend { t.Fatal("backend built from literal arguments"); return nil })
		if code != 2 {
			t.Fatalf("%v: exit %d", bad, code)
		}
		if out.Len() != 0 {
			t.Fatalf("%v: stdout %q", bad, out.String())
		}
	}
}

// G4: a controlled backend proves the run stops at Preflight, with no discovery
// and no output of any kind.
func TestShapeGateReachesBackendPreflightWithoutDiscoveryOrOutput(t *testing.T) {
	root := t.TempDir()
	p := shapeGatePaths{Protocol: shapeProtocolSHA, Runner: "0123456789012345678901234567890123456789",
		ShapeOut: filepath.Join(root, "shape.json"), ControlOut: filepath.Join(root, "control.json"),
		Root: root, Project: root}
	b := &seamBackend{}
	var out, errw bytes.Buffer
	if code := runShapeGate(p, &out, &errw, func(string) Backend { return b }); code != 1 {
		t.Fatalf("exit %d", code)
	}
	if b.preflight != 1 {
		t.Fatalf("preflight calls %d", b.preflight)
	}
	if b.discover != 0 || b.process != 0 {
		t.Fatalf("discovery reached: discover=%d process=%d", b.discover, b.process)
	}
	for _, f := range []string{p.ShapeOut, p.ControlOut,
		tempPathTagged(p.ShapeOut, "ta04f8", p.Protocol, p.Runner),
		tempPathTagged(p.ControlOut, "ta04f8", p.Protocol, p.Runner)} {
		if _, err := os.Lstat(f); !errors.Is(err, os.ErrNotExist) {
			t.Fatalf("output created: %s", f)
		}
	}
	if out.Len() != 0 {
		t.Fatalf("stdout %q", out.String())
	}
}

// E3: the gate 3 confirmation flag exists in exactly one mode.
func TestGate3FlagIsRejectedInEveryOtherMode(t *testing.T) {
	for _, args := range [][]string{
		{"-mode=synthetic", "-gate3-authorized"},
		{"-mode=synthetic-shape", "-gate3-authorized"},
		{"-mode=existing-authorized", "-gate3-authorized", "-protocol-sha=" + protocolSHA, "-runner-sha=0123456789012345678901234567890123456789", "-output=" + expectedOutputPath},
	} {
		var out, errw bytes.Buffer
		if code := runCLIWithDeps(args, &out, &errw, func(string) Backend { t.Fatal("backend built"); return nil }); code != 2 {
			t.Fatalf("%v: exit %d", args, code)
		}
		if out.Len() != 0 {
			t.Fatalf("%v: stdout %q", args, out.String())
		}
	}
}

func TestSyntheticShapeCLIEmitsCanonicalArtifactsOnly(t *testing.T) {
	for _, tc := range []struct{ emit, wantPrefix string }{{"shape", "{\n  \"version\": \"ta04f8/v1\""}, {"manifest", "{\n  \"version\": \"ta04f7/v1\""}} {
		var out, errw bytes.Buffer
		if code := runCLIWithDeps([]string{"-mode=synthetic-shape", "-emit=" + tc.emit}, &out, &errw, nil); code != 0 {
			t.Fatalf("%s: exit %d stderr=%q", tc.emit, code, errw.String())
		}
		if errw.Len() != 0 {
			t.Fatalf("%s: stderr %q", tc.emit, errw.String())
		}
		if !strings.HasPrefix(out.String(), tc.wantPrefix) {
			t.Fatalf("%s: %q", tc.emit, out.String()[:min(out.Len(), 120)])
		}
	}
	var out, errw bytes.Buffer
	if code := runCLIWithDeps([]string{"-mode=synthetic-shape", "-emit=both"}, &out, &errw, nil); code == 0 {
		t.Fatal("unknown emit accepted")
	}
}
