// Command ta04f8-shape-figure renders the TA-04F8 descriptive technical figure
// from an already sanitised shape export. It never opens DuckDB, never imports
// product, reader or frontend code and uses only the standard library.
//
// The figure is not a map: orientation, absolute position, geodetic scale,
// chirality and track width are all undemonstrated and are declared as such in
// the mandatory footer.
package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"math"
	"os"
	"strconv"
)

const gridSize = 1000
const svgMaxBytes = 128 << 10
const inputMaxBytes = 64 << 10

// shapeProtocolSHA is the ta04f8-shape-export-plan.md gate 3 preflight protocol
// anchor erratum commit.
const shapeProtocolSHA = "bc13c7015a44b108ed63e1c00d70e43811acb57e"
const liveFigureProtocolSHA = "d278e7599c4a0acbac720ff23b0e73916757dd57"
const liveFigureMode = "existing-live-inventory-shape"

type figureProfile struct {
	version, protocol, mode string
}

var legacyFigureProfile = figureProfile{"ta04f8/v1", shapeProtocolSHA, "existing-authorized-shape"}
var liveFigureProfile = figureProfile{"ta04f9/v1", liveFigureProtocolSHA, liveFigureMode}

// authorizedOrdinals is the frozen panel set of the gate 3 artifact.
var authorizedOrdinals = []int{1, 37}

// panel box geometry, frozen by the protocol.
const panelBox = 400.0
const panelSpan = 380.0
const panelPitch = 420.0
const panelMargin = 20.0

type shapePanel struct {
	GroupOrdinal             int          `json:"group_ordinal"`
	Decision                 string       `json:"decision"`
	CrossRecordingConfidence string       `json:"cross_recording_confidence"`
	Shape                    [][2]float64 `json:"shape"`
}

type shapeExport struct {
	Version                 string       `json:"version"`
	ProtocolSHA             string       `json:"protocol_sha"`
	RunnerSHA               string       `json:"runner_sha"`
	Mode                    string       `json:"mode"`
	Grid                    int          `json:"grid"`
	Units                   string       `json:"units"`
	ScaleIsGeodetic         bool         `json:"scale_is_geodetic"`
	OrientationIsAbsolute   bool         `json:"orientation_is_absolute"`
	Panels                  []shapePanel `json:"panels"`
	LocalShape              string       `json:"local_shape"`
	ProductMapAuthorization bool         `json:"product_map_authorization"`
}

// footer carries the six mandatory negations verbatim, in UTF-8 and unabridged.
// Naming a forbidden element in order to deny it does not authorise drawing it.
var footer = []string{
	"Orientación absoluta: no demostrada. Sin datum/CRS (TA-04C NO-GO) y con rotación canónica arbitraria. No hay norte ni rumbo.",
	"Posición absoluta: unknown. Sin coordenadas, circuito, ciudad o país.",
	"Escala: relativa, no geodésica. Proyección equirectangular sobre datum no demostrado. Sin barra de escala.",
	"Quiralidad/espejo: no demostrada. El signo latitud→y es un supuesto de proyección; no se afirma sentido de giro ni ausencia de reflexión.",
	"Anchura y bordes: incompatible. Línea sin grosor semántico.",
	"Alcance: 1 recording por panel, cross_recording_confidence=none, inter_session_demonstrated=false. Artefacto descriptivo técnico experimental; no es un mapa.",
}

func validateFor(profile figureProfile, x shapeExport) error {
	if x.Version != profile.version || x.ProtocolSHA != profile.protocol || x.RunnerSHA == "" || x.Mode != profile.mode {
		return errors.New("shape header")
	}
	if x.Grid != gridSize || x.Units != "relative_metres" || x.ScaleIsGeodetic || x.OrientationIsAbsolute || x.LocalShape != "unknown" || x.ProductMapAuthorization {
		return errors.New("shape semantics")
	}
	if len(x.Panels) != len(authorizedOrdinals) {
		return errors.New("panel cardinality")
	}
	for i, p := range x.Panels {
		if p.GroupOrdinal != authorizedOrdinals[i] {
			return errors.New("panel unauthorized")
		}
		if p.Decision != "technical_go_local_shape_local_only" || p.CrossRecordingConfidence != "none" {
			return errors.New("panel decision")
		}
		if len(p.Shape) != gridSize {
			return errors.New("shape cardinality")
		}
		for _, v := range p.Shape {
			for _, c := range v {
				if math.IsNaN(c) || math.IsInf(c, 0) || c*10 != math.Trunc(c*10) {
					return errors.New("shape value")
				}
			}
		}
	}
	return nil
}

