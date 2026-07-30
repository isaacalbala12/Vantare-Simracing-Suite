package main

import (
	"bufio"
	"crypto/sha256"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type faultRow struct {
	Candidate, Probe, Boundary, Status, Detail, IntegrityState, AccessMode, RecoveryIntegrityState, OriginalHash, RecoveryHash string
	VolatileAccepted, PersistedWatermark, BackendCommitted, Recovered                                                          int
	CommitNS                                                                                                                   int64
	OriginalPreserved, IncompleteVisible                                                                                       bool
}

func runFaults(candidateName, output, workdir string) error {
	c, ok := candidates[candidateName]
	if !ok {
		return fmt.Errorf("candidate %q unavailable", candidateName)
	}
	if err := os.MkdirAll(workdir, 0o700); err != nil {
		return err
	}
	rows := []faultRow{
		probeConcurrentReader(c, filepath.Join(workdir, c.Name+"-concurrent.dat")),
		probeTailTruncation(c, filepath.Join(workdir, c.Name+"-tail.dat")),
		{Candidate: c.Name, Probe: "disk_full", Status: "BLOCKED_ENV",
			Detail: "no isolated Windows volume quota or injectable database VFS; filling the host disk is unsafe"},
		{Candidate: c.Name, Probe: "writer_slow", Status: "DEFERRED_TC06B",
			Detail: "a synthetic sleep measures the recorder queue/coordinator, not this backend; TC-06B must inject a slow store"},
		{Candidate: c.Name, Probe: "permissions", Status: "BLOCKED_ENV",
			Detail: "a deterministic denial requires mutating Windows ACLs; TC-06B must use an isolated ACL fixture or injectable filesystem"},
	}
	for _, boundary := range []string{"before_append", "before_commit", "after_commit_before_manifest", "after_manifest_replace"} {
		rows = append(rows, probeCrashBoundary(c, filepath.Join(workdir, c.Name+"-"+boundary+".dat"), boundary))
	}
	return writeFaultCSV(output, rows)
}

func probeConcurrentReader(c candidate, path string) faultRow {
	row := faultRow{Candidate: c.Name, Probe: "concurrent_reader", VolatileAccepted: 200}
	writer, err := c.OpenWriter(path)
	if err != nil {
		row.Status, row.Detail = "FAIL", err.Error()
		return row
	}
	fixture := recordsFor(scenario{Name: "probe", ObservedCount: 200, FactEvery: 20})
	for _, rec := range fixture[:200] {
		if err = writer.Append(rec); err != nil {
			break
		}
	}
	if err == nil {
		err = writer.Sync()
	}
	if err != nil {
		row.Status, row.Detail = "FAIL", err.Error()
		writer.Close()
		return row
	}
	if c.SupportsCommit {
		row.PersistedWatermark, row.BackendCommitted = 200, 200
	}
	activeReader, openErr := c.OpenReader(path)
	if openErr == nil {
		var got summary
		got, openErr = activeReader.Summarize(math.MinInt64, math.MaxInt64)
		activeReader.Close()
		row.Recovered = int(got.Records)
	}
	writer.Close()
	if !c.SupportsCommit {
		row.Status = "NO_GO"
		row.Detail = "candidate exposes no durable partial-chunk checkpoint"
		row.IncompleteVisible = openErr != nil || row.Recovered < row.VolatileAccepted
		return row
	}
	if openErr != nil || row.Recovered != row.PersistedWatermark {
		row.Status, row.Detail = "FAIL", fmt.Sprintf("reader error=%v recovered=%d", openErr, row.Recovered)
		return row
	}
	row.Status, row.Detail = "PASS", "committed checkpoint remained readable while writer stayed open"
	return row
}

func probeTailTruncation(c candidate, path string) faultRow {
	row := faultRow{Candidate: c.Name, Probe: "tail_truncation", VolatileAccepted: 210, PersistedWatermark: 210, BackendCommitted: 210}
	fixture := recordsFor(scenario{Name: "probe", ObservedCount: 200, FactEvery: 20})
	if err := writeFixture(c, path, fixture); err != nil {
		row.Status, row.Detail = "FAIL", err.Error()
		return row
	}
	originalHash, err := hashBundle(path)
	if err != nil {
		row.Status, row.Detail = "FAIL", err.Error()
		return row
	}
	recoveryPath := filepath.Join(filepath.Dir(path), "recovery-"+filepath.Base(path))
	if err := copyBundle(path, recoveryPath); err != nil {
		row.Status, row.Detail = "FAIL", err.Error()
		return row
	}
	info, err := os.Stat(recoveryPath)
	if err != nil {
		row.Status, row.Detail = "FAIL", err.Error()
		return row
	}
	cut := int64(4096)
	if info.Size() < cut*2 {
		cut = 17
	}
	if err := os.Truncate(recoveryPath, info.Size()-cut); err != nil {
		row.Status, row.Detail = "FAIL", err.Error()
		return row
	}
	recoveryReader, openErr := c.OpenReader(recoveryPath)
	if openErr == nil {
		var got summary
		got, openErr = recoveryReader.Summarize(math.MinInt64, math.MaxInt64)
		recoveryReader.Close()
		row.Recovered = int(got.Records)
	}
	afterHash, hashErr := hashBundle(path)
	row.OriginalHash, row.RecoveryHash = originalHash, afterHash
	row.OriginalPreserved = hashErr == nil && originalHash == afterHash
	row.IncompleteVisible = openErr != nil || row.Recovered < row.VolatileAccepted
	if !row.OriginalPreserved || !row.IncompleteVisible {
		row.Status, row.Detail = "FAIL", fmt.Sprintf("reader error=%v recovered=%d original_preserved=%t", openErr, row.Recovered, row.OriginalPreserved)
		return row
	}
	row.Status, row.Detail = "PASS", fmt.Sprintf("truncated copy rejected/partial without mutating original: %v", openErr)
	return row
}

type benchmarkManifest struct {
	IntegrityState     string `json:"integrity_state"`
	AccessMode         string `json:"access_mode"`
	PersistedWatermark int    `json:"persisted_watermark"`
}

func probeCrashBoundary(c candidate, path, boundary string) faultRow {
	row := faultRow{
		Candidate: c.Name, Probe: "deterministic_kill", Boundary: boundary,
		VolatileAccepted: 240, PersistedWatermark: 200, BackendCommitted: 200,
		IncompleteVisible: true,
	}
	if boundary == "before_append" {
		row.VolatileAccepted = 200
	}
	if boundary == "after_commit_before_manifest" || boundary == "after_manifest_replace" {
		row.BackendCommitted = 240
	}
	if boundary == "after_manifest_replace" {
		row.PersistedWatermark = 240
	}
	if !c.SupportsCommit {
		row.Status = "NO_GO"
		row.Detail = "backend has no partial-session commit boundary; manifest protocol cannot make an uncommitted chunk durable"
		return row
	}
	executable, err := os.Executable()
	if err != nil {
		row.Status, row.Detail = "FAIL", err.Error()
		return row
	}
	command := exec.Command(executable, "-crash-child", "-candidate", c.Name, "-crash-path", path, "-crash-boundary", boundary)
	stdout, err := command.StdoutPipe()
	if err != nil {
		row.Status, row.Detail = "FAIL", err.Error()
		return row
	}
	command.Stderr = os.Stderr
	if err := command.Start(); err != nil {
		row.Status, row.Detail = "FAIL", err.Error()
		return row
	}
	scanner := bufio.NewScanner(stdout)
	ready := false
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "ready ") {
			for _, field := range strings.Fields(line) {
				if strings.HasPrefix(field, "commit_ns=") {
					value, parseErr := strconv.ParseInt(strings.TrimPrefix(field, "commit_ns="), 10, 64)
					if parseErr != nil {
						row.Status, row.Detail = "FAIL", parseErr.Error()
						command.Process.Kill()
						command.Wait()
						return row
					}
					row.CommitNS = value
				}
			}
			ready = true
			break
		}
	}
	if !ready {
		command.Process.Kill()
		command.Wait()
		row.Status, row.Detail = "FAIL", errors.Join(scanner.Err(), errors.New("child did not reach boundary")).Error()
		return row
	}
	killErr := command.Process.Kill()
	waitErr := command.Wait()
	if killErr != nil || scanner.Err() != nil {
		row.Status, row.Detail = "FAIL", errors.Join(killErr, scanner.Err(), waitErr).Error()
		return row
	}
	originalHash, hashErr := hashBundle(path)
	if hashErr != nil {
		row.Status, row.Detail = "FAIL", hashErr.Error()
		return row
	}
	recoveryPath := filepath.Join(filepath.Dir(path), "recovery-"+filepath.Base(path))
	if err := copyBundle(path, recoveryPath); err != nil {
		row.Status, row.Detail = "FAIL", err.Error()
		return row
	}
	recoveryReader, openErr := c.OpenReader(recoveryPath)
	if openErr == nil {
		var got summary
		got, openErr = recoveryReader.Summarize(math.MinInt64, math.MaxInt64)
		recoveryReader.Close()
		row.Recovered = int(got.Records)
	}
	afterHash, afterErr := hashBundle(path)
	row.OriginalHash, row.RecoveryHash = originalHash, afterHash
	row.OriginalPreserved = afterErr == nil && originalHash == afterHash
	manifest, manifestErr := readBenchmarkManifest(path + ".manifest.json")
	if manifestErr != nil {
		row.Status, row.Detail = "FAIL", manifestErr.Error()
		return row
	}
	recoveredManifest := startupRecoveryManifest(manifest)
	row.IntegrityState = manifest.IntegrityState
	row.AccessMode = manifest.AccessMode
	row.RecoveryIntegrityState = recoveredManifest.IntegrityState
	row.IncompleteVisible = row.RecoveryIntegrityState == "incomplete"
	if openErr != nil || row.Recovered != row.BackendCommitted ||
		manifest.PersistedWatermark != row.PersistedWatermark ||
		!row.OriginalPreserved || !row.IncompleteVisible {
		row.Status, row.Detail = "FAIL", fmt.Sprintf(
			"reader=%v recovered=%d backend=%d watermark=%d/%d original=%t incomplete=%t",
			openErr, row.Recovered, row.BackendCommitted, manifest.PersistedWatermark,
			row.PersistedWatermark, row.OriginalPreserved, row.IncompleteVisible)
		return row
	}
	row.Status = "PASS_BACKEND_LIMIT"
	if row.BackendCommitted > row.PersistedWatermark {
		row.Detail = "backend commit is ahead of the last persisted acceptance watermark; recovery must validate the copy and must not infer an exact accepted-loss count"
	} else {
		row.Detail = "benchmark-only manifest stayed recording, so startup classifies the copied session incomplete"
	}
	return row
}

