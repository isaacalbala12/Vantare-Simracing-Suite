package main

import (
	"bytes"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

const grid = 1000

// fixture builds a canonical shape export for the given ordinals. The shape is
// an axis aligned ellipse with the given semi axes.
func fixture(ordinals []int, a, b float64, protocol string) []byte {
	var s strings.Builder
	s.WriteString("{\n  \"version\": \"ta04f8/v1\",\n  \"protocol_sha\": \"" + protocol + "\",\n  \"runner_sha\": \"synthetic\",\n  \"mode\": \"existing-authorized-shape\",\n  \"grid\": 1000,\n  \"units\": \"relative_metres\",\n  \"scale_is_geodetic\": false,\n  \"orientation_is_absolute\": false,\n  \"panels\": [\n")
	for p, ord := range ordinals {
		s.WriteString(fmt.Sprintf("    {\n      \"group_ordinal\": %d,\n      \"decision\": \"technical_go_local_shape_local_only\",\n      \"cross_recording_confidence\": \"none\",\n      \"shape\": [\n", ord))
		for i := 0; i < grid; i++ {
			th := 2 * math.Pi * (float64(i) + 0.5) / grid
			x := math.Round(a*math.Cos(th)*10) / 10
			y := math.Round(b*math.Sin(th)*10) / 10
			sep := ","
			if i == grid-1 {
				sep = ""
			}
			s.WriteString("        [" + strconv.FormatFloat(x, 'f', 1, 64) + ", " + strconv.FormatFloat(y, 'f', 1, 64) + "]" + sep + "\n")
		}
		sep := ","
		if p == len(ordinals)-1 {
			sep = ""
		}
		s.WriteString("      ]\n    }" + sep + "\n")
	}
	s.WriteString("  ],\n  \"local_shape\": \"unknown\",\n  \"product_map_authorization\": false\n}\n")
	return []byte(s.String())
}

func good() []byte { return fixture([]int{1, 37}, 100, 60, shapeProtocolSHA) }

// custodyErratumSHA is the ta04f8 gate 3 preflight protocol anchor erratum.
const custodyErratumSHA = "bc13c7015a44b108ed63e1c00d70e43811acb57e"

func TestFigureProtocolSHAMatchesCustodyErratum(t *testing.T) {
	if shapeProtocolSHA != custodyErratumSHA {
		t.Fatalf("shapeProtocolSHA = %q, want %q", shapeProtocolSHA, custodyErratumSHA)
	}
	// documents pinned to any superseded erratum must not render
	for _, old := range []string{"5eb20564739c883cd067f3dff44f314616f75064", "9311eab261b717f5ba80cc9f3f808d7c65d82725"} {
		if _, err := renderSVG(fixture([]int{1, 37}, 100, 60, old)); err == nil {
			t.Fatalf("superseded protocol %s accepted", old)
		}
	}
}

// replaceFirstVertex swaps the first shape vertex line for the given text.
func replaceFirstVertex(body []byte, with string) []byte {
	i := bytes.Index(body, []byte("        ["))
	j := bytes.IndexByte(body[i:], '\n')
	out := append([]byte{}, body[:i]...)
	out = append(out, with...)
	return append(out, body[i+j+1:]...)
}

func TestRenderSVGIsCanonicalDeterministicAndBounded(t *testing.T) {
	in := good()
	a, err := renderSVG(in)
	if err != nil {
		t.Fatal(err)
	}
	b, err := renderSVG(in)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(a, b) {
		t.Fatal("nondeterministic svg")
	}
	if len(a) > 128<<10 {
		t.Fatalf("size cap: %d", len(a))
	}
	got := string(a)
	// E5: the viewBox is frozen at exactly 860x500.
	if !strings.HasPrefix(got, "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 860 500\"") {
		t.Fatalf("viewBox: %.120s", got)
	}
	if n := strings.Count(got, "<path "); n != 2 {
		t.Fatalf("paths: %d", n)
	}
	for i, seg := range strings.Split(got, "d=\"M")[1:] {
		d := seg[:strings.Index(seg, "\"")]
		if n := strings.Count(d, " L"); n != grid-1 {
			t.Fatalf("panel %d vertices: %d", i, n)
		}
		if !strings.HasSuffix(d, " Z") {
			t.Fatalf("panel %d not closed", i)
		}
	}
	for _, want := range []string{
		"grupo ordinal 1 — technical_go_local_shape_local_only — 1 recording",
		"grupo ordinal 37 — technical_go_local_shape_local_only — 1 recording",
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("missing panel label %q", want)
		}
	}
	// E7: the six frozen negations, literal, UTF-8, unabridged.
	for _, want := range frozenFooter {
		if !strings.Contains(got, want) {
			t.Fatalf("missing footer line %q", want)
		}
	}
	// Naming a forbidden element in order to deny it is allowed; drawing one is
	// not.
	for _, forbidden := range []string{"<script", "<image", "xlink", "<line", "<rect", "<circle", "marker", "latitude", "longitude", "trackname", "session-"} {
		if strings.Contains(strings.ToLower(got), strings.ToLower(forbidden)) {
			t.Fatalf("forbidden element %q", forbidden)
		}
	}
}

