package reportdraft

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"sync"
	"unicode/utf8"
)

const (
	SchemaVersion   = 1
	DirectoryName   = "testing-center"
	FileName        = "testing-center-report-draft.json"
	MaxEncodedBytes = 16 * 1024

	maxActionBytes       = 2048
	maxExpectedBytes     = 2048
	maxObservedBytes     = 2048
	maxContextBytes      = 4096
	idempotencyEntropy   = 32
	idempotencyKeyPrefix = "draft_"
)

var (
	ErrNotFound                  = errors.New("testing center report draft not found")
	ErrInvalidDraft              = errors.New("testing center report draft is invalid")
	ErrInvalidStoredDraftRemoved = errors.New("invalid testing center report draft removed")
	ErrInvalidPath               = errors.New("testing center report draft path is invalid")

	idempotencyKeyPattern = regexp.MustCompile(`^draft_[0-9a-f]{64}$`)
)

// Fields contains only resumable form text. Consent, diagnostics, logs,
// sessions, tokens and remote identity are deliberately absent.
type Fields struct {
	ActionText   string `json:"actionText"`
	ExpectedText string `json:"expectedText"`
	ObservedText string `json:"observedText"`
	ContextText  string `json:"contextText,omitempty"`
	Module       string `json:"module,omitempty"`
}

// Draft is the complete private on-disk document. IdempotencyKey is generated
// by the backend and remains stable across saves until the draft is discarded.
type Draft struct {
	SchemaVersion  int    `json:"schemaVersion"`
	IdempotencyKey string `json:"idempotencyKey"`
	Fields
}

type Store struct {
	path   string
	random io.Reader
	mu     sync.Mutex
}

func NewStore(path string) (*Store, error) {
	if path == "" || !filepath.IsAbs(path) || filepath.Clean(path) != path ||
		filepath.Base(path) != FileName ||
		filepath.Base(filepath.Dir(path)) != DirectoryName {
		return nil, ErrInvalidPath
	}
	return &Store{path: path, random: rand.Reader}, nil
}

func (s *Store) Save(ctx context.Context, fields Fields) (Draft, error) {
	if s == nil {
		return Draft{}, ErrInvalidPath
	}
	if err := validateFields(fields); err != nil {
		return Draft{}, err
	}
	if err := contextError(ctx); err != nil {
		return Draft{}, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if err := contextError(ctx); err != nil {
		return Draft{}, err
	}

	idempotencyKey := ""
	existing, err := s.loadLocked()
	switch {
	case err == nil:
		idempotencyKey = existing.IdempotencyKey
	case errors.Is(err, ErrNotFound):
		idempotencyKey, err = newIdempotencyKey(s.random)
		if err != nil {
			return Draft{}, err
		}
	default:
		return Draft{}, err
	}

	draft := Draft{
		SchemaVersion:  SchemaVersion,
		IdempotencyKey: idempotencyKey,
		Fields:         fields,
	}
	encoded, err := encode(draft)
	if err != nil {
		return Draft{}, err
	}
	if err := contextError(ctx); err != nil {
		return Draft{}, err
	}
	if err := s.prepareDirectory(true); err != nil {
		return Draft{}, err
	}
	if _, err := writeAtomic(s.path, encoded); err != nil {
		return Draft{}, err
	}
	if err := os.Chmod(s.path, 0o600); err != nil {
		return Draft{}, fmt.Errorf("protect report draft: %w", err)
	}
	return draft, nil
}

func (s *Store) Load(ctx context.Context) (Draft, error) {
	if s == nil {
		return Draft{}, ErrInvalidPath
	}
	if err := contextError(ctx); err != nil {
		return Draft{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := contextError(ctx); err != nil {
		return Draft{}, err
	}
	return s.loadLocked()
}

func (s *Store) Discard(ctx context.Context) error {
	if s == nil {
		return ErrInvalidPath
	}
	if err := contextError(ctx); err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := contextError(ctx); err != nil {
		return err
	}
	if err := s.prepareDirectory(false); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return err
	}
	if err := os.Remove(s.path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("discard report draft: %w", err)
	}
	return nil
}

func (s *Store) loadLocked() (Draft, error) {
	if err := s.prepareDirectory(false); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return Draft{}, ErrNotFound
		}
		return Draft{}, err
	}
	info, err := os.Lstat(s.path)
	if errors.Is(err, os.ErrNotExist) {
		return Draft{}, ErrNotFound
	}
	if err != nil {
		return Draft{}, fmt.Errorf("inspect report draft: %w", err)
	}
	if !info.Mode().IsRegular() || info.Size() <= 0 || info.Size() > MaxEncodedBytes {
		return Draft{}, s.removeInvalidLocked()
	}
	file, err := os.Open(s.path)
	if err != nil {
		return Draft{}, fmt.Errorf("open report draft: %w", err)
	}
	openedInfo, err := file.Stat()
	if err != nil {
		_ = file.Close()
		return Draft{}, fmt.Errorf("inspect opened report draft: %w", err)
	}
	if !openedInfo.Mode().IsRegular() || !os.SameFile(info, openedInfo) {
		_ = file.Close()
		return Draft{}, ErrInvalidPath
	}
	if err := file.Chmod(0o600); err != nil {
		_ = file.Close()
		return Draft{}, fmt.Errorf("protect report draft: %w", err)
	}
	raw, err := io.ReadAll(io.LimitReader(file, MaxEncodedBytes+1))
	if err != nil {
		_ = file.Close()
		return Draft{}, fmt.Errorf("read report draft: %w", err)
	}
	if err := file.Close(); err != nil {
		return Draft{}, fmt.Errorf("close report draft: %w", err)
	}
	if len(raw) == 0 || len(raw) > MaxEncodedBytes {
		return Draft{}, s.removeInvalidLocked()
	}
	draft, err := decode(raw)
	if err != nil {
		return Draft{}, s.removeInvalidLocked()
	}
	return draft, nil
}

