package main

import (
	"context"
	"crypto/rand"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
	"unicode/utf8"
)

var expectedOutputPath = projectOutputPath("ta04f7-historical-cluster-freeze-v2.json")
const maxOpaqueIDBytes = 256
const maxGroupTokenBytes = 4*256 + 3

func validOpaque(v string, max int) bool {
	if v == "" || len(v) > max || !utf8.ValidString(v) {
		return false
	}
	for _, r := range v {
		if r < 0x20 || r == 0x7f {
			return false
		}
	}
	return true
}
func validGroupToken(v string) bool {
	if v == "" || len(v) > maxGroupTokenBytes || !utf8.ValidString(v) {
		return false
	}
	for _, r := range v {
		if (r < 0x20 && r != '\x00') || r == 0x7f {
			return false
		}
	}
	return true
}
func reserveMapString(b *logicalBudgetV1, v string, valueFields uint64) error {
	n, e := logicalMapEntryBytes(uint64(len(v)), valueFields)
	if e != nil {
		return e
	}
	return b.reserve(n)
}
func groupAuxMapBytes() (uint64, error) {
	var total uint64
	for _, width := range []uint64{logicalSliceHeader, logicalInt64, logicalBool} {
		n, e := logicalIntMapEntryBytes(width)
		if e != nil {
			return 0, e
		}
		var ok bool
		total, ok = checkedAdd(total, n)
		if !ok {
			return 0, errLogicalCap
		}
	}
	return total, nil
}
func reserveGroupAux(b *logicalBudgetV1, ordinal int, centers map[int][][]Point, refs map[int]uint64, unavailable map[int]bool) error {
	n, e := groupAuxMapBytes()
	if e != nil {
		return e
	}
	if e = b.reserve(n); e != nil {
		return e
	}
	centers[ordinal] = nil
	refs[ordinal] = 0
	unavailable[ordinal] = false
	return nil
}

type Backend interface {
	Preflight(context.Context, RunConfig) error
	Discover(context.Context) ([]InventoryItem, error)
	Process(context.Context, InventoryItem) (CandidateResult, error)
	Cleanup() error
	Ledger() Cleanup
}
type logicalBudgetConsumer interface{ setLogicalBudget(*logicalBudgetV1) }
type RunConfig struct {
	ProtocolSHA, RunnerSHA, OutputPath, ProjectDir string
	// AuthorizationSHA is set only by TA-04F9, whose runner parent is the
	// dedicated human Gate 0 authorization commit.
	AuthorizationSHA string
	// Mode is empty for TA-04F7 and enumerated for each visual child runner.
	Mode string
	// Shape collects sanitised local-only centerlines when non-nil.
	Shape *shapeCollector
}
type CandidateResult struct {
	Class, SessionID, GroupToken                                        string
	GroupOrdinal, Laps, Pass, FailThreshold, FailGeometry, FailTraining int
	Contributing, Passing                                               bool
	Centerline                                                          []Point
}

