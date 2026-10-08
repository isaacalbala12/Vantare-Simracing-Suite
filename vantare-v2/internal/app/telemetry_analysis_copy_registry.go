package app

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
)

const maxTelemetrySourceCopies = 1024

var (
	ErrTelemetryAnalysisCopyUnavailable     = errors.New("no verified telemetry copy is available for this source")
	ErrTelemetryAnalysisCopyChanged         = errors.New("the saved telemetry copy changed")
	ErrTelemetryAnalysisOriginalPresent     = errors.New("the original telemetry file is still present")
	ErrTelemetryAnalysisCopyRegistryFailure = errors.New("the telemetry copy registry is unavailable or damaged")
)

type telemetrySourceCopyRecord struct {
	Version       int    `json:"version"`
	SourceID      string `json:"sourceId"`
	OriginalPath  string `json:"originalPath"`
	CopyPath      string `json:"copyPath"`
	ContentSHA256 string `json:"contentSha256"`
	SizeBytes     int64  `json:"sizeBytes"`
}

func (service *TelemetryAnalysisService) copyRegistryDirectory() (string, error) {
	if service.cfg.CorrectionRoot == "" {
		return "", ErrTelemetryAnalysisCopyRegistryFailure
	}
	return filepath.Join(service.cfg.CorrectionRoot, "source-copies"), nil
}

func (service *TelemetryAnalysisService) recordVerifiedCopy(session *telemetryAnalysisSession, copyPath string) (returnErr error) {
	service.copyRegistryMu.Lock()
	defer service.copyRegistryMu.Unlock()
	directory, err := service.copyRegistryDirectory()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(directory, 0o700); err != nil {
		return ErrTelemetryAnalysisCopyRegistryFailure
	}
	info, err := os.Lstat(directory)
	if err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return ErrTelemetryAnalysisCopyRegistryFailure
	}
	entries, err := os.ReadDir(directory)
	if err != nil || len(entries) >= maxTelemetrySourceCopies {
		return ErrTelemetryAnalysisCopyRegistryFailure
	}
	manifest := session.artifact.Manifest()
	record := telemetrySourceCopyRecord{Version: 1, SourceID: manifest.DedupeKey, OriginalPath: filepath.Clean(session.sourcePath),
		CopyPath: copyPath, ContentSHA256: manifest.ContentSHA256, SizeBytes: manifest.Size}
	if !validTelemetrySourceCopyRecord(record) {
		return ErrTelemetryAnalysisCopyRegistryFailure
	}
	data, err := json.Marshal(record)
	if err != nil {
		return ErrTelemetryAnalysisCopyRegistryFailure
	}
	identifier, err := newTelemetryAnalysisSessionID()
	if err != nil {
		return ErrTelemetryAnalysisCopyRegistryFailure
	}
	temporary, err := os.CreateTemp(directory, ".copy-*.tmp")
	if err != nil {
		return ErrTelemetryAnalysisCopyRegistryFailure
	}
	temporaryPath := temporary.Name()
	defer func() {
		if cleanupErr := os.Remove(temporaryPath); cleanupErr != nil && !errors.Is(cleanupErr, os.ErrNotExist) {
			returnErr = errors.Join(returnErr, ErrTelemetryAnalysisCopyRegistryFailure)
		}
	}()
	if _, err := temporary.Write(data); err != nil {
		if closeErr := temporary.Close(); closeErr != nil {
			return ErrTelemetryAnalysisCopyRegistryFailure
		}
		return ErrTelemetryAnalysisCopyRegistryFailure
	}
	if err := temporary.Sync(); err != nil {
		if closeErr := temporary.Close(); closeErr != nil {
			return ErrTelemetryAnalysisCopyRegistryFailure
		}
		return ErrTelemetryAnalysisCopyRegistryFailure
	}
	if err := temporary.Close(); err != nil {
		return ErrTelemetryAnalysisCopyRegistryFailure
	}
	if err := os.Rename(temporaryPath, filepath.Join(directory, identifier+".json")); err != nil {
		return ErrTelemetryAnalysisCopyRegistryFailure
	}
	return nil
}

func validTelemetrySourceCopyRecord(record telemetrySourceCopyRecord) bool {
	return record.Version == 1 && len(record.SourceID) == 64 && len(record.ContentSHA256) == 64 &&
		isLowerHex(record.SourceID) && isLowerHex(record.ContentSHA256) && record.SizeBytes > 0 &&
		cleanAbsolutePath(record.OriginalPath) && cleanAbsolutePath(record.CopyPath) && record.OriginalPath != record.CopyPath &&
		strings.EqualFold(filepath.Ext(record.CopyPath), ".duckdb")
}

func isLowerHex(value string) bool {
	for _, char := range value {
		if !((char >= '0' && char <= '9') || (char >= 'a' && char <= 'f')) {
			return false
		}
	}
	return true
}

func (service *TelemetryAnalysisService) readVerifiedCopyRecords() ([]telemetrySourceCopyRecord, error) {
	service.copyRegistryMu.Lock()
	defer service.copyRegistryMu.Unlock()
	directory, err := service.copyRegistryDirectory()
	if err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(directory)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil || len(entries) > maxTelemetrySourceCopies {
		return nil, ErrTelemetryAnalysisCopyRegistryFailure
	}
	records := make([]telemetrySourceCopyRecord, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		info, err := entry.Info()
		if err != nil || !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 || info.Size() > 8192 {
			return nil, ErrTelemetryAnalysisCopyRegistryFailure
		}
		data, err := os.ReadFile(filepath.Join(directory, entry.Name()))
		if err != nil {
			return nil, ErrTelemetryAnalysisCopyRegistryFailure
		}
		var record telemetrySourceCopyRecord
		if err := json.Unmarshal(data, &record); err != nil || !validTelemetrySourceCopyRecord(record) {
			return nil, ErrTelemetryAnalysisCopyRegistryFailure
		}
		records = append(records, record)
	}
	return records, nil
}

func verifyTelemetrySourceCopy(ctx context.Context, record telemetrySourceCopyRecord) (returnErr error) {
	info, err := os.Lstat(record.CopyPath)
	if errors.Is(err, os.ErrNotExist) {
		return ErrTelemetryAnalysisCopyUnavailable
	}
	if err != nil || !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 || info.Size() != record.SizeBytes {
		return ErrTelemetryAnalysisCopyChanged
	}
	file, err := os.Open(record.CopyPath)
	if err != nil {
		return ErrTelemetryAnalysisCopyUnavailable
	}
	defer func() {
		if closeErr := file.Close(); closeErr != nil {
			returnErr = errors.Join(returnErr, ErrTelemetryAnalysisCopyChanged)
		}
	}()
	hash := sha256.New()
	buffer := make([]byte, 32*1024)
	var size int64
	for {
		if err := ctx.Err(); err != nil {
			return err
		}
		read, readErr := file.Read(buffer)
		if read > 0 {
			size += int64(read)
			if _, err := hash.Write(buffer[:read]); err != nil {
				return ErrTelemetryAnalysisCopyChanged
			}
		}
		if readErr == io.EOF {
			break
		}
		if readErr != nil || size > record.SizeBytes {
			return ErrTelemetryAnalysisCopyChanged
		}
	}
	if size != record.SizeBytes || hex.EncodeToString(hash.Sum(nil)) != record.ContentSHA256 {
		return ErrTelemetryAnalysisCopyChanged
	}
	return nil
}
