package overlayv2

import (
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/derive"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/envelope"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
)

func TestRelativeSettlerHoldsBoundedMembershipUntilSevenSeconds(t *testing.T) {
	t.Parallel()
	snapshot := builderFinalState(t, 37)
	final, ok := snapshot.Value()
	if !ok {
		t.Fatal("missing final")
	}
	header := snapshot.Header()
	start := cadenceOrigin
	settler := relativeSettler{}
	first := settledRows("vehicle-022", "vehicle-024", "vehicle-000", "vehicle-027", "vehicle-036")
	second := settledRows("vehicle-024", "vehicle-027", "vehicle-000", "vehicle-004", "vehicle-036")
	third := settledRows("vehicle-027", "vehicle-004", "vehicle-000", "vehicle-018", "vehicle-036")
	if got := settler.project(final, first, header, start); !sameRelativeIDs(relativeIDs(got), relativeIDs(first)) {
		t.Fatalf("first=%v", relativeIDs(got))
	}
	if got := settler.project(final, second, header, start.Add(time.Second)); !sameRelativeIDs(relativeIDs(got), relativeIDs(first)) {
		t.Fatalf("early replacement=%v", relativeIDs(got))
	}
	if got := settler.project(final, third, header, start.Add(2*time.Second)); !sameRelativeIDs(relativeIDs(got), relativeIDs(first)) {
		t.Fatalf("pending composition change must keep the original window: %v", relativeIDs(got))
	}
	if got := settler.project(final, third, header, start.Add(7*time.Second+999*time.Millisecond)); !sameRelativeIDs(relativeIDs(got), relativeIDs(first)) {
		t.Fatalf("6.999s from first change must hold=%v", relativeIDs(got))
	}
	if got := settler.project(final, third, header, start.Add(8*time.Second)); !sameRelativeIDs(relativeIDs(got), relativeIDs(third)) {
		t.Fatalf("7.000s from first change must accept=%v", relativeIDs(got))
	}
}

func TestRelativeSettlerBoundsOrderedWindowChurnAcrossWindows(t *testing.T) {
	t.Parallel()
	snapshot := builderFinalState(t, 37)
	final, ok := snapshot.Value()
	if !ok {
		t.Fatal("missing final")
	}
	header := snapshot.Header()
	start := cadenceOrigin
	settler := relativeSettler{}
	accepted := settledRows("vehicle-022", "vehicle-024", "vehicle-000", "vehicle-027", "vehicle-036")
	reordered := settledRows("vehicle-024", "vehicle-022", "vehicle-000", "vehicle-036", "vehicle-027")
	replacement := settledRows("vehicle-024", "vehicle-027", "vehicle-000", "vehicle-004", "vehicle-036")
	settler.project(final, accepted, header, start)

	// Primera ventana: el churn continuo no reinicia la espera; al vencer se
	// publica el ultimo candidato canonico vigente, no un flip por frame.
	churn := []struct {
		at        time.Duration
		candidate []RelativeRowV2
	}{
		{2 * time.Second, reordered},
		{4 * time.Second, replacement},
		{6 * time.Second, reordered},
		{8 * time.Second, replacement},
	}
	for index, sample := range churn {
		got := settler.project(final, sample.candidate, header, start.Add(sample.at))
		if !sameRelativeIDs(relativeIDs(got), relativeIDs(accepted)) {
			t.Fatalf("window 1 churn sample %d published early: %v", index, relativeIDs(got))
		}
	}
	// Ventana abierta en t=2s: el tope de 7s cae en t=9s con el ultimo vigente.
	latest := settledRows("vehicle-027", "vehicle-004", "vehicle-000", "vehicle-018", "vehicle-036")
	got := settler.project(final, latest, header, start.Add(9*time.Second))
	if !sameRelativeIDs(relativeIDs(got), relativeIDs(latest)) {
		t.Fatalf("window 1 did not publish latest canonical at cap: %v", relativeIDs(got))
	}
	// Segunda ventana: tras publicar, el siguiente cambio abre otra espera
	// completa; no hay flip cada frame y la separacion ordinaria es >= 7s.
	next := settledRows("vehicle-004", "vehicle-018", "vehicle-000", "vehicle-005", "vehicle-036")
	if got := settler.project(final, next, header, start.Add(10*time.Second)); !sameRelativeIDs(relativeIDs(got), relativeIDs(latest)) {
		t.Fatalf("window 2 must hold after publish: %v", relativeIDs(got))
	}
	other := settledRows("vehicle-018", "vehicle-005", "vehicle-000", "vehicle-006", "vehicle-036")
	if got := settler.project(final, other, header, start.Add(12*time.Second)); !sameRelativeIDs(relativeIDs(got), relativeIDs(latest)) {
		t.Fatalf("window 2 churn must hold: %v", relativeIDs(got))
	}
	if got := settler.project(final, other, header, start.Add(17*time.Second)); !sameRelativeIDs(relativeIDs(got), relativeIDs(other)) {
		t.Fatalf("window 2 did not publish latest canonical at cap: %v", relativeIDs(got))
	}
}