func runCLI(args []string, out, errw io.Writer) int {
	return runCLIWithDeps(args, out, errw, func(project string) Backend { return newProductionBackend(project) })
}
func runCLIWithDeps(args []string, out, errw io.Writer, factory func(string) Backend) int {
	fs := flag.NewFlagSet("ta04f7-historical-cluster", flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	mode := fs.String("mode", "synthetic", "")
	protocol := fs.String("protocol-sha", "", "")
	runner := fs.String("runner-sha", "", "")
	output := fs.String("output", "", "")
	control := fs.String("control-output", "", "")
	emit := fs.String("emit", "shape", "")
	// gate3 keeps the real TA-04F8 run impossible to trigger accidentally: it
	// must be requested explicitly on top of the four exact identifiers.
	gate3 := fs.Bool("gate3-authorized", false, "")
	if fs.Parse(args) != nil || fs.NArg() != 0 {
		fmt.Fprintln(errw, "data_invalid")
		return 2
	}
	clean := *protocol == "" && *runner == "" && *output == "" && *control == "" && !*gate3
	if *mode == "synthetic" {
		if !clean {
			fmt.Fprintln(errw, "data_invalid")
			return 2
		}
		b, e := syntheticManifest()
		if e != nil {
			fmt.Fprintln(errw, "pipeline_fault")
			return 1
		}
		if _, e = out.Write(b); e != nil {
			return 1
		}
		return 0
	}
	if *mode == "synthetic-shape" {
		if !clean || (*emit != "shape" && *emit != "manifest") {
			fmt.Fprintln(errw, "data_invalid")
			return 2
		}
		manifest, shape, e := syntheticShapeArtifacts()
		if e != nil {
			fmt.Fprintln(errw, "pipeline_fault")
			return 1
		}
		b := shape
		if *emit == "manifest" {
			b = manifest
		}
		if _, e = out.Write(b); e != nil {
			return 1
		}
		return 0
	}
	hexRunner := len(*runner) == 40 && strings.Trim(*runner, "0123456789abcdef") == ""
	if *mode == "existing-authorized-shape" {
		if !*gate3 || *protocol != shapeProtocolSHA || !hexRunner || *output != expectedShapeOutputPath || *control != expectedControlOutputPath || factory == nil {
			fmt.Fprintln(errw, "data_invalid")
			return 2
		}
		cwd, e := os.Getwd()
		if e != nil {
			fmt.Fprintln(errw, "pipeline_fault")
			return 1
		}
		project := filepath.Clean(cwd)
		return runShapeGate(shapeGatePaths{Protocol: *protocol, Runner: *runner, ShapeOut: *output, ControlOut: *control, Root: filepath.Dir(project), Project: project}, out, errw, factory)
	}
	if *mode == liveShapeMode {
		if !*gate3 || *protocol != liveProtocolSHA || !hexRunner || *output != expectedLiveShapeOutputPath || *control != expectedLiveControlOutputPath || factory == nil {
			fmt.Fprintln(errw, "data_invalid")
			return 2
		}
		cwd, e := os.Getwd()
		if e != nil {
			fmt.Fprintln(errw, "pipeline_fault")
			return 1
		}
		project := filepath.Clean(cwd)
		return runShapeGate(shapeGatePaths{Protocol: *protocol, Authorization: liveAuthorizationSHA, Runner: *runner, ShapeOut: *output, ControlOut: *control, Root: filepath.Dir(project), Project: project, Mode: liveShapeMode, Tag: "ta04f9"}, out, errw, factory)
	}
	if *mode != "existing-authorized" || *protocol != protocolSHA || !hexRunner || *output != expectedOutputPath || *control != "" || *gate3 || factory == nil {
		fmt.Fprintln(errw, "data_invalid")
		return 2
	}
	cwd, e := os.Getwd()
	if e != nil {
		fmt.Fprintln(errw, "pipeline_fault")
		return 1
	}
	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Minute)
	defer cancel()
	cfg := RunConfig{ProtocolSHA: *protocol, RunnerSHA: *runner, OutputPath: *output, ProjectDir: filepath.Clean(cwd)}
	b := factory(cwd)
	m, guard, e := runExisting(ctx, cfg, b)
	if e == nil {
		var body []byte
		body, e = encodeManifest(m)
		if e == nil {
			e = publishExclusive(guard, body)
		}
	}
	if e != nil {
		fmt.Fprintln(errw, "pipeline_fault")
		return 1
	}
	fmt.Fprintf(out, "{\"outcome\":%q}\n", m.Outcome)
	return 0
}

// runShapeGate is the TA-04F8 gate 3 path. It preflights both new outputs,
// reuses the frozen TA-04F7 sweep unchanged and only then publishes the control
// manifest followed by the sanitised shape export, neither of which may
// overwrite an existing file.
type shapeGatePaths struct{ Protocol, Authorization, Runner, ShapeOut, ControlOut, Root, Project, Mode, Tag string }

// revalidateGuards requires every output guard to still describe the same
// ancestors, so a swap under either output invalidates the whole run.
func revalidateGuards(gs ...outputGuard) error {
	for _, g := range gs {
		if e := validateAncestors(filepath.Dir(g.final)); e != nil {
			return e
		}
		if e := compareAncestors(g.ancestors); e != nil {
			return e
		}
	}
	return nil
}

