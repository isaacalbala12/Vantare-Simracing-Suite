// Command trackgeometry generates the circuit outline pack from the telemetry
// Le Mans Ultimate writes into UserData\Telemetry.
//
// It is a development tool: it is not built into the shipped binary and adds no
// dependency to it. Sessions are read with the duckdb CLI, always from a copy
// and always read-only, so the recordings are never touched. The geometry
// itself is computed by internal/trackgeometry, which does no I/O.
//
//	go run ./tools/trackgeometry -telemetry "<Steam>\Le Mans Ultimate\UserData\Telemetry" -out pack.ts
package main

import (
	"encoding/csv"
	"errors"
	"flag"
	"fmt"
	"io"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/vantare/overlays/v2/internal/trackgeometry"
)

// maximumLengthDeviation is how far the outline may stray from the lap it was
// built from before it is rejected as not being the circuit.
const maximumLengthDeviation = 0.10

// Sessions are named "<track>_<P|Q|R>_<timestamp>.duckdb".
var sessionName = regexp.MustCompile(`^(.+)_[A-Z]+_[0-9T_:-]+Z\.duckdb$`)

const exportQuery = `COPY (
  WITH lat AS (SELECT row_number() OVER () i, value v FROM "GPS Latitude"),
       lon AS (SELECT row_number() OVER () i, value v FROM "GPS Longitude"),
       d   AS (SELECT row_number() OVER () i, value v FROM "Lap Dist")
  SELECT d.v, lat.v, lon.v FROM d JOIN lat USING(i) JOIN lon USING(i) WHERE d.v >= 0
) TO '%s' (HEADER, DELIMITER ',');`

type trackResult struct {
	track    string
	session  string
	outline  trackgeometry.Result
	failure  error
	attempts int
}

func main() {
	telemetry := flag.String("telemetry", "", "directory holding the LMU .duckdb sessions")
	out := flag.String("out", "", "path of the generated TypeScript pack")
	duckdb := flag.String("duckdb", "duckdb", "duckdb CLI executable")
	flag.Parse()

	if *telemetry == "" || *out == "" {
		fmt.Fprintln(os.Stderr, "usage: trackgeometry -telemetry <dir> -out <pack.ts>")
		os.Exit(2)
	}
	if err := run(*telemetry, *out, *duckdb); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func run(telemetry, out, duckdb string) error {
	sessions, err := sessionsByTrack(telemetry)
	if err != nil {
		return err
	}
	if len(sessions) == 0 {
		return errors.New("no sessions found")
	}

	workspace, err := os.MkdirTemp("", "trackgeometry")
	if err != nil {
		return err
	}
	defer os.RemoveAll(workspace)

	tracks := make([]string, 0, len(sessions))
	for track := range sessions {
		tracks = append(tracks, track)
	}
	sort.Strings(tracks)

	var covered []trackResult
	for _, track := range tracks {
		result := buildTrack(track, sessions[track], workspace, duckdb)
		if result.failure != nil {
			// A circuit without a usable lap is reported, never filled in with a
			// partial outline: downstream could not tell the difference.
			fmt.Printf("SKIP  %-38s %d sesiones probadas: %v\n", track, result.attempts, result.failure)
			continue
		}
		fmt.Printf("OK    %-38s %.0f m integrados sobre vuelta de %.0f m (%+.1f%%), %d vueltas, cobertura %.0f%%, %d puntos\n",
			track, result.outline.IntegratedLength, result.outline.LapDistanceSpan,
			(result.outline.IntegratedLength/result.outline.LapDistanceSpan-1)*100,
			result.outline.Laps, result.outline.Coverage*100, len(result.outline.Points))
		covered = append(covered, result)
	}

	if len(covered) == 0 {
		return errors.New("no circuit produced a usable outline")
	}
	fmt.Printf("\n%d de %d circuitos cubiertos\n", len(covered), len(tracks))
	return writePack(out, covered)
}

func sessionsByTrack(directory string) (map[string][]string, error) {
	entries, err := os.ReadDir(directory)
	if err != nil {
		return nil, err
	}
	grouped := map[string][]string{}
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		match := sessionName.FindStringSubmatch(entry.Name())
		if match == nil {
			continue
		}
		grouped[match[1]] = append(grouped[match[1]], filepath.Join(directory, entry.Name()))
	}
	// Largest first only as a heuristic for "most laps"; it is not a guarantee,
	// so every session is tried until one yields a complete lap.
	for _, paths := range grouped {
		sort.Slice(paths, func(i, j int) bool { return size(paths[i]) > size(paths[j]) })
	}
	return grouped, nil
}