func TestRelativeSettlerCancelsPendingWhenCandidateReturnsToAccepted(t *testing.T) {
	t.Parallel()
	snapshot := builderFinalState(t, 37)
	final, ok := snapshot.Value()
	if !ok {
		t.Fatal("missing final")
	}
	header := snapshot.Header()
	start := cadenceOrigin
	settler := relativeSettler{}
	accepted := settledRows("vehicle-022", "vehicle-024", "vehicle-000", "vehicle-027", "vehicle-036")
	replacement := settledRows("vehicle-024", "vehicle-027", "vehicle-000", "vehicle-004", "vehicle-036")
	settler.project(final, accepted, header, start)
	settler.project(final, replacement, header, start.Add(time.Second))
	// Vuelta temporal al aceptado antes del tope: cancela sin publicar.
	if got := settler.project(final, accepted, header, start.Add(3*time.Second)); !sameRelativeIDs(relativeIDs(got), relativeIDs(accepted)) {
		t.Fatalf("return to accepted must cancel: %v", relativeIDs(got))
	}
	// La divergencia posterior abre una ventana fresca completa.
	if got := settler.project(final, replacement, header, start.Add(4*time.Second)); !sameRelativeIDs(relativeIDs(got), relativeIDs(accepted)) {
		t.Fatalf("fresh window must hold: %v", relativeIDs(got))
	}
	if got := settler.project(final, replacement, header, start.Add(10*time.Second+999*time.Millisecond)); !sameRelativeIDs(relativeIDs(got), relativeIDs(accepted)) {
		t.Fatalf("fresh window must hold before 7s: %v", relativeIDs(got))
	}
	if got := settler.project(final, replacement, header, start.Add(11*time.Second)); !sameRelativeIDs(relativeIDs(got), relativeIDs(replacement)) {
		t.Fatalf("fresh window must publish at 7s: %v", relativeIDs(got))
	}
}

func TestRelativeSettlerDoesNotPublishEarlyWhenInjectedClockMovesBackwards(t *testing.T) {
	t.Parallel()
	snapshot := builderFinalState(t, 37)
	final, ok := snapshot.Value()
	if !ok {
		t.Fatal("missing final")
	}
	header := snapshot.Header()
	start := cadenceOrigin
	settler := relativeSettler{}
	accepted := settledRows("vehicle-022", "vehicle-024", "vehicle-000", "vehicle-027", "vehicle-036")
	replacement := settledRows("vehicle-024", "vehicle-027", "vehicle-000", "vehicle-004", "vehicle-036")
	settler.project(final, accepted, header, start)
	settler.project(final, replacement, header, start.Add(time.Second))
	got := settler.project(final, replacement, header, start.Add(-time.Second))
	if !sameRelativeIDs(relativeIDs(got), relativeIDs(accepted)) {
		t.Fatalf("backwards clock published candidate early: %v", relativeIDs(got))
	}
	got = settler.project(final, replacement, header, start.Add(8*time.Second))
	if !sameRelativeIDs(relativeIDs(got), relativeIDs(replacement)) {
		t.Fatalf("original monotonic deadline did not publish: %v", relativeIDs(got))
	}
}