func validate(x shapeExport) error { return validateFor(legacyFigureProfile, x) }

// encodeCanonical mirrors the runner encoder byte for byte, so the consumer can
// reject any document that is not the canonical serialisation.
func encodeCanonicalFor(profile figureProfile, x shapeExport) ([]byte, error) {
	if err := validateFor(profile, x); err != nil {
		return nil, err
	}
	str := func(b *bytes.Buffer, key, value string) {
		q, _ := json.Marshal(value)
		fmt.Fprintf(b, "  %q: %s,\n", key, q)
	}
	var b bytes.Buffer
	b.WriteString("{\n")
	str(&b, "version", x.Version)
	str(&b, "protocol_sha", x.ProtocolSHA)
	str(&b, "runner_sha", x.RunnerSHA)
	str(&b, "mode", x.Mode)
	fmt.Fprintf(&b, "  \"grid\": %d,\n", x.Grid)
	str(&b, "units", x.Units)
	b.WriteString("  \"scale_is_geodetic\": false,\n  \"orientation_is_absolute\": false,\n  \"panels\": [\n")
	for i, p := range x.Panels {
		fmt.Fprintf(&b, "    {\n      \"group_ordinal\": %d,\n", p.GroupOrdinal)
		fmt.Fprintf(&b, "      \"decision\": %q,\n      \"cross_recording_confidence\": %q,\n      \"shape\": [\n", p.Decision, p.CrossRecordingConfidence)
		for j, v := range p.Shape {
			b.WriteString("        [" + strconv.FormatFloat(v[0], 'f', 1, 64) + ", " + strconv.FormatFloat(v[1], 'f', 1, 64) + "]")
			if j != len(p.Shape)-1 {
				b.WriteByte(',')
			}
			b.WriteByte('\n')
		}
		b.WriteString("      ]\n    }")
		if i != len(x.Panels)-1 {
			b.WriteByte(',')
		}
		b.WriteByte('\n')
	}
	b.WriteString("  ],\n")
	str(&b, "local_shape", x.LocalShape)
	b.WriteString("  \"product_map_authorization\": false\n}\n")
	return b.Bytes(), nil
}

func encodeCanonical(x shapeExport) ([]byte, error) {
	return encodeCanonicalFor(legacyFigureProfile, x)
}

func decodeShapeExportFor(profile figureProfile, body []byte) (shapeExport, error) {
	var x shapeExport
	if len(body) > inputMaxBytes {
		return x, errors.New("input size cap")
	}
	d := json.NewDecoder(bytes.NewReader(body))
	d.DisallowUnknownFields()
	if err := d.Decode(&x); err != nil {
		return x, err
	}
	if d.More() {
		return x, errors.New("trailing")
	}
	// Any other trailing byte is caught by the canonical byte equality below.
	canonical, err := encodeCanonicalFor(profile, x)
	if err != nil {
		return x, err
	}
	if !bytes.Equal(body, canonical) {
		return x, errors.New("noncanonical shape schema")
	}
	return x, nil
}

func decodeShapeExport(body []byte) (shapeExport, error) {
	return decodeShapeExportFor(legacyFigureProfile, body)
}

// readBoundedInput bounds the body before it is reserved or parsed.
func readBoundedInput(input string, stdin io.Reader) ([]byte, error) {
	if input == "-" {
		body, err := io.ReadAll(io.LimitReader(stdin, inputMaxBytes+1))
		if err != nil {
			return nil, err
		}
		if len(body) > inputMaxBytes {
			return nil, errors.New("input size cap")
		}
		return body, nil
	}
	info, err := os.Lstat(input)
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() {
		return nil, errors.New("input not regular")
	}
	if info.Size() > inputMaxBytes {
		return nil, errors.New("input size cap")
	}
	f, err := os.Open(input)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	body, err := io.ReadAll(io.LimitReader(f, inputMaxBytes+1))
	if err != nil {
		return nil, err
	}
	if len(body) > inputMaxBytes {
		return nil, errors.New("input size cap")
	}
	return body, nil
}

