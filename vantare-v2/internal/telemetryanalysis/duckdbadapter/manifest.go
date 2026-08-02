package duckdbadapter

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"sort"
)

const (
	ProtocolVersion = 1
	HelperVersion   = "1"
	DuckDBVersion   = "v1.5.5"
	SchemaVersion   = 1

	manifestFilename = "manifest.json"
	helperFilename   = "vantare-telemetry-reader.exe"
	dllFilename      = "duckdb.dll"
	noticesFilename  = "THIRD_PARTY_NOTICES.md"
	sbomFilename     = "sbom.spdx.json"
	maxManifestBytes = 1024 * 1024
)

var ErrRuntimeUnavailable = errors.New("telemetry analysis runtime unavailable")

type RuntimeFile struct {
	Name   string `json:"name"`
	Size   int64  `json:"size"`
	SHA256 string `json:"sha256"`
}

type RuntimeManifest struct {
	ProtocolVersion int           `json:"protocol_version"`
	HelperVersion   string        `json:"helper_version"`
	DuckDBVersion   string        `json:"duckdb_version"`
	SchemaVersion   int           `json:"schema_version"`
	OS              string        `json:"os"`
	Arch            string        `json:"arch"`
	Files           []RuntimeFile `json:"files"`
}

type TrustedRuntime struct {
	Directory      string
	ManifestSHA256 string
}

type Runtime struct {
	Trust        TrustedRuntime
	ManifestPath string
	Directory    string
	HelperPath   string
	DLLPath      string
	Manifest     RuntimeManifest
}

func LoadRuntime(trust TrustedRuntime) (Runtime, error) {
	runtimeFiles, handles, err := loadRuntimeLocked(trust)
	closeFiles(handles)
	return runtimeFiles, err
}

// LoadRuntimeWithFallback implements the atomic updater rollback contract. It
// only tries two independently trusted, versioned bundles; it never searches
// PATH, the current directory, or an unverified previous installation.
func LoadRuntimeWithFallback(primary, fallback TrustedRuntime) (Runtime, error) {
	runtimeFiles, err := LoadRuntime(primary)
	if err == nil {
		return runtimeFiles, nil
	}
	return LoadRuntime(fallback)
}