func TestRelativeSettlerRehydratesEvictedObservedIDAndResetsOnRealAbsence(t *testing.T) {
	t.Parallel()
	snapshot := builderFinalState(t, 37)
	final, ok := snapshot.Value()
	if !ok {
		t.Fatal("missing final")
	}
	header := snapshot.Header()
	start := cadenceOrigin
	settler := relativeSettler{}
	accepted := settledRows("vehicle-022", "vehicle-024", "vehicle-000", "vehicle-027", "vehicle-036")
	candidate := settledRows("vehicle-024", "vehicle-027", "vehicle-000", "vehicle-004", "vehicle-036")
	settler.project(final, accepted, header, start)
	// vehicle-022 is no longer in the immediate candidate but remains observed:
	// it must stay, in accepted order, with fields rebuilt from this final state.
	final.Observed.Vehicles[22].Position = builderField(t, standings.Position(77), schema.FreshnessFresh)
	got := settler.project(final, candidate, header, start.Add(time.Second))
	if got[0].VehicleID != "vehicle-022" || got[0].Position != 77 {
		t.Fatalf("evicted observed row was stale or replaced: %#v", got)
	}
	// Missing Position must use the same sorted canonical fallback as
	// BuildRelative, not the source slice index; live row fields also refresh.
	final.Observed.Vehicles[22].Position = schema.MissingField[standings.Position]()
	final.Observed.Vehicles[22].LastLapTime = builderField(t, standings.LapTime(123.456), schema.FreshnessFresh)
	settler.project(final, accepted, header, start.Add(3*time.Second))
	got = settler.project(final, candidate, header, start.Add(4*time.Second))
	wantPosition := resolvedRelativePositions(final.Observed.Vehicles)["vehicle-022"]
	if got[0].Position != wantPosition || got[0].LastLapSeconds.V != 123.456 {
		t.Fatalf("rehydration diverged from canonical position/live fields: got=%#v wantPosition=%d", got[0], wantPosition)
	}
	final.Observed.Vehicles = append(final.Observed.Vehicles[:22], final.Observed.Vehicles[23:]...)
	got = settler.project(final, candidate, header, start.Add(5*time.Second))
	if !sameRelativeIDs(relativeIDs(got), relativeIDs(candidate)) {
		t.Fatalf("real disappearance must reset immediately: %v", relativeIDs(got))
	}
}

func TestRelativeSettlerIsPerInstanceAndBoundsItsOutput(t *testing.T) {
	t.Parallel()
	snapshot := builderFinalState(t, 37)
	final, ok := snapshot.Value()
	if !ok {
		t.Fatal("missing final")
	}
	header := snapshot.Header()
	first := BuildRelative(final)
	if len(first) > MaxRelativeAhead+1+MaxRelativeBehind {
		t.Fatalf("unbounded=%d", len(first))
	}
	left, right := relativeSettler{}, relativeSettler{}
	left.project(final, first, header, cadenceOrigin)
	changed := append([]RelativeRowV2(nil), first...)
	changed[0].VehicleID = "vehicle-020"
	rightGot := right.project(final, changed, header, cadenceOrigin)
	if !sameRelativeIDs(relativeIDs(rightGot), relativeIDs(changed)) {
		t.Fatal("projector state leaked between instances")
	}
}

func TestProjectV2SettledIsPureImmediateBootstrapAndNoPlayerResets(t *testing.T) {
	t.Parallel()
	for _, count := range []int{1, 20, 44, 104} {
		snapshot := builderFinalState(t, count)
		update, err := ProjectV2(snapshot, builderSourceContext(), DefaultPreferencesV2(), 1)
		if err != nil || update.Frame == nil {
			t.Fatalf("ProjectV2(%d): %v", count, err)
		}
		if !sameRelativeIDs(relativeIDs(update.Frame.RelativeSettled), relativeIDs(update.Frame.Relative)) {
			t.Fatalf("bootstrap differs at %d", count)
		}
	}
	snapshot := builderFinalState(t, 20)
	final, ok := snapshot.Value()
	if !ok {
		t.Fatal("missing final")
	}
	for i := range final.Observed.Vehicles {
		final.Observed.Vehicles[i].Player = builderField(t, false, schema.FreshnessFresh)
	}
	settler := relativeSettler{}
	if got := settler.project(final, BuildRelative(final), snapshot.Header(), cadenceOrigin); len(got) != 0 {
		t.Fatalf("no player must reset immediately: %#v", got)
	}
}

