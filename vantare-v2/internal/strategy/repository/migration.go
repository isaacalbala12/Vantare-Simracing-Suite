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
// Version one has no legacy predecessor, so the current migration is an exact
// no-op. Future versions must add an explicit step and fixture here.
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
	if header.RepositoryVersion != RepositoryVersion {
		return nil, nil, fmt.Errorf("%w: %q", ErrUnsupportedRepositoryVersion, header.RepositoryVersion)
	}
	return document, nil, nil
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