// frozenFooter mirrors erratum E7 verbatim; the renderer must emit it exactly.
var frozenFooter = []string{
	"Orientación absoluta: no demostrada. Sin datum/CRS (TA-04C NO-GO) y con rotación canónica arbitraria. No hay norte ni rumbo.",
	"Posición absoluta: unknown. Sin coordenadas, circuito, ciudad o país.",
	"Escala: relativa, no geodésica. Proyección equirectangular sobre datum no demostrado. Sin barra de escala.",
	"Quiralidad/espejo: no demostrada. El signo latitud→y es un supuesto de proyección; no se afirma sentido de giro ni ausencia de reflexión.",
	"Anchura y bordes: incompatible. Línea sin grosor semántico.",
	"Alcance: 1 recording por panel, cross_recording_confidence=none, inter_session_demonstrated=false. Artefacto descriptivo técnico experimental; no es un mapa.",
}

func TestRenderSVGKeepsScaleIsotropicPerPanel(t *testing.T) {
	out, err := renderSVG(fixture([]int{1, 37}, 100, 25, shapeProtocolSHA))
	if err != nil {
		t.Fatal(err)
	}
	got := string(out)
	i := strings.Index(got, "d=\"M")
	seg := got[i+4 : i+4+strings.Index(got[i+4:], "\"")]
	minX, minY := math.Inf(1), math.Inf(1)
	maxX, maxY := math.Inf(-1), math.Inf(-1)
	for _, tok := range strings.Fields(strings.NewReplacer("L", " ", "Z", " ").Replace(seg)) {
		p := strings.Split(tok, ",")
		if len(p) != 2 {
			t.Fatalf("vertex %q", tok)
		}
		x, e1 := strconv.ParseFloat(p[0], 64)
		y, e2 := strconv.ParseFloat(p[1], 64)
		if e1 != nil || e2 != nil {
			t.Fatalf("vertex %q", tok)
		}
		minX, maxX = math.Min(minX, x), math.Max(maxX, x)
		minY, maxY = math.Min(minY, y), math.Max(maxY, y)
	}
	if r := (maxX - minX) / (maxY - minY); math.Abs(r-4) > 0.02 {
		t.Fatalf("anisotropic scaling: ratio %g", r)
	}
	if w := maxX - minX; math.Abs(w-380) > 0.5 {
		t.Fatalf("major span %g, want 380", w)
	}
}