func runShapeGate(p shapeGatePaths, out, errw io.Writer, factory func(string) Backend) int {
	fail := func() int { fmt.Fprintln(errw, "pipeline_fault"); return 1 }
	mode, tag := p.Mode, p.Tag
	if mode == "" {
		mode = shapeMode
	}
	if tag == "" {
		tag = "ta04f8"
	}
	// the four gate 3 paths are proven absent before any backend exists
	controlGuard, e := preflightOutputTagged(p.Root, p.ControlOut, tag, p.Protocol, p.Runner)
	if e != nil {
		return fail()
	}
	shapeGuard, e := preflightOutputTagged(p.Root, p.ShapeOut, tag, p.Protocol, p.Runner)
	if e != nil {
		return fail()
	}
	var key [32]byte
	if _, e = io.ReadFull(rand.Reader, key[:]); e != nil {
		return fail()
	}
	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Minute)
	defer cancel()
	col := &shapeCollector{}
	cfg := RunConfig{ProtocolSHA: p.Protocol, AuthorizationSHA: p.Authorization, RunnerSHA: p.Runner, OutputPath: p.ControlOut, ProjectDir: p.Project, Mode: mode, Shape: col}
	m, e := runExistingCore(ctx, cfg, factory(p.Project), key)
	if e != nil {
		return fail()
	}
	body, e := encodeManifest(m)
	if e != nil {
		return fail()
	}
	shapeBody, e := shapeExportFor(mode, p.Protocol, p.Runner, col.panels, shapeAuthorizedOrdinals)
	if e != nil {
		return fail()
	}
	if e = revalidateGuards(controlGuard, shapeGuard); e != nil {
		return fail()
	}
	if e = publishExclusive(controlGuard, body); e != nil {
		return fail()
	}
	if e = revalidateGuards(controlGuard, shapeGuard); e != nil {
		return fail()
	}
	if e = publishExclusive(shapeGuard, shapeBody); e != nil {
		return fail()
	}
	fmt.Fprintf(out, "{\"outcome\":%q}\n", m.Outcome)
	return 0
}

func main() { os.Exit(runCLI(os.Args[1:], os.Stdout, os.Stderr)) }

func runExisting(ctx context.Context, cfg RunConfig, b Backend) (m Manifest, guard outputGuard, ret error) {
	if b == nil {
		return m, guard, fmt.Errorf("backend")
	}
	var e error
	guard, e = preflightOutput(filepath.Dir(cfg.ProjectDir), cfg.OutputPath, cfg.ProtocolSHA, cfg.RunnerSHA)
	if e != nil {
		return m, guard, e
	}
	var key [32]byte
	if _, e := io.ReadFull(rand.Reader, key[:]); e != nil {
		return m, guard, e
	}
	m, ret = runExistingCore(ctx, cfg, b, key)
	return m, guard, ret
}

