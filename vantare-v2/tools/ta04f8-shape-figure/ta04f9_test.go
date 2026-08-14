package main

import (
	"bytes"
	"math"
	"strings"
	"testing"
)

func liveFigureFixture() shapeExport {
	panels := make([]shapePanel, 2)
	for p, ordinal := range []int{1, 37} {
		shape := make([][2]float64, gridSize)
		for i := range shape {
			a := 2 * math.Pi * float64(i) / gridSize
			shape[i] = [2]float64{math.Round(1000*math.Cos(a)) / 10, math.Round(500*math.Sin(a)) / 10}
		}
		panels[p] = shapePanel{GroupOrdinal: ordinal, Decision: "technical_go_local_shape_local_only", CrossRecordingConfidence: "none", Shape: shape}
	}
	return shapeExport{Version: "ta04f9/v1", ProtocolSHA: liveFigureProtocolSHA, RunnerSHA: strings.Repeat("1", 40), Mode: liveFigureMode, Grid: gridSize, Units: "relative_metres", Panels: panels, LocalShape: "unknown"}
}

func TestTA04F9CLIProfileIsExplicit(t *testing.T) {
	body, err := encodeCanonicalFor(liveFigureProfile, liveFigureFixture())
	if err != nil {
		t.Fatal(err)
	}
	var out, errw bytes.Buffer
	if code := run([]string{"-profile=ta04f9"}, &out, &errw, bytes.NewReader(body)); code != 0 {
		t.Fatalf("exit=%d stderr=%q", code, errw.String())
	}
	out.Reset()
	errw.Reset()
	if code := run(nil, &out, &errw, bytes.NewReader(body)); code != 2 {
		t.Fatalf("F9 accepted by default F8 profile: %d", code)
	}
}

func TestTA04F9ProfileAcceptsOnlyLiveExport(t *testing.T) {
	x := liveFigureFixture()
	body, err := encodeCanonicalFor(liveFigureProfile, x)
	if err != nil {
		t.Fatal(err)
	}
	svg, err := renderSVGFor(liveFigureProfile, body)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Contains(svg, []byte(`viewBox="0 0 860 500"`)) {
		t.Fatal("fixed viewBox missing")
	}
	for _, line := range footer {
		if !bytes.Contains(svg, []byte(escapeText(line))) {
			t.Fatalf("footer line missing: %s", line)
		}
	}
	for _, forbidden := range []string{"<script", "<image", "href=", "marker-end", "tick", "grid"} {
		if bytes.Contains(bytes.ToLower(svg), []byte(forbidden)) {
			t.Fatalf("forbidden SVG token %q", forbidden)
		}
	}

	old := x
	old.Version = "ta04f8/v1"
	old.ProtocolSHA = shapeProtocolSHA
	old.Mode = "existing-authorized-shape"
	if _, err := encodeCanonicalFor(liveFigureProfile, old); err == nil {
		t.Fatal("TA-04F8 accepted by TA-04F9 profile")
	}
	for name, mutate := range map[string]func(*shapeExport){
		"mode":         func(v *shapeExport) { v.Mode = "other" },
		"sha":          func(v *shapeExport) { v.ProtocolSHA = strings.Repeat("2", 40) },
		"one panel":    func(v *shapeExport) { v.Panels = v.Panels[:1] },
		"three panels": func(v *shapeExport) { v.Panels = append(v.Panels, v.Panels[0]) },
		"ordinal":      func(v *shapeExport) { v.Panels[1].GroupOrdinal = 36 },
	} {
		t.Run(name, func(t *testing.T) {
			bad := liveFigureFixture()
			mutate(&bad)
			if _, err := encodeCanonicalFor(liveFigureProfile, bad); err == nil {
				t.Fatal("invalid export accepted")
			}
		})
	}
}