func fixed2(v float64) string { return strconv.FormatFloat(math.Round(v*100)/100, 'f', 2, 64) }

func renderSVGFor(profile figureProfile, input []byte) ([]byte, error) {
	x, err := decodeShapeExportFor(profile, input)
	if err != nil {
		return nil, err
	}
	width := int(panelPitch)*len(x.Panels) + int(panelMargin)
	var b bytes.Buffer
	fmt.Fprintf(&b, "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 %d 500\" font-family=\"monospace\">\n", width)
	for p, panel := range x.Panels {
		var e float64
		for _, v := range panel.Shape {
			e = math.Max(e, math.Max(math.Abs(v[0]), math.Abs(v[1])))
		}
		if e <= 0 || math.IsInf(e, 0) {
			return nil, errors.New("degenerate extent")
		}
		// isotropic fit: x and y share one factor inside the panel; panels are
		// scaled independently and their sizes are not comparable.
		k := panelSpan / (2 * e)
		ox := panelMargin + float64(p)*panelPitch
		b.WriteString("  <path fill=\"none\" stroke=\"#111111\" stroke-width=\"1.5\" d=\"M")
		for i, v := range panel.Shape {
			if i > 0 {
				b.WriteString(" L")
			}
			b.WriteString(fixed2(ox+panelBox/2+k*v[0]) + "," + fixed2(panelMargin+panelBox/2-k*v[1]))
		}
		b.WriteString(" Z\"/>\n")
		label := fmt.Sprintf("grupo ordinal %d — %s — 1 recording", panel.GroupOrdinal, panel.Decision)
		fmt.Fprintf(&b, "  <text x=\"%s\" y=\"450\" font-size=\"9\" text-anchor=\"middle\">%s</text>\n", fixed2(ox+panelBox/2), escapeText(label))
	}
	b.WriteString("  <text x=\"20\" y=\"470\" font-size=\"7\" fill=\"#333333\">\n")
	for i, line := range footer {
		dy := "5"
		if i == 0 {
			dy = "0"
		}
		fmt.Fprintf(&b, "    <tspan x=\"20\" dy=\"%s\">%s</tspan>\n", dy, escapeText(line))
	}
	b.WriteString("  </text>\n</svg>\n")
	if b.Len() > svgMaxBytes {
		return nil, errors.New("svg size cap")
	}
	return b.Bytes(), nil
}

func renderSVG(input []byte) ([]byte, error) { return renderSVGFor(legacyFigureProfile, input) }

func escapeText(s string) string {
	r := make([]byte, 0, len(s))
	for i := 0; i < len(s); i++ {
		switch s[i] {
		case '&':
			r = append(r, "&amp;"...)
		case '<':
			r = append(r, "&lt;"...)
		case '>':
			r = append(r, "&gt;"...)
		default:
			r = append(r, s[i])
		}
	}
	return string(r)
}

func run(args []string, out, errw io.Writer, stdin io.Reader) int {
	fs := flag.NewFlagSet("ta04f8-shape-figure", flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	input := fs.String("input", "-", "path to the sanitised shape export, or - for stdin")
	profileName := fs.String("profile", "ta04f8", "strict input profile: ta04f8 or ta04f9")
	if fs.Parse(args) != nil || fs.NArg() != 0 {
		fmt.Fprintln(errw, "data_invalid")
		return 2
	}
	profile := legacyFigureProfile
	if *profileName == "ta04f9" {
		profile = liveFigureProfile
	} else if *profileName != "ta04f8" {
		fmt.Fprintln(errw, "data_invalid")
		return 2
	}
	body, err := readBoundedInput(*input, stdin)
	if err != nil {
		fmt.Fprintln(errw, "data_invalid")
		return 2
	}
	svg, err := renderSVGFor(profile, body)
	if err != nil {
		fmt.Fprintln(errw, "data_invalid")
		return 2
	}
	if _, err = out.Write(svg); err != nil {
		return 1
	}
	return 0
}

func main() { os.Exit(run(os.Args[1:], os.Stdout, os.Stderr, os.Stdin)) }
