package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strconv"
)

// protocol_sha of docs/vantare-program/research/telemetry-analysis/ta04f8-shape-export-plan.md
// at its gate 3 preflight protocol anchor erratum.
const shapeProtocolSHA = "bc13c7015a44b108ed63e1c00d70e43811acb57e"
const shapeMode = "existing-authorized-shape"
const shapeExportMaxBytes = 64 << 10
const shapeEpsilon = 1e-6

// shapeSignEpsilon is the erratum E2 threshold below which a bin cannot decide
// the canonical frame.
const shapeSignEpsilon = 1e-6

// shapeAnisotropyRatio is the erratum E1 dimensionless degeneracy guard.
const shapeAnisotropyRatio = 1e-6

var expectedShapeOutputPath = projectOutputPath("ta04f8-shape-export-v1.json")
var expectedControlOutputPath = projectOutputPath("ta04f8-historical-cluster-manifest-v3.json")

// shapeAuthorizedOrdinals is the frozen panel set of the real gate 3 artifact:
// the two ta04f7 freeze-v2 groups decided technical_go_local_shape_local_only.
var shapeAuthorizedOrdinals = []int{1, 37}

// The synthetic fixture uses the same authorized set as the real gate.

var errShapeDegenerate = errors.New("shape_degenerate")

type ShapePanel struct {
	GroupOrdinal             int          `json:"group_ordinal"`
	Decision                 string       `json:"decision"`
	CrossRecordingConfidence string       `json:"cross_recording_confidence"`
	Shape                    [][2]float64 `json:"shape"`
}

type ShapeExport struct {
	Version                 string       `json:"version"`
	ProtocolSHA             string       `json:"protocol_sha"`
	RunnerSHA               string       `json:"runner_sha"`
	Mode                    string       `json:"mode"`
	Grid                    int          `json:"grid"`
	Units                   string       `json:"units"`
	ScaleIsGeodetic         bool         `json:"scale_is_geodetic"`
	OrientationIsAbsolute   bool         `json:"orientation_is_absolute"`
	Panels                  []ShapePanel `json:"panels"`
	LocalShape              string       `json:"local_shape"`
	ProductMapAuthorization bool         `json:"product_map_authorization"`
}

type shapeCollector struct{ panels []ShapePanel }

// canonicalShape removes the recording anchor, fixes a deterministic frame and
// rounds to 0.1 m, in that exact order. The rotation is arbitrary by
// construction: it only prevents the alignment template rotation from being
// mistaken for a real orientation.
func canonicalShape(pts []Point) ([][2]float64, error) {
	if len(pts) != gridSize {
		return nil, errors.New("shape cardinality")
	}
	n := float64(gridSize)
	var cx, cy float64
	for _, p := range pts {
		if !finite(p.X) || !finite(p.Y) {
			return nil, errors.New("shape nonfinite")
		}
		cx += p.X
		cy += p.Y
	}
	cx /= n
	cy /= n
	if !finite(cx) || !finite(cy) {
		return nil, errors.New("shape centroid")
	}
	xs := make([]float64, gridSize)
	ys := make([]float64, gridSize)
	defer clear(xs)
	defer clear(ys)
	var sxx, syy, sxy float64
	for i, p := range pts {
		xs[i] = p.X - cx
		ys[i] = p.Y - cy
		sxx += xs[i] * xs[i]
		syy += ys[i] * ys[i]
		sxy += xs[i] * ys[i]
	}
	// E1: a dimensionless anisotropy ratio, so a near isotropic shape whose
	// principal axis is numerically unstable fails closed instead of producing
	// an arbitrary rotation.
	trace := sxx + syy
	off, diff := 2*sxy, sxx-syy
	if !finite(sxx) || !finite(syy) || !finite(sxy) || trace <= n*shapeEpsilon*shapeEpsilon {
		return nil, errShapeDegenerate
	}
	if math.Hypot(off, diff)/trace < shapeAnisotropyRatio {
		return nil, errShapeDegenerate
	}
	th := 0.5 * math.Atan2(off, diff)
	c, s := math.Cos(th), math.Sin(th)
	out := make([][2]float64, gridSize)
	for i := range xs {
		out[i] = [2]float64{xs[i]*c + ys[i]*s, ys[i]*c - xs[i]*s}
	}
	// E2: the frame is decided by the first bin above epsilon_sign; a bin close
	// to the origin carries no usable sign.
	flip, decided := false, false
	for _, p := range out {
		if math.Abs(p[0]) > shapeSignEpsilon {
			flip, decided = p[0] < 0, true
			break
		}
	}
	if !decided {
		for _, p := range out {
			if math.Abs(p[1]) > shapeSignEpsilon {
				flip, decided = p[1] < 0, true
				break
			}
		}
	}
	if !decided {
		return nil, errShapeDegenerate
	}
	if flip {
		for i := range out {
			out[i][0], out[i][1] = -out[i][0], -out[i][1]
		}
	}
	for i := range out {
		for j := range out[i] {
			v := math.Round(out[i][j]*10) / 10
			if !finite(v) {
				return nil, errors.New("shape overflow")
			}
			if v == 0 {
				v = 0 // normalise negative zero
			}
			out[i][j] = v
		}
	}
	return out, nil
}

func roundedToTenth(v float64) bool { return finite(v) && v*10 == math.Trunc(v*10) }