func (s *Store) prepareDirectory(create bool) error {
	directory := filepath.Dir(s.path)
	if create {
		if err := os.MkdirAll(directory, 0o700); err != nil {
			return fmt.Errorf("create report draft directory: %w", err)
		}
	}
	info, err := os.Lstat(directory)
	if err != nil {
		return fmt.Errorf("inspect report draft directory: %w", err)
	}
	if !info.IsDir() || reportDraftPathLinked(info) {
		return fmt.Errorf("%w: report draft directory is not private", ErrInvalidPath)
	}
	if err := os.Chmod(directory, 0o700); err != nil {
		return fmt.Errorf("protect report draft directory: %w", err)
	}
	return nil
}

func (s *Store) removeInvalidLocked() error {
	if err := os.Remove(s.path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("remove invalid report draft: %w", err)
	}
	return ErrInvalidStoredDraftRemoved
}

func encode(draft Draft) ([]byte, error) {
	if err := validateDraft(draft); err != nil {
		return nil, err
	}
	encoded, err := json.Marshal(draft)
	if err != nil {
		return nil, fmt.Errorf("encode report draft: %w", err)
	}
	if len(encoded) == 0 || len(encoded) > MaxEncodedBytes {
		return nil, ErrInvalidDraft
	}
	return encoded, nil
}

func decode(raw []byte) (Draft, error) {
	var draft Draft
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&draft); err != nil {
		return Draft{}, fmt.Errorf("%w: decode", ErrInvalidDraft)
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		return Draft{}, fmt.Errorf("%w: trailing data", ErrInvalidDraft)
	}
	if err := validateDraft(draft); err != nil {
		return Draft{}, err
	}
	return draft, nil
}

func validateDraft(draft Draft) error {
	if draft.SchemaVersion != SchemaVersion ||
		!idempotencyKeyPattern.MatchString(draft.IdempotencyKey) {
		return ErrInvalidDraft
	}
	return validateFields(draft.Fields)
}

func validateFields(fields Fields) error {
	for _, value := range []string{
		fields.ActionText, fields.ExpectedText, fields.ObservedText,
		fields.ContextText, fields.Module,
	} {
		if !utf8.ValidString(value) {
			return ErrInvalidDraft
		}
	}
	if len(fields.ActionText) > maxActionBytes ||
		len(fields.ExpectedText) > maxExpectedBytes ||
		len(fields.ObservedText) > maxObservedBytes ||
		len(fields.ContextText) > maxContextBytes ||
		!knownModule(fields.Module) {
		return ErrInvalidDraft
	}
	return nil
}

func knownModule(value string) bool {
	switch value {
	case "", "hub", "launcher", "settings", "overlay_studio",
		"overlay_runtime", "telemetry", "telemetry_analysis", "engineer",
		"strategy", "calendar", "billing", "account", "updater",
		"testing_center", "unknown":
		return true
	default:
		return false
	}
}

func newIdempotencyKey(source io.Reader) (string, error) {
	if source == nil {
		return "", fmt.Errorf("generate report draft idempotency key: missing entropy source")
	}
	entropy := make([]byte, idempotencyEntropy)
	if _, err := io.ReadFull(source, entropy); err != nil {
		return "", fmt.Errorf("generate report draft idempotency key: %w", err)
	}
	return idempotencyKeyPrefix + hex.EncodeToString(entropy), nil
}

func contextError(ctx context.Context) error {
	if ctx == nil {
		return context.Canceled
	}
	return ctx.Err()
}