func TestCachedProjectorSettledResetsPerSessionEpochAndPlayer(t *testing.T) {
	t.Parallel()
	base := builderFinalState(t, 37)
	state, ok := base.Value()
	if !ok {
		t.Fatal("missing final")
	}
	project := func(projector *CachedProjector, header envelope.Header, value derive.FinalState, now time.Time) UpdateV2 {
		snapshot, err := envelope.NewSnapshot(header, value, cloneFinalState)
		if err != nil {
			t.Fatal(err)
		}
		update, err := projector.Project(snapshot, builderSourceContext(), DefaultPreferencesV2(), uint64(header.Cursor.Sequence), now)
		if err != nil {
			t.Fatal(err)
		}
		return update
	}
	cases := []struct {
		name   string
		mutate func(*envelope.Header, *derive.FinalState)
	}{
		{"session", func(h *envelope.Header, _ *derive.FinalState) { h.Identity.Session = "new-session" }},
		{"epoch", func(h *envelope.Header, _ *derive.FinalState) { h.Cursor.Epoch++ }},
		{"player", func(_ *envelope.Header, s *derive.FinalState) {
			s.Observed.Vehicles[0].Player = builderField(t, false, schema.FreshnessFresh)
			s.Observed.Vehicles[1].Player = builderField(t, true, schema.FreshnessFresh)
		}},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			projector := NewCachedProjector(SectionCadence{})
			project(projector, base.Header(), state, cadenceOrigin)
			header, value := base.Header(), cloneFinalState(state)
			header.Cursor.Sequence++
			testCase.mutate(&header, &value)
			got := project(projector, header, value, cadenceOrigin.Add(time.Second))
			if got.Frame == nil || !sameRelativeIDs(relativeIDs(got.Frame.RelativeSettled), relativeIDs(got.Frame.Relative)) {
				t.Fatalf("reset did not bootstrap: %#v", got.Frame)
			}
		})
	}
}

func TestCachedProjectorsKeepIndependentSettledAuthority(t *testing.T) {
	t.Parallel()
	base := builderFinalState(t, 37)
	windowA := settledRows("vehicle-022", "vehicle-024", "vehicle-000", "vehicle-027", "vehicle-036")
	windowB := settledRows("vehicle-024", "vehicle-027", "vehicle-000", "vehicle-004", "vehicle-036")
	leftCalls := 0
	left := NewCachedProjectorWithBuilders(SectionCadence{}, SectionBuilders{Relative: func(derive.FinalState, PreferencesV2, SourceContextV2) []RelativeRowV2 {
		leftCalls++
		if leftCalls == 1 {
			return windowA
		}
		return windowB
	}})
	right := NewCachedProjectorWithBuilders(SectionCadence{}, SectionBuilders{Relative: func(derive.FinalState, PreferencesV2, SourceContextV2) []RelativeRowV2 { return windowB }})
	project := func(projector *CachedProjector, revision uint64) UpdateV2 {
		update, err := projector.Project(base, builderSourceContext(), DefaultPreferencesV2(), revision, cadenceOrigin.Add(time.Duration(revision)*time.Second))
		if err != nil {
			t.Fatal(err)
		}
		return update
	}
	project(left, 1)
	leftHeld := project(left, 2)
	rightStarted := project(right, 1)
	if leftHeld.Frame == nil || rightStarted.Frame == nil || !sameRelativeIDs(relativeIDs(leftHeld.Frame.RelativeSettled), relativeIDs(windowA)) || !sameRelativeIDs(relativeIDs(rightStarted.Frame.RelativeSettled), relativeIDs(windowB)) {
		t.Fatalf("CachedProjector authority leaked: left=%v right=%v", relativeIDs(leftHeld.Frame.RelativeSettled), relativeIDs(rightStarted.Frame.RelativeSettled))
	}
}