func startupRecoveryManifest(manifest benchmarkManifest) benchmarkManifest {
	recovered := manifest
	switch manifest.IntegrityState {
	case "complete":
		recovered.IntegrityState = "complete"
	case "incomplete":
		recovered.IntegrityState = "incomplete"
	default:
		recovered.IntegrityState = "incomplete"
	}
	return recovered
}

func runCrashChild(candidateName, path, boundary string) error {
	c, ok := candidates[candidateName]
	if !ok {
		return fmt.Errorf("candidate %q unavailable", candidateName)
	}
	if err := writeBenchmarkManifest(path+".manifest.json", benchmarkManifest{
		IntegrityState: "recording", AccessMode: "read_write", PersistedWatermark: 0,
	}); err != nil {
		return err
	}
	writer, err := c.OpenWriter(path)
	if err != nil {
		return err
	}
	fixture := recordsFor(scenario{Name: "crash", ObservedCount: 400, FactEvery: 20})
	for _, rec := range fixture[:200] {
		if err := writer.Append(rec); err != nil {
			return err
		}
	}
	if err := writer.Sync(); err != nil {
		return err
	}
	if err := writeBenchmarkManifest(path+".manifest.json", benchmarkManifest{
		IntegrityState: "recording", AccessMode: "read_write", PersistedWatermark: 200,
	}); err != nil {
		return err
	}
	if boundary == "before_append" {
		fmt.Println("ready commit_ns=0")
		waitForKill()
	}
	for _, rec := range fixture[200:240] {
		if err := writer.Append(rec); err != nil {
			return err
		}
	}
	if boundary == "before_commit" {
		fmt.Println("ready commit_ns=0")
		waitForKill()
	}
	start := time.Now()
	if err := writer.Sync(); err != nil {
		return err
	}
	commitDuration := time.Since(start)
	if boundary == "after_commit_before_manifest" {
		fmt.Printf("ready commit_ns=%d\n", commitDuration.Nanoseconds())
		waitForKill()
	}
	if boundary != "after_manifest_replace" {
		return fmt.Errorf("unknown crash boundary %q", boundary)
	}
	if err := writeBenchmarkManifest(path+".manifest.json", benchmarkManifest{
		IntegrityState: "recording", AccessMode: "read_write", PersistedWatermark: 240,
	}); err != nil {
		return err
	}
	fmt.Printf("ready commit_ns=%d\n", commitDuration.Nanoseconds())
	waitForKill()
	return nil
}