// loadRuntimeLocked verifies the trusted manifest and keeps every runtime file
// open without write/delete sharing until the child exits. This closes the
// verify/exec replacement window on Windows.
func loadRuntimeLocked(trust TrustedRuntime) (Runtime, []*os.File, error) {
	if !filepath.IsAbs(trust.Directory) || filepath.Clean(trust.Directory) != trust.Directory || len(trust.ManifestSHA256) != sha256.Size*2 {
		return Runtime{}, nil, ErrRuntimeUnavailable
	}
	if _, err := hex.DecodeString(trust.ManifestSHA256); err != nil {
		return Runtime{}, nil, ErrRuntimeUnavailable
	}
	manifestPath := filepath.Join(trust.Directory, manifestFilename)
	manifestFile, err := openLockedRead(manifestPath)
	if err != nil {
		return Runtime{}, nil, ErrRuntimeUnavailable
	}
	handles := []*os.File{manifestFile}
	fail := func() (Runtime, []*os.File, error) {
		closeFiles(handles)
		return Runtime{}, nil, ErrRuntimeUnavailable
	}
	info, err := manifestFile.Stat()
	if err != nil || !info.Mode().IsRegular() || info.Size() > maxManifestBytes {
		return fail()
	}
	data, err := io.ReadAll(io.LimitReader(manifestFile, maxManifestBytes+1))
	if err != nil || len(data) > maxManifestBytes {
		return fail()
	}
	manifestHash := sha256.Sum256(data)
	if hex.EncodeToString(manifestHash[:]) != trust.ManifestSHA256 {
		return fail()
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	var manifest RuntimeManifest
	if err := decoder.Decode(&manifest); err != nil || decoder.Decode(&struct{}{}) != io.EOF || validateManifest(manifest) != nil {
		return fail()
	}
	if validateRuntimeDirectory(trust.Directory) != nil {
		return fail()
	}
	for _, expected := range manifest.Files {
		file, err := openLockedRead(filepath.Join(trust.Directory, expected.Name))
		if err != nil {
			return fail()
		}
		handles = append(handles, file)
		if verifyRuntimeFile(file, expected) != nil {
			return fail()
		}
	}
	return Runtime{
		Trust: trust, ManifestPath: manifestPath, Directory: trust.Directory,
		HelperPath: filepath.Join(trust.Directory, helperFilename),
		DLLPath:    filepath.Join(trust.Directory, dllFilename), Manifest: manifest,
	}, handles, nil
}

func validateRuntimeDirectory(directory string) error {
	entries, err := os.ReadDir(directory)
	if err != nil {
		return ErrRuntimeUnavailable
	}
	want := []string{manifestFilename, dllFilename, helperFilename, noticesFilename, sbomFilename}
	got := make([]string, 0, len(entries))
	for _, entry := range entries {
		info, err := entry.Info()
		if err != nil || !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 {
			return ErrRuntimeUnavailable
		}
		got = append(got, entry.Name())
	}
	sort.Strings(got)
	sort.Strings(want)
	if !equalStrings(got, want) {
		return ErrRuntimeUnavailable
	}
	return nil
}

func expectedManifest() RuntimeManifest {
	return RuntimeManifest{
		ProtocolVersion: ProtocolVersion, HelperVersion: HelperVersion,
		DuckDBVersion: DuckDBVersion, SchemaVersion: SchemaVersion,
		OS: "windows", Arch: "amd64",
	}
}

func validateManifest(manifest RuntimeManifest) error {
	expected := expectedManifest()
	if manifest.ProtocolVersion != expected.ProtocolVersion || manifest.HelperVersion != expected.HelperVersion ||
		manifest.DuckDBVersion != expected.DuckDBVersion || manifest.SchemaVersion != expected.SchemaVersion ||
		manifest.OS != expected.OS || manifest.Arch != expected.Arch ||
		(runtime.GOOS == "windows" && (manifest.OS != runtime.GOOS || manifest.Arch != runtime.GOARCH)) {
		return ErrRuntimeUnavailable
	}
	want := []string{dllFilename, helperFilename, noticesFilename, sbomFilename}
	sort.Strings(want)
	got := make([]string, 0, len(manifest.Files))
	seen := make(map[string]struct{}, len(manifest.Files))
	for _, file := range manifest.Files {
		if filepath.Base(file.Name) != file.Name || file.Size < 0 || len(file.SHA256) != sha256.Size*2 {
			return ErrRuntimeUnavailable
		}
		if _, err := hex.DecodeString(file.SHA256); err != nil {
			return ErrRuntimeUnavailable
		}
		if _, exists := seen[file.Name]; exists {
			return ErrRuntimeUnavailable
		}
		seen[file.Name] = struct{}{}
		got = append(got, file.Name)
	}
	sort.Strings(got)
	if !equalStrings(got, want) {
		return ErrRuntimeUnavailable
	}
	return nil
}

func verifyRuntimeFile(file *os.File, expected RuntimeFile) error {
	info, err := file.Stat()
	if err != nil || !info.Mode().IsRegular() || info.Size() != expected.Size {
		return ErrRuntimeUnavailable
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return ErrRuntimeUnavailable
	}
	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil || hex.EncodeToString(hash.Sum(nil)) != expected.SHA256 {
		return ErrRuntimeUnavailable
	}
	return nil
}

func closeFiles(files []*os.File) {
	for _, file := range files {
		_ = file.Close()
	}
}

func equalStrings(first, second []string) bool {
	if len(first) != len(second) {
		return false
	}
	for index := range first {
		if first[index] != second[index] {
			return false
		}
	}
	return true
}