func TestRelativeSettlerCapsContinuousChurnAtSevenSecondsFromFirstChange(t *testing.T) {
	t.Parallel()
	snapshot := builderFinalState(t, 37)
	final, ok := snapshot.Value()
	if !ok {
		t.Fatal("missing final")
	}
	header := snapshot.Header()
	start := cadenceOrigin
	settler := relativeSettler{}
	accepted := settledRows("vehicle-022", "vehicle-024", "vehicle-000", "vehicle-027", "vehicle-036")
	if got := settler.project(final, accepted, header, start); !sameRelativeIDs(relativeIDs(got), relativeIDs(accepted)) {
		t.Fatalf("bootstrap=%v", relativeIDs(got))
	}
	// Trafico real 2026-09-03: cada candidato valido cambia ID/orden mientras los
	// aceptados siguen observados. La espera queda acotada a 7s desde el primer
	// cambio pendiente y publica el candidato canonico vigente al vencer.
	windows := [][]RelativeRowV2{
		settledRows("vehicle-024", "vehicle-027", "vehicle-000", "vehicle-004", "vehicle-036"),
		settledRows("vehicle-027", "vehicle-004", "vehicle-000", "vehicle-018", "vehicle-036"),
		settledRows("vehicle-004", "vehicle-018", "vehicle-000", "vehicle-005", "vehicle-036"),
		settledRows("vehicle-018", "vehicle-005", "vehicle-000", "vehicle-006", "vehicle-036"),
		settledRows("vehicle-005", "vehicle-006", "vehicle-000", "vehicle-007", "vehicle-036"),
		settledRows("vehicle-006", "vehicle-007", "vehicle-000", "vehicle-008", "vehicle-036"),
		settledRows("vehicle-007", "vehicle-008", "vehicle-000", "vehicle-009", "vehicle-036"),
		settledRows("vehicle-008", "vehicle-009", "vehicle-000", "vehicle-010", "vehicle-036"),
	}
	for i, candidate := range windows[:6] {
		got := settler.project(final, candidate, header, start.Add(time.Duration(i+1)*time.Second))
		if !sameRelativeIDs(relativeIDs(got), relativeIDs(accepted)) {
			t.Fatalf("t=%ds published during capped wait: %v", i+1, relativeIDs(got))
		}
	}
	got := settler.project(final, windows[6], header, start.Add(7*time.Second))
	if !sameRelativeIDs(relativeIDs(got), relativeIDs(accepted)) {
		t.Fatalf("t<7s must hold accepted: %v", relativeIDs(got))
	}
	got = settler.project(final, windows[7], header, start.Add(8*time.Second))
	if !sameRelativeIDs(relativeIDs(got), relativeIDs(windows[7])) {
		t.Fatalf("capped wait must publish latest canonical at t=7s from first change: %v", relativeIDs(got))
	}
}

