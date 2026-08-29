package config

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

const maxProfileFileBytes = 5 * 1024 * 1024

var ErrProfileConflict = errors.New("profile revision conflict")

// ProfileFileTooLargeError is returned when a profile file exceeds the read limit.
type ProfileFileTooLargeError struct {
	Path string
	Size int64
}

func (e *ProfileFileTooLargeError) Error() string {
	return fmt.Sprintf("profile file %s exceeds maximum size (%d bytes)", e.Path, e.Size)
}

// ProfileDocumentStore accepts legacy profiles and writes only V4 documents.
type ProfileDocumentStore struct{}

// Load is the compatibility adapter for runtime consumers that still use V3
// Go type names. The underlying reader and writer are V4.
func (ProfileDocumentStore) Load(path string) (*LoadedProfileV3, error) {
	loaded, err := (ProfileDocumentStore{}).LoadV4(path)
	if err != nil {
		return nil, err
	}
	return &LoadedProfileV3{
		Document:         ConvertProfileV4ToV3(loaded.Document),
		Revision:         loaded.Revision,
		MigratedFrom:     loaded.MigratedFrom,
		MigrationNotices: loaded.MigrationNotices,
	}, nil
}

func (ProfileDocumentStore) LoadV4(path string) (*LoadedProfileV4, error) {
	data, err := readProfileFileLimited(path)
	if err != nil {
		return nil, fmt.Errorf("read profile %s: %w", path, err)
	}
	revision := profileRevision(data)
	doc, migratedFrom, notices, err := MigrateProfileJSONToV4(data)
	if err != nil {
		return nil, fmt.Errorf("load profile %s: %w", path, err)
	}
	return &LoadedProfileV4{
		Document:         doc,
		Revision:         revision,
		MigratedFrom:     migratedFrom,
		MigrationNotices: notices,
	}, nil
}

// Save keeps the old call shape while making its persisted representation V4.
func (ProfileDocumentStore) Save(path, expectedRevision string, doc *ProfileDocumentV3, migratedFrom int) (string, error) {
	if doc == nil {
		return "", fmt.Errorf("save profile %s: document is nil", path)
	}
	if err := ValidateProfileDocumentV3(NormalizeProfileDocumentV3(doc)); err != nil {
		return "", err
	}
	return (ProfileDocumentStore{}).SaveV4(path, expectedRevision, ConvertProfileV3ToV4(doc), migratedFrom)
}

// SaveV4 validates and atomically persists a V4 profile document.
func (ProfileDocumentStore) SaveV4(path, expectedRevision string, doc *ProfileDocumentV4, migratedFrom int) (string, error) {
	if doc == nil {
		return "", fmt.Errorf("save profile %s: document is nil", path)
	}
	normalized := NormalizeProfileDocumentV4(doc)
	if err := ValidateProfileDocumentV4(normalized); err != nil {
		return "", err
	}

	currentRevision, err := currentProfileRevision(path)
	if err != nil {
		return "", fmt.Errorf("save profile %s: %w", path, err)
	}
	if currentRevision != "" || expectedRevision != "" {
		if currentRevision != expectedRevision {
			return "", ErrProfileConflict
		}
	}

	if currentRevision != "" && migratedFrom == ProfileSchemaVersionV3 {
		if err := ensureV3Backup(path); err != nil {
			return "", fmt.Errorf("save profile %s: %w", path, err)
		}
	} else if currentRevision != "" && migratedFrom != ProfileSchemaVersionV4 {
		if err := ensurePreV3Backup(path, migratedFrom); err != nil {
			return "", fmt.Errorf("save profile %s: %w", path, err)
		}
	}

	payload, err := marshalProfileDocumentV4(normalized)
	if err != nil {
		return "", fmt.Errorf("save profile %s: %w", path, err)
	}
	if len(payload) > maxProfileFileBytes {
		return "", &ProfileFileTooLargeError{Path: path, Size: int64(len(payload))}
	}
	if err := atomicWriteFile(path, payload, 0644); err != nil {
		return "", fmt.Errorf("save profile %s: %w", path, err)
	}
	return profileRevision(payload), nil
}

func ensureV3Backup(path string) error {
	extension := filepath.Ext(path)
	backupPath := strings.TrimSuffix(path, extension) + ".v3.bak"
	if _, err := os.Stat(backupPath); err == nil {
		return nil
	} else if !os.IsNotExist(err) {
		return err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	if err := atomicWriteFile(backupPath, data, 0644); err != nil {
		return fmt.Errorf("write backup %s: %w", backupPath, err)
	}
	return nil
}

func readProfileFileLimited(path string) ([]byte, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	limited := io.LimitReader(file, maxProfileFileBytes+1)
	data, err := io.ReadAll(limited)
	if err != nil {
		return nil, err
	}
	if len(data) > maxProfileFileBytes {
		return nil, &ProfileFileTooLargeError{Path: path, Size: int64(len(data))}
	}
	return data, nil
}

func currentProfileRevision(path string) (string, error) {
	data, err := readProfileFileLimited(path)
	if err != nil {
		if os.IsNotExist(err) {
			return "", nil
		}
		return "", err
	}
	if len(data) == 0 {
		return "", nil
	}
	return profileRevision(data), nil
}

func ensurePreV3Backup(path string, migratedFrom int) error {
	if migratedFrom == ProfileSchemaVersionV3 {
		return nil
	}
	backupPath := path + ".pre-v3.bak"
	if _, err := os.Stat(backupPath); err == nil {
		return nil
	} else if !os.IsNotExist(err) {
		return err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	if err := atomicWriteFile(backupPath, data, 0644); err != nil {
		return fmt.Errorf("write backup %s: %w", backupPath, err)
	}
	return nil
}

func marshalProfileDocumentV3(doc *ProfileDocumentV3) ([]byte, error) {
	data, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("marshal profile: %w", err)
	}
	return data, nil
}

func marshalProfileDocumentV4(doc *ProfileDocumentV4) ([]byte, error) {
	data, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("marshal profile v4: %w", err)
	}
	return data, nil
}

func profileRevision(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}