func runExistingCore(ctx context.Context, cfg RunConfig, b Backend, key [32]byte) (m Manifest, ret error) {
	if b == nil {
		return m, fmt.Errorf("backend")
	}
	if e := b.Preflight(ctx, cfg); e != nil {
		return m, e
	}
	cleanupNeeded := true
	defer func() {
		if cleanupNeeded {
			if e := b.Cleanup(); e != nil && ret == nil {
				m = Manifest{}
				ret = e
			}
		}
	}()
	pre, e := b.Discover(ctx)
	if e != nil {
		return m, e
	}
	preD := inventoryDigest(key, pre)
	if len(pre) > maxCandidates {
		return m, fmt.Errorf("candidate_cap")
	}
	var staged uint64
	for _, item := range pre {
		var ok bool
		staged, ok = checkedAdd(staged, item.Size)
		if !ok || staged > uint64(maxStagedBytes) {
			return m, fmt.Errorf("staged_cap")
		}
	}
	groups := map[int]*Group{}
	centers := map[int][][]Point{}
	centerRefsOwned := map[int]uint64{}
	centerUnavailable := map[int]bool{}
	runBudget := newLogicalBudgetV1(logicalLimit)
	defer func() { runBudget.release(runBudget.account.Live) }()
	if x, ok := b.(logicalBudgetConsumer); ok {
		x.setLogicalBudget(runBudget)
	}
	if e := runBudget.reserve(logicalMapBase * 4); e != nil {
		return m, e
	}
	invStruct, _ := logicalStructBytes(8 + 8 + 8 + 1 + 1 + 1)
	invSlice, e := logicalSliceBytes(uint64(len(pre)), invStruct)
	if e != nil {
		return m, e
	}
	canonicalSlice, e := logicalSliceBytes(uint64(len(pre)), invStruct)
	if e != nil {
		return m, e
	}
	invBoth, ok := checkedAdd(invSlice, canonicalSlice)
	if !ok {
		return m, errLogicalCap
	}
	if e = runBudget.reserve(invBoth); e != nil {
		return m, e
	}
	for _, item := range pre {
		if !validOpaque(item.ID, maxOpaqueIDBytes) {
			return m, fmt.Errorf("candidate_id")
		}
		n, e := logicalStringBytes(uint64(len(item.ID)))
		if e != nil {
			return m, e
		}
		n2, ok := checkedMul(n, 2)
		if !ok {
			return m, errLogicalCap
		}
		if e = runBudget.reserve(n2); e != nil {
			return m, e
		}
	}
	pop := Population{InventoryCandidates: len(pre)}
	seen := map[string]bool{}
	groupOrdinals := map[string]int{}
	totalLaps := 0
	for _, c := range canonicalInventory(pre) {
		r, e := b.Process(ctx, c)
		if e != nil {
			return m, e
		}
		switch r.Class {
		case "authorization":
			pop.AuthorizationRejected++
		case "stability":
			pop.StabilityRejected++
		case "artifact_guard":
			pop.ArtifactGuardRejected++
		case "data_invalid":
			pop.DataInvalid++
		case "insufficient_laps", "accepted":
			if !validOpaque(r.SessionID, maxOpaqueIDBytes) {
				return m, fmt.Errorf("session")
			}
			if seen[r.SessionID] {
				pop.Duplicates++
				continue
			}
			if e = reserveMapString(runBudget, r.SessionID, logicalBool); e != nil {
				return m, e
			}
			seen[r.SessionID] = true
			if !validGroupToken(r.GroupToken) {
				return m, fmt.Errorf("group")
			}
			r.GroupOrdinal = groupOrdinals[r.GroupToken]
			if r.GroupOrdinal == 0 {
				if e = reserveMapString(runBudget, r.GroupToken, logicalInt64); e != nil {
					return m, e
				}
				r.GroupOrdinal = len(groupOrdinals) + 1
				if e = reserveGroupAux(runBudget, r.GroupOrdinal, centers, centerRefsOwned, centerUnavailable); e != nil {
					return m, e
				}
				groupOrdinals[r.GroupToken] = r.GroupOrdinal
			}
			pop.CanonicalRecordings++
			if r.Class == "accepted" {
				if r.Laps < 2 || totalLaps > 20_000-r.Laps {
					return m, fmt.Errorf("resource_cap")
				}
				totalLaps += r.Laps
			}
			if r.GroupOrdinal < 1 || r.GroupOrdinal > 512 || r.Laps > 20_000 {
				return m, fmt.Errorf("retained_cap")
			}
			g := groups[r.GroupOrdinal]
			if g == nil {
				entry, _ := logicalStructBytes(logicalInt64 + 8)
				if e = runBudget.reserve(entry); e != nil {
					return m, e
				}
				g = &Group{GroupOrdinal: r.GroupOrdinal}
				groups[r.GroupOrdinal] = g
			}
			g.DiscoveredRecordings++
			if r.Class == "insufficient_laps" {
				pop.InsufficientLapsRecordings++
				g.InsufficientLapsRecordings++
				continue
			}
			pop.EligibleRecordings++
			g.EligibleRecordings++
			if len(r.Centerline) == gridSize {
				backing, e := structSliceBytes(gridSize, 2*logicalFloat64)
				if e != nil {
					return m, e
				}
				old := centerRefsOwned[r.GroupOrdinal]
				refs, e := logicalSliceBytes(uint64(len(centers[r.GroupOrdinal])+1), 8)
				if e != nil {
					return m, e
				}
				both, ok := checkedAdd(backing, refs)
				if !ok {
					return m, errLogicalCap
				}
				if e = runBudget.reserve(both); e != nil {
					return m, e
				}
				next := make([][]Point, len(centers[r.GroupOrdinal]), len(centers[r.GroupOrdinal])+1)
				copy(next, centers[r.GroupOrdinal])
				next = append(next, r.Centerline)
				centers[r.GroupOrdinal] = next
				runBudget.release(old)
				centerRefsOwned[r.GroupOrdinal] = refs
			} else {
				centerUnavailable[r.GroupOrdinal] = true
			}
			g.EvaluatedSlots += r.Laps
			g.PassedSlots += r.Pass
			g.FailedThresholdSlots += r.FailThreshold
			g.FailedEvalGeometrySlots += r.FailGeometry
			g.FailedTrainingFoldSlots += r.FailTraining
			if r.Contributing {
				g.ContributingRecordings++
				if r.Passing {
					g.PassingRecordings++
				} else {
					g.FailingRecordings++
				}
			} else {
				g.CrossfitInsufficientRecordings++
			}
		default:
			return m, fmt.Errorf("class")
		}
	}
	e = b.Cleanup()
	cleanupNeeded = false
	if e != nil {
		return m, e
	}
	post, e := b.Discover(ctx)
	if e != nil {
		return m, e
	}
	if preD != inventoryDigest(key, post) {
		return m, fmt.Errorf("inventory_changed")
	}
	ordBytes, e := logicalSliceBytes(uint64(len(groups)), logicalInt64)
	if e != nil {
		return m, e
	}
	if e = runBudget.reserve(ordBytes); e != nil {
		return m, e
	}
	ord := make([]int, len(groups))
	i := 0
	for x := range groups {
		ord[i] = x
		i++
	}
	sortInts(ord)
	gs := make([]Group, 0, len(ord))
	groupStruct, _ := logicalStructBytes(15*logicalInt64 + 2*16)
	groupSlice, e := logicalSliceBytes(uint64(len(ord)), groupStruct)
	if e != nil {
		return m, e
	}
	if e = runBudget.reserve(groupSlice); e != nil {
		return m, e
	}
	complete := false
	for _, x := range ord {
		g := groups[x]
		if !centerUnavailable[x] && len(centers[x]) == g.EligibleRecordings {
			scratch, e := logicalSliceBytes(uint64(len(centers[x])*gridSize*3), 48)
			if e != nil {
				return m, e
			}
			if e = runBudget.reserve(scratch); e != nil {
				return m, e
			}
			e = diagnoseGroupCenterline(centers[x], groupCenterline)
			runBudget.release(scratch)
			if e != nil {
				return m, e
			}
		}
		g.Decision = decision(g.EligibleRecordings, g.PassingRecordings, g.FailingRecordings, g.CrossfitInsufficientRecordings)
		g.CrossRecordingConfidence = confidence(g.ContributingRecordings)
		if cfg.Shape != nil && g.Decision == "technical_go_local_shape_local_only" {
			if centerUnavailable[x] || len(centers[x]) != 1 {
				return m, fmt.Errorf("shape_unavailable")
			}
			pts, e := canonicalShape(centers[x][0])
			if e != nil {
				return m, e
			}
			n, e := logicalSliceBytes(gridSize, 2*logicalFloat64)
			if e != nil {
				return m, e
			}
			if e = runBudget.reserve(n); e != nil {
				return m, e
			}
			cfg.Shape.panels = append(cfg.Shape.panels, ShapePanel{x, g.Decision, g.CrossRecordingConfidence, pts})
		}
		if g.Decision != "stop_insufficient" {
			complete = true
		}
		gs = append(gs, *g)
	}
	outcome := "stop_insufficient"
	if complete {
		outcome = "analysis_complete"
	}
	m = Manifest{Version: "ta04f7/v1", ProtocolSHA: cfg.ProtocolSHA, RunnerSHA: cfg.RunnerSHA, Mode: cfg.Mode, Outcome: outcome, InventoryStable: true, Population: pop, Groups: gs, Cleanup: b.Ledger(), LocalShape: "unknown"}
	if e = m.Validate(); e != nil {
		return m, e
	}
	preview, e := encodeManifest(m)
	if e != nil {
		return m, e
	}
	if e = runBudget.reserve(uint64(len(preview)) + logicalSliceHeader); e != nil {
		clear(preview)
		return Manifest{}, e
	}
	clear(preview)
	return m, nil
}
func canonicalInventory(v []InventoryItem) []InventoryItem {
	x := append([]InventoryItem(nil), v...)
	sort.SliceStable(x, func(i, j int) bool {
		if !x[i].Modified.Equal(x[j].Modified) {
			return x[i].Modified.Before(x[j].Modified)
		}
		if x[i].Size != x[j].Size {
			return x[i].Size < x[j].Size
		}
		return x[i].ID < x[j].ID
	})
	return x
}
func sortInts(v []int) { sort.Ints(v) }
