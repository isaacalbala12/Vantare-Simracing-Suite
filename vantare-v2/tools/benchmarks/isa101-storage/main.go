package main

import (
	"encoding/csv"
	"errors"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"time"
)

type resultRow struct {
	Candidate, Scenario, RunClass, Status, Error, Digest      string
	Repetition, Records, Observed, Facts, RangeRecords        int
	PayloadBytes, FileBytes                                   int64
	WriteDuration, QueryDuration, RangeDuration, LastDuration time.Duration
	LastEpoch, LastSequence                                   uint64
}

func main() {
	candidateFlag := flag.String("candidate", "framing", "candidate name")
	scenarioFlag := flag.String("scenario", "nominal", "scenario name or all")
	repetitionsFlag := flag.Int("repetitions", 0, "override repetitions; 0 uses scenario default")
	outputFlag := flag.String("output", "results.csv", "raw CSV output")
	workdirFlag := flag.String("workdir", "run-data", "temporary data directory")
	faultsFlag := flag.Bool("faults", false, "run recovery and concurrency probes")
	crashChildFlag := flag.Bool("crash-child", false, "internal crash child mode")
	crashPathFlag := flag.String("crash-path", "", "internal crash child path")
	crashBoundaryFlag := flag.String("crash-boundary", "", "internal crash boundary")
	flag.Parse()

	if *crashChildFlag {
		if err := runCrashChild(*candidateFlag, *crashPathFlag, *crashBoundaryFlag); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		return
	}
	if *faultsFlag {
		if err := runFaults(*candidateFlag, *outputFlag, *workdirFlag); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		return
	}
	if err := run(*candidateFlag, *scenarioFlag, *repetitionsFlag, *outputFlag, *workdirFlag); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(candidateName, scenarioName string, repetitions int, output, workdir string) error {
	c, ok := candidates[candidateName]
	if !ok {
		names := make([]string, 0, len(candidates))
		for name := range candidates {
			names = append(names, name)
		}
		sort.Strings(names)
		return fmt.Errorf("candidate %q unavailable; built candidates: %s", candidateName, strings.Join(names, ", "))
	}
	selected, err := selectScenarios(scenarioName)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(workdir, 0o700); err != nil {
		return fmt.Errorf("create workdir: %w", err)
	}
	rows := make([]resultRow, 0)
	for _, s := range selected {
		count := s.Repetitions
		if repetitions > 0 {
			count = repetitions
		}
		fixture := recordsFor(s)
		for repetition := 1; repetition <= count; repetition++ {
			temperature := "subsequent"
			if repetition == 1 {
				temperature = "first"
			}
			path := filepath.Join(workdir, fmt.Sprintf("%s-%s-%02d.dat", c.Name, s.Name, repetition))
			row := execute(c, s.Name, temperature, repetition, path, fixture)
			rows = append(rows, row)
			if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
				return fmt.Errorf("remove run data: %w", err)
			}
			os.Remove(path + "-wal")
			os.Remove(path + "-shm")
		}
	}
	return writeCSV(output, rows)
}