func waitForKill() {
	for {
		time.Sleep(time.Second)
	}
}

func writeBenchmarkManifest(path string, manifest benchmarkManifest) error {
	data, err := json.Marshal(manifest)
	if err != nil {
		return err
	}
	temp := path + ".tmp"
	file, err := os.OpenFile(temp, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	if _, err = file.Write(data); err == nil {
		err = file.Sync()
	}
	err = errors.Join(err, file.Close())
	if err != nil {
		return err
	}
	return replaceFile(temp, path)
}

func readBenchmarkManifest(path string) (benchmarkManifest, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return benchmarkManifest{}, err
	}
	var manifest benchmarkManifest
	if err := json.Unmarshal(data, &manifest); err != nil {
		return benchmarkManifest{}, err
	}
	return manifest, nil
}

func writeFixture(c candidate, path string, fixture []record) error {
	writer, err := c.OpenWriter(path)
	if err != nil {
		return err
	}
	for _, rec := range fixture {
		if err := writer.Append(rec); err != nil {
			writer.Close()
			return err
		}
	}
	return errors.Join(writer.Sync(), writer.Close())
}

func copyBundle(source, destination string) error {
	for _, suffix := range []string{"", "-wal", "-shm"} {
		input := source + suffix
		data, err := os.ReadFile(input)
		if errors.Is(err, os.ErrNotExist) {
			continue
		}
		if err != nil {
			return err
		}
		if err := os.WriteFile(destination+suffix, data, 0o600); err != nil {
			return err
		}
	}
	return nil
}