func (x ShapeExport) Validate(authorized []int) error {
	legacy := x.Version == "ta04f8/v1" && x.ProtocolSHA == shapeProtocolSHA && x.Mode == shapeMode
	live := x.Version == "ta04f9/v1" && x.ProtocolSHA == liveProtocolSHA && x.Mode == liveShapeMode
	if (!legacy && !live) || x.RunnerSHA == "" {
		return errors.New("shape header")
	}
	if x.Grid != gridSize || x.Units != "relative_metres" || x.ScaleIsGeodetic || x.OrientationIsAbsolute || x.LocalShape != "unknown" || x.ProductMapAuthorization {
		return errors.New("shape semantics")
	}
	if len(authorized) == 0 || len(x.Panels) != len(authorized) {
		return errors.New("panel cardinality")
	}
	for i, p := range x.Panels {
		if p.GroupOrdinal != authorized[i] {
			return fmt.Errorf("panel %d unauthorized", p.GroupOrdinal)
		}
		if p.Decision != "technical_go_local_shape_local_only" || p.CrossRecordingConfidence != "none" {
			return errors.New("panel decision")
		}
		if len(p.Shape) != gridSize {
			return errors.New("shape cardinality")
		}
		for _, v := range p.Shape {
			if !roundedToTenth(v[0]) || !roundedToTenth(v[1]) {
				return errors.New("shape value")
			}
		}
	}
	return nil
}

func writeShapeString(b *bytes.Buffer, key, value string, last bool) {
	q, _ := json.Marshal(value)
	fmt.Fprintf(b, "  %q: %s", key, q)
	if !last {
		b.WriteByte(',')
	}
	b.WriteByte('\n')
}

// encodeShapeExport emits the canonical serialisation: two space indentation,
// fixed key order, one inline pair per grid bin and a single trailing newline.
func encodeShapeExport(x ShapeExport, authorized []int) ([]byte, error) {
	if err := x.Validate(authorized); err != nil {
		return nil, err
	}
	var b bytes.Buffer
	b.WriteString("{\n")
	writeShapeString(&b, "version", x.Version, false)
	writeShapeString(&b, "protocol_sha", x.ProtocolSHA, false)
	writeShapeString(&b, "runner_sha", x.RunnerSHA, false)
	writeShapeString(&b, "mode", x.Mode, false)
	fmt.Fprintf(&b, "  \"grid\": %d,\n", x.Grid)
	writeShapeString(&b, "units", x.Units, false)
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
	writeShapeString(&b, "local_shape", x.LocalShape, false)
	b.WriteString("  \"product_map_authorization\": false\n}\n")
	if b.Len() > shapeExportMaxBytes {
		return nil, errLogicalCap
	}
	return b.Bytes(), nil
}

func strictDecodeShapeExport(body []byte, authorized []int) (ShapeExport, error) {
	var x ShapeExport
	d := json.NewDecoder(bytes.NewReader(body))
	d.DisallowUnknownFields()
	if err := d.Decode(&x); err != nil {
		return x, err
	}
	if d.More() {
		return x, errors.New("trailing")
	}
	canonical, err := encodeShapeExport(x, authorized)
	if err != nil {
		return x, err
	}
	if !bytes.Equal(body, canonical) {
		return x, errors.New("noncanonical shape schema")
	}
	return x, nil
}

// elideForControl removes exactly protocol_sha, runner_sha and mode, which are
// the only keys allowed to differ between freeze-v2 and the control manifest.
func elideForControl(m Manifest) ([]byte, error) {
	m.ProtocolSHA = ""
	m.RunnerSHA = ""
	m.Mode = ""
	return json.MarshalIndent(m, "", "  ")
}

func manifestControlEqual(freeze, control []byte) error {
	f, err := strictDecode(freeze)
	if err != nil {
		return err
	}
	c, err := strictDecode(control)
	if err != nil {
		return err
	}
	if f.Mode != "" || c.Mode != shapeMode {
		return errors.New("control mode")
	}
	a, err := elideForControl(f)
	if err != nil {
		return err
	}
	b, err := elideForControl(c)
	if err != nil {
		return err
	}
	if !bytes.Equal(a, b) {
		return errors.New("control manifest differs beyond the enumerated keys")
	}
	return nil
}

func shapeExportFrom(runner string, panels []ShapePanel, authorized []int) ([]byte, error) {
	return shapeExportFor(shapeMode, shapeProtocolSHA, runner, panels, authorized)
}

func shapeExportFor(mode, protocol, runner string, panels []ShapePanel, authorized []int) ([]byte, error) {
	version := "ta04f8/v1"
	if mode == liveShapeMode {
		version = "ta04f9/v1"
	}
	return encodeShapeExport(ShapeExport{Version: version, ProtocolSHA: protocol, RunnerSHA: runner, Mode: mode,
		Grid: gridSize, Units: "relative_metres", Panels: panels, LocalShape: "unknown"}, authorized)
}

func syntheticShapeArtifacts() ([]byte, []byte, error) {
	col := &shapeCollector{}
	m, err := runExistingCore(context.Background(), RunConfig{ProtocolSHA: shapeProtocolSHA, RunnerSHA: "synthetic", Mode: shapeMode, Shape: col}, newSyntheticShapeBackend(), [32]byte{})
	if err != nil {
		return nil, nil, err
	}
	manifest, err := encodeManifest(m)
	if err != nil {
		return nil, nil, err
	}
	shape, err := shapeExportFrom("synthetic", col.panels, shapeAuthorizedOrdinals)
	if err != nil {
		return nil, nil, err
	}
	return manifest, shape, nil
}