func buildTrack(track string, paths []string, workspace, duckdb string) trackResult {
	result := trackResult{track: track, failure: errors.New("no session held a complete lap")}
	for _, path := range paths {
		result.attempts++
		samples, err := extract(path, workspace, duckdb)
		if err != nil {
			continue
		}
		span := 0.0
		for _, sample := range samples {
			if sample.LapDistance > span {
				span = sample.LapDistance
			}
		}
		options := trackgeometry.DefaultOptions()
		options.LapLength = span
		outline, err := trackgeometry.Build(samples, options)
		if err != nil {
			continue
		}
		// The outline must account for the lap it came from. Smoothing shaves a
		// little off the corners, and sparse bins add a little back, but a
		// double-digit gap means the shape is not the circuit.
		deviation := math.Abs(outline.IntegratedLength-outline.LapDistanceSpan) / outline.LapDistanceSpan
		if deviation > maximumLengthDeviation {
			result.failure = fmt.Errorf("outline is %.0f m against a %.0f m lap", outline.IntegratedLength, outline.LapDistanceSpan)
			continue
		}
		return trackResult{track: track, session: filepath.Base(path), outline: outline, attempts: result.attempts}
	}
	return result
}

// extract copies the session and exports the three channels the outline needs.
// The original is only ever read, and duckdb is invoked read-only.
func extract(path, workspace, duckdb string) ([]trackgeometry.Sample, error) {
	staged := filepath.Join(workspace, "session.duckdb")
	exported := filepath.Join(workspace, "session.csv")
	os.Remove(staged)
	os.Remove(exported)
	if err := copyFile(path, staged); err != nil {
		return nil, err
	}

	query := fmt.Sprintf(exportQuery, strings.ReplaceAll(exported, `\`, `/`))
	command := exec.Command(duckdb, "-readonly", staged, "-c", query)
	if output, err := command.CombinedOutput(); err != nil {
		return nil, fmt.Errorf("duckdb: %w: %s", err, output)
	}
	return readSamples(exported)
}

func readSamples(path string) ([]trackgeometry.Sample, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	reader := csv.NewReader(file)
	records, err := reader.ReadAll()
	if err != nil {
		return nil, err
	}
	samples := make([]trackgeometry.Sample, 0, len(records))
	for index, record := range records {
		if index == 0 || len(record) < 3 {
			continue
		}
		distance, errDistance := strconv.ParseFloat(record[0], 64)
		latitude, errLatitude := strconv.ParseFloat(record[1], 64)
		longitude, errLongitude := strconv.ParseFloat(record[2], 64)
		if errDistance != nil || errLatitude != nil || errLongitude != nil {
			continue
		}
		samples = append(samples, trackgeometry.Sample{
			LapDistance: distance, Latitude: latitude, Longitude: longitude,
		})
	}
	return samples, nil
}

func copyFile(source, destination string) error {
	in, err := os.Open(source)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(destination)
	if err != nil {
		return err
	}
	defer out.Close()
	_, err = io.Copy(out, in)
	return err
}

func size(path string) int64 {
	info, err := os.Stat(path)
	if err != nil {
		return 0
	}
	return info.Size()
}