func hashBundle(path string) (string, error) {
	digest := sha256.New()
	found := false
	for _, suffix := range []string{"", "-wal", "-shm"} {
		file, err := os.Open(path + suffix)
		if errors.Is(err, os.ErrNotExist) {
			continue
		}
		if err != nil {
			return "", err
		}
		found = true
		if _, err := io.Copy(digest, file); err != nil {
			file.Close()
			return "", err
		}
		file.Close()
	}
	if !found {
		return "", os.ErrNotExist
	}
	return fmt.Sprintf("%x", digest.Sum(nil)), nil
}

func writeFaultCSV(path string, rows []faultRow) error {
	file, err := os.Create(path)
	if err != nil {
		return err
	}
	writer := csv.NewWriter(file)
	if err := writer.Write([]string{"candidate", "probe", "boundary", "status", "detail", "integrity_state", "access_mode", "recovery_integrity_state", "volatile_accepted",
		"persisted_accepted_watermark", "backend_committed", "recovered", "commit_ns",
		"original_preserved", "incomplete_visible", "original_sha256", "after_sha256"}); err != nil {
		file.Close()
		return err
	}
	for _, row := range rows {
		if err := writer.Write([]string{row.Candidate, row.Probe, row.Boundary, row.Status, row.Detail,
			row.IntegrityState, row.AccessMode, row.RecoveryIntegrityState,
			strconv.Itoa(row.VolatileAccepted), strconv.Itoa(row.PersistedWatermark),
			strconv.Itoa(row.BackendCommitted), strconv.Itoa(row.Recovered),
			strconv.FormatInt(row.CommitNS, 10),
			strconv.FormatBool(row.OriginalPreserved), strconv.FormatBool(row.IncompleteVisible),
			row.OriginalHash, row.RecoveryHash}); err != nil {
			file.Close()
			return err
		}
	}
	writer.Flush()
	return errors.Join(writer.Error(), file.Close())
}