// E5: the decoder is strict; the synthetic path cannot weaken it.
func TestRenderSVGAcceptsOnlyTheCanonicalAuthorizedExport(t *testing.T) {
	g := good()
	for _, tc := range []struct {
		name string
		body []byte
	}{
		{"empty", []byte("{}")},
		{"one panel", fixture([]int{1}, 100, 60, shapeProtocolSHA)},
		{"three panels", fixture([]int{1, 2, 37}, 100, 60, shapeProtocolSHA)},
		{"wrong ordinals", fixture([]int{1, 2}, 100, 60, shapeProtocolSHA)},
		{"swapped ordinals", fixture([]int{37, 1}, 100, 60, shapeProtocolSHA)},
		{"foreign protocol", fixture([]int{1, 37}, 100, 60, "7d239baae99cc0f51911bc2fae1b0a1dac1cc0b3")},
		{"trailing json", append(append([]byte{}, g...), []byte("{}\n")...)},
		{"trailing garbage", append(append([]byte{}, g...), []byte("   \n")...)},
		{"reordered keys", bytes.Replace(g, []byte("\"version\": \"ta04f8/v1\",\n  \"protocol_sha\""), []byte("\"protocol_sha\""), 1)},
		{"alternative whitespace", bytes.Replace(g, []byte("  \"grid\": 1000,"), []byte("   \"grid\":1000,"), 1)},
		{"compact pairs", bytes.Replace(g, []byte("[100.0, 0.2]"), []byte("[100.0,0.2]"), 1)},
		{"unknown field", bytes.Replace(g, []byte("\"grid\": 1000"), []byte("\"grid\": 1000,\n  \"extra\": 1"), 1)},
		{"bad grid", bytes.Replace(g, []byte("\"grid\": 1000"), []byte("\"grid\": 999"), 1)},
		{"geodetic", bytes.Replace(g, []byte("\"scale_is_geodetic\": false"), []byte("\"scale_is_geodetic\": true"), 1)},
		{"absolute orientation", bytes.Replace(g, []byte("\"orientation_is_absolute\": false"), []byte("\"orientation_is_absolute\": true"), 1)},
		{"product authorised", bytes.Replace(g, []byte("\"product_map_authorization\": false"), []byte("\"product_map_authorization\": true"), 1)},
		{"local shape", bytes.Replace(g, []byte("\"local_shape\": \"unknown\""), []byte("\"local_shape\": \"valid\""), 1)},
		{"non local-only", bytes.Replace(g, []byte("technical_go_local_shape_local_only"), []byte("technical_no_go_local_shape"), 1)},
		{"confidence", bytes.Replace(g, []byte("\"cross_recording_confidence\": \"none\""), []byte("\"cross_recording_confidence\": \"limited\""), 1)},
		{"short shape", replaceFirstVertex(g, "")},
		{"non finite", replaceFirstVertex(g, "        [1e999, 0.1],\n")},
		{"unrounded", replaceFirstVertex(g, "        [100.05, 0.2],\n")},
		{"degenerate extent", fixture([]int{1, 37}, 0, 0, shapeProtocolSHA)},
	} {
		if _, err := renderSVG(tc.body); err == nil {
			t.Fatalf("%s accepted", tc.name)
		}
	}
	if _, err := renderSVG(g); err != nil {
		t.Fatalf("canonical export rejected: %v", err)
	}
}

// E6: the body is bounded before it is reserved or parsed.
func TestReadBoundedInputRejectsOversizedBodiesBeforeParsing(t *testing.T) {
	dir := t.TempDir()
	write := func(name string, n int) string {
		p := filepath.Join(dir, name)
		if err := os.WriteFile(p, bytes.Repeat([]byte("a"), n), 0600); err != nil {
			t.Fatal(err)
		}
		return p
	}
	if body, err := readBoundedInput(write("big.json", inputMaxBytes+1), bytes.NewReader(nil)); err == nil {
		t.Fatalf("oversized file accepted, %d bytes returned", len(body))
	}
	if _, err := readBoundedInput(write("edge.json", inputMaxBytes), bytes.NewReader(nil)); err != nil {
		t.Fatalf("exactly the cap rejected: %v", err)
	}
	if body, err := readBoundedInput("-", bytes.NewReader(bytes.Repeat([]byte("a"), inputMaxBytes+1))); err == nil {
		t.Fatalf("oversized stdin accepted, %d bytes returned", len(body))
	}
	if _, err := readBoundedInput("-", bytes.NewReader(bytes.Repeat([]byte("a"), inputMaxBytes))); err != nil {
		t.Fatalf("stdin exactly at the cap rejected: %v", err)
	}
	if _, err := readBoundedInput(dir, bytes.NewReader(nil)); err == nil {
		t.Fatal("directory accepted")
	}
}

func TestCLIRendersOnlyCanonicalFiles(t *testing.T) {
	dir := t.TempDir()
	var out, errw bytes.Buffer
	if code := run([]string{"-input=" + dir}, &out, &errw, bytes.NewReader(nil)); code != 2 {
		t.Fatalf("directory input exit %d", code)
	}
	ok := filepath.Join(dir, "ok.json")
	if err := os.WriteFile(ok, good(), 0600); err != nil {
		t.Fatal(err)
	}
	out.Reset()
	errw.Reset()
	if code := run([]string{"-input=" + ok}, &out, &errw, bytes.NewReader(nil)); code != 0 {
		t.Fatalf("canonical file exit %d stderr=%q", code, errw.String())
	}
	if !strings.HasPrefix(out.String(), "<svg ") {
		t.Fatalf("stdout %.60s", out.String())
	}
}