func TestRelativeSettlerReplaysVisibleFiveRowFieldSequence(t *testing.T) {
	t.Parallel()
	snapshot := builderFinalState(t, 37)
	final, ok := snapshot.Value()
	if !ok {
		t.Fatal("missing final")
	}
	header := snapshot.Header()
	start := cadenceOrigin
	// Secuencia visible de 5 filas (±2 alrededor del player, vehicle-000)
	// derivada de relative-canonical-20260903.json: 14 firmas canonicas
	// distintas frente a 1 settled, mismatch en 25/25 muestras. Los IDs se
	// trasladan al rig vehicle-000..036 manteniendo player central y firmas
	// ordenadas distintas; el archivo fisico no se versiona en el repo.
	sig := func(ids ...string) []RelativeRowV2 { return settledRows(ids...) }
	field := [][]RelativeRowV2{
		sig("vehicle-021", "vehicle-030", "vehicle-000", "vehicle-009", "vehicle-020"),
		sig("vehicle-021", "vehicle-030", "vehicle-000", "vehicle-009", "vehicle-020"),
		sig("vehicle-020", "vehicle-009", "vehicle-000", "vehicle-031", "vehicle-032"),
		sig("vehicle-020", "vehicle-009", "vehicle-000", "vehicle-031", "vehicle-032"),
		sig("vehicle-020", "vehicle-009", "vehicle-000", "vehicle-031", "vehicle-032"),
		sig("vehicle-030", "vehicle-009", "vehicle-000", "vehicle-033", "vehicle-031"),
		sig("vehicle-009", "vehicle-033", "vehicle-000", "vehicle-031", "vehicle-032"),
		sig("vehicle-009", "vehicle-033", "vehicle-000", "vehicle-031", "vehicle-032"),
		sig("vehicle-033", "vehicle-009", "vehicle-000", "vehicle-031", "vehicle-032"),
		sig("vehicle-033", "vehicle-009", "vehicle-000", "vehicle-031", "vehicle-032"),
		sig("vehicle-033", "vehicle-009", "vehicle-000", "vehicle-031", "vehicle-026"),
		sig("vehicle-033", "vehicle-009", "vehicle-000", "vehicle-026", "vehicle-034"),
		sig("vehicle-009", "vehicle-026", "vehicle-000", "vehicle-034", "vehicle-031"),
		sig("vehicle-026", "vehicle-034", "vehicle-000", "vehicle-031", "vehicle-032"),
		sig("vehicle-026", "vehicle-034", "vehicle-000", "vehicle-035", "vehicle-031"),
		sig("vehicle-026", "vehicle-034", "vehicle-000", "vehicle-035", "vehicle-031"),
		sig("vehicle-034", "vehicle-035", "vehicle-000", "vehicle-031", "vehicle-032"),
		sig("vehicle-034", "vehicle-035", "vehicle-000", "vehicle-031", "vehicle-032"),
		sig("vehicle-034", "vehicle-035", "vehicle-000", "vehicle-031", "vehicle-032"),
		sig("vehicle-034", "vehicle-035", "vehicle-000", "vehicle-031", "vehicle-032"),
		sig("vehicle-034", "vehicle-035", "vehicle-000", "vehicle-029", "vehicle-027"),
		sig("vehicle-034", "vehicle-035", "vehicle-000", "vehicle-029", "vehicle-027"),
		sig("vehicle-035", "vehicle-029", "vehicle-000", "vehicle-027", "vehicle-031"),
		sig("vehicle-029", "vehicle-027", "vehicle-000", "vehicle-031", "vehicle-032"),
		sig("vehicle-029", "vehicle-027", "vehicle-000", "vehicle-031", "vehicle-032"),
	}
	settler := relativeSettler{}
	outputs := make([][]string, len(field))
	for second, candidate := range field {
		got := settler.project(final, candidate, header, start.Add(time.Duration(second)*time.Second))
		outputs[second] = relativeIDs(got)
	}
	if !sameRelativeIDs(outputs[0], relativeIDs(field[0])) {
		t.Fatalf("bootstrap=%v", outputs[0])
	}
	// El bug real dejaba outputs[1:] == bootstrap en 25/25; con el tope la
	// vista avanza: primera publicacion en t=9 (ventana abierta en t=2) y
	// segunda en t=17 (ventana abierta en t=10).
	changes := []int{}
	for second := 1; second < len(outputs); second++ {
		if !sameRelativeIDs(outputs[second], outputs[second-1]) {
			changes = append(changes, second)
		}
	}
	if len(changes) != 2 || changes[0] != 9 || changes[1] != 17 {
		t.Fatalf("bounded publications=%v want [9 17]", changes)
	}
	if gap := changes[1] - changes[0]; gap < 7 {
		t.Fatalf("ordinary separation=%ds want >=7s", gap)
	}
	if !sameRelativeIDs(outputs[24], relativeIDs(field[17])) {
		t.Fatalf("final settled=%v want last published %v", outputs[24], relativeIDs(field[17]))
	}
	// La ultima ventana (abierta en t=20) sigue correctamente en espera a t=24.
	if sameRelativeIDs(outputs[24], relativeIDs(field[24])) {
		t.Fatalf("open window must still hold at t=24: %v", outputs[24])
	}
}

func settledRows(ids ...string) []RelativeRowV2 {
	sides := []string{RelativeSideAhead, RelativeSideAhead, RelativeSidePlayer, RelativeSideBehind, RelativeSideBehind}
	rows := make([]RelativeRowV2, len(ids))
	for i, id := range ids {
		rows[i] = RelativeRowV2{VehicleID: id, Side: sides[i], GapSeconds: QValue[float64]{Q: QualityFresh}}
	}
	return rows
}