func execute(c candidate, scenarioName, runClass string, repetition int, path string, fixture []record) resultRow {
	row := resultRow{Candidate: c.Name, Scenario: scenarioName, RunClass: runClass, Repetition: repetition, Status: "PASS"}
	writer, err := c.OpenWriter(path)
	if err != nil {
		row.Status, row.Error = "BLOCKED", err.Error()
		return row
	}
	start := time.Now()
	for _, rec := range fixture {
		if err = writer.Append(rec); err != nil {
			break
		}
	}
	if err == nil {
		err = writer.Sync()
	}
	err = errors.Join(err, writer.Close())
	row.WriteDuration = time.Since(start)
	if err != nil {
		row.Status, row.Error = "FAIL", err.Error()
		return row
	}
	info, err := os.Stat(path)
	if err != nil {
		row.Status, row.Error = "FAIL", err.Error()
		return row
	}
	row.FileBytes = info.Size()
	from, to := fixture[0].Timestamp, fixture[len(fixture)-1].Timestamp
	summary, duration, err := queryCandidate(c, path, from, to)
	row.QueryDuration = duration
	if err != nil {
		row.Status, row.Error = "FAIL", err.Error()
		return row
	}
	row.Records, row.Observed, row.Facts = int(summary.Records), int(summary.Observed), int(summary.Facts)
	row.PayloadBytes, row.LastEpoch, row.LastSequence = summary.PayloadBytes, summary.LastEpoch, summary.LastSequence
	row.Digest = fmt.Sprintf("%x", summary.Digest)
	rangeFrom := fixture[len(fixture)*45/100].Timestamp
	rangeTo := fixture[len(fixture)*55/100].Timestamp
	rangeSummary, rangeDuration, rangeErr := queryCandidate(c, path, rangeFrom, rangeTo)
	row.RangeDuration, row.RangeRecords = rangeDuration, int(rangeSummary.Records)
	lastSummary, lastDuration, lastErr := queryCandidate(c, path, to, to)
	row.LastDuration = lastDuration
	if err := errors.Join(rangeErr, lastErr); err != nil {
		row.Status, row.Error = "FAIL", err.Error()
		return row
	}
	if row.Records != len(fixture) || row.LastSequence != fixture[len(fixture)-1].Sequence {
		row.Status, row.Error = "FAIL", "round-trip count/cursor mismatch"
	}
	if lastSummary.LastSequence != fixture[len(fixture)-1].Sequence {
		row.Status, row.Error = "FAIL", "last cursor query mismatch"
	}
	return row
}

func queryCandidate(c candidate, path string, from, to int64) (summary, time.Duration, error) {
	activeReader, err := c.OpenReader(path)
	if err != nil {
		return summary{}, 0, err
	}
	start := time.Now()
	result, queryErr := activeReader.Summarize(from, to)
	duration := time.Since(start)
	return result, duration, errors.Join(queryErr, activeReader.Close())
}

func selectScenarios(name string) ([]scenario, error) {
	if name != "all" {
		s, ok := scenarios[name]
		if !ok {
			return nil, fmt.Errorf("unknown scenario %q", name)
		}
		return []scenario{s}, nil
	}
	names := make([]string, 0, len(scenarios))
	for name := range scenarios {
		names = append(names, name)
	}
	sort.Strings(names)
	result := make([]scenario, 0, len(names))
	for _, name := range names {
		result = append(result, scenarios[name])
	}
	return result, nil
}

func writeCSV(path string, rows []resultRow) error {
	file, err := os.Create(path)
	if err != nil {
		return fmt.Errorf("create CSV: %w", err)
	}
	writer := csv.NewWriter(file)
	header := []string{"candidate", "scenario", "repetition", "run_class", "goos", "goarch", "status", "error",
		"records", "observed", "facts", "payload_bytes", "file_bytes", "write_ns", "full_scan_ns",
		"range_records", "range_query_ns", "last_cursor_ns",
		"last_epoch", "last_sequence", "payload_sha256"}
	if err := writer.Write(header); err != nil {
		file.Close()
		return err
	}
	for _, row := range rows {
		values := []string{row.Candidate, row.Scenario, strconv.Itoa(row.Repetition), row.RunClass, runtime.GOOS, runtime.GOARCH,
			row.Status, row.Error, strconv.Itoa(row.Records), strconv.Itoa(row.Observed), strconv.Itoa(row.Facts),
			strconv.FormatInt(row.PayloadBytes, 10), strconv.FormatInt(row.FileBytes, 10),
			strconv.FormatInt(row.WriteDuration.Nanoseconds(), 10), strconv.FormatInt(row.QueryDuration.Nanoseconds(), 10),
			strconv.Itoa(row.RangeRecords), strconv.FormatInt(row.RangeDuration.Nanoseconds(), 10),
			strconv.FormatInt(row.LastDuration.Nanoseconds(), 10),
			strconv.FormatUint(row.LastEpoch, 10), strconv.FormatUint(row.LastSequence, 10), row.Digest}
		if err := writer.Write(values); err != nil {
			file.Close()
			return err
		}
	}
	writer.Flush()
	return errors.Join(writer.Error(), file.Close())
}
