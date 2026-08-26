package repository

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
)

type MigrationStep struct {
	From string `json:"from"`
	To   string `json:"to"`
}

// MigrateRepositoryJSON is the only version gate for repository envelopes.
// Version two keeps every v1 lifecycle document and adds the optional
// event-oriented Strategy document. A migrated v1 repository has no event
// document until the first event command writes one.
func MigrateRepositoryJSON(document []byte) ([]byte, []MigrationStep, error) {
	if err := rejectDuplicateJSONKeys(document); err != nil {
		return nil, nil, fmt.Errorf("%w: %v", ErrCorruptRepository, err)
	}
	var header struct {
		RepositoryVersion string `json:"repositoryVersion"`
	}
	decoder := json.NewDecoder(bytes.NewReader(document))
	if err := decoder.Decode(&header); err != nil {
		return nil, nil, fmt.Errorf("%w: decode version: %v", ErrCorruptRepository, err)
	}
	switch header.RepositoryVersion {
	case RepositoryVersion:
		return document, nil, nil
	case RepositoryVersionV1:
		return migrateRepositoryV1(document)
	default:
		return nil, nil, fmt.Errorf("%w: %q", ErrUnsupportedRepositoryVersion, header.RepositoryVersion)
	}
}

func migrateRepositoryV1(document []byte) ([]byte, []MigrationStep, error) {
	decoder := json.NewDecoder(bytes.NewReader(document))
	decoder.DisallowUnknownFields()
	var envelope diskEnvelope
	if err := decoder.Decode(&envelope); err != nil {
		return nil, nil, fmt.Errorf("%w: decode v1 envelope: %v", ErrCorruptRepository, err)
	}
	if err := ensureJSONEOF(decoder); err != nil {
		return nil, nil, fmt.Errorf("%w: decode v1 envelope: %v", ErrCorruptRepository, err)
	}
	if envelope.HashAlgorithm != repositoryHashV1 {
		return nil, nil, fmt.Errorf("%w: unsupported repository hash algorithm", ErrCorruptRepository)
	}
	if len(envelope.StrategyDocument) > 0 {
		return nil, nil, fmt.Errorf("%w: v1 repository cannot contain strategyDocument", ErrCorruptRepository)
	}
	wantHash, err := hashEnvelope(envelope)
	if err != nil {
		return nil, nil, err
	}
	if envelope.ContentHash != wantHash {
		return nil, nil, fmt.Errorf("%w: repository content hash mismatch", ErrCorruptRepository)
	}

	envelope.RepositoryVersion = RepositoryVersion
	envelope.ContentHash, err = hashEnvelope(envelope)
	if err != nil {
		return nil, nil, err
	}
	migrated, err := json.MarshalIndent(envelope, "", "  ")
	if err != nil {
		return nil, nil, fmt.Errorf("encode migrated strategy repository: %w", err)
	}
	migrated = append(migrated, '\n')
	steps := []MigrationStep{{From: RepositoryVersionV1, To: RepositoryVersion}}
	return migrated, steps, nil
}

func rejectDuplicateJSONKeys(document []byte) error {
	decoder := json.NewDecoder(bytes.NewReader(document))
	var walk func() error
	walk = func() error {
		token, err := decoder.Token()
		if err != nil {
			return err
		}
		delimiter, ok := token.(json.Delim)
		if !ok {
			return nil
		}
		switch delimiter {
		case '{':
			keys := make(map[string]struct{})
			for decoder.More() {
				keyToken, err := decoder.Token()
				if err != nil {
					return err
				}
				key, ok := keyToken.(string)
				if !ok {
					return fmt.Errorf("object key is not a string")
				}
				if _, exists := keys[key]; exists {
					return fmt.Errorf("duplicate object key %q", key)
				}
				keys[key] = struct{}{}
				if err := walk(); err != nil {
					return err
				}
			}
			closing, err := decoder.Token()
			if err != nil {
				return err
			}
			if closing != json.Delim('}') {
				return fmt.Errorf("object is not closed")
			}
		case '[':
			for decoder.More() {
				if err := walk(); err != nil {
					return err
				}
			}
			closing, err := decoder.Token()
			if err != nil {
				return err
			}
			if closing != json.Delim(']') {
				return fmt.Errorf("array is not closed")
			}
		default:
			return fmt.Errorf("unexpected JSON delimiter %q", delimiter)
		}
		return nil
	}
	if err := walk(); err != nil {
		return err
	}
	if _, err := decoder.Token(); err == nil {
		return fmt.Errorf("repository document contains trailing data")
	} else if !errors.Is(err, io.EOF) {
		return err
	}
	return nil
}
