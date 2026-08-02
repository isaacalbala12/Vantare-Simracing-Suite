package recording

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"path/filepath"
	"time"
)

func NewLocalSessionID() (string, error) {
	var entropy [16]byte
	if _, err := rand.Read(entropy[:]); err != nil {
		return "", fmt.Errorf("generate local recording session id: %w", err)
	}
	return "session-" + hex.EncodeToString(entropy[:]), nil
}

const (
	ManifestVersionV1 uint16 = 1
	ActiveDatabaseV1         = "history-v1.sqlite"
)

var ErrInvalidManifest = errors.New("invalid recording manifest")

type IntegrityState string

const (
	IntegrityOpening    IntegrityState = "opening"
	IntegrityRecording  IntegrityState = "recording"
	IntegrityComplete   IntegrityState = "complete"
	IntegrityIncomplete IntegrityState = "incomplete"
	IntegrityRecovering IntegrityState = "recovering"
)

type AccessMode string

const (
	AccessReadWrite AccessMode = "read_write"
	AccessReadOnly  AccessMode = "read_only"
)

type IncompleteReason string

const (
	IncompleteNone             IncompleteReason = ""
	IncompleteInterrupted      IncompleteReason = "interrupted"
	IncompleteQueueFull        IncompleteReason = "queue_full"
	IncompleteStorageFailure   IncompleteReason = "storage_failure"
	IncompleteCommitTimeout    IncompleteReason = "commit_timeout"
	IncompletePermissionDenied IncompleteReason = "permission_denied"
	IncompleteCanceled         IncompleteReason = "canceled"
)

func (r IncompleteReason) Known() bool {
	switch r {
	case IncompleteNone, IncompleteInterrupted, IncompleteQueueFull,
		IncompleteStorageFailure, IncompleteCommitTimeout,
		IncompletePermissionDenied, IncompleteCanceled:
		return true
	default:
		return false
	}
}

type RawCapture struct {
	State string `json:"state"`
}

type SessionManifest struct {
	ManifestVersion         uint16           `json:"manifestVersion"`
	RecordingSchemaVersion  Version          `json:"recordingSchemaVersion"`
	ActiveDatabase          string           `json:"activeDatabase"`
	SessionID               string           `json:"sessionID"`
	SimulatorID             string           `json:"simulatorID"`
	AppBuild                string           `json:"appBuild"`
	IntegrityState          IntegrityState   `json:"integrityState"`
	AccessMode              AccessMode       `json:"accessMode"`
	StartedAtUTC            time.Time        `json:"startedAtUTC"`
	EndedAtUTC              *time.Time       `json:"endedAtUTC,omitempty"`
	PersistedAcceptedCursor Cursor           `json:"persistedAcceptedCursor"`
	CommittedCursor         Cursor           `json:"committedCursor"`
	LastCheckpointAtUTC     *time.Time       `json:"lastCheckpointAtUTC,omitempty"`
	IncompleteReason        IncompleteReason `json:"incompleteReason,omitempty"`
	RawCapture              RawCapture       `json:"rawCapture"`
}

func NewSessionManifest(sessionID, simulatorID, appBuild string, startedAt time.Time) SessionManifest {
	return SessionManifest{
		ManifestVersion:        ManifestVersionV1,
		RecordingSchemaVersion: RecordingVersionV1,
		ActiveDatabase:         ActiveDatabaseV1,
		SessionID:              sessionID,
		SimulatorID:            simulatorID,
		AppBuild:               appBuild,
		IntegrityState:         IntegrityRecording,
		AccessMode:             AccessReadWrite,
		StartedAtUTC:           startedAt,
		RawCapture:             RawCapture{State: "disabled"},
	}
}

func (m SessionManifest) Validate() error {
	if m.ManifestVersion != ManifestVersionV1 ||
		m.RecordingSchemaVersion != RecordingVersionV1 ||
		m.ActiveDatabase != ActiveDatabaseV1 ||
		!safeLocalID(m.SessionID) ||
		!safeEnum(m.SimulatorID) ||
		m.AppBuild == "" ||
		!validIntegrity(m.IntegrityState) ||
		(m.AccessMode != AccessReadWrite && m.AccessMode != AccessReadOnly) ||
		!validUTC(m.StartedAtUTC) ||
		!m.PersistedAcceptedCursor.Valid() ||
		!m.CommittedCursor.Valid() ||
		!m.IncompleteReason.Known() ||
		m.RawCapture.State != "disabled" {
		return ErrInvalidManifest
	}
	if filepath.IsAbs(m.ActiveDatabase) || filepath.Base(m.ActiveDatabase) != m.ActiveDatabase {
		return ErrInvalidManifest
	}
	if m.EndedAtUTC != nil && (!validUTC(*m.EndedAtUTC) || m.EndedAtUTC.Before(m.StartedAtUTC)) {
		return ErrInvalidManifest
	}
	if m.LastCheckpointAtUTC != nil &&
		(!validUTC(*m.LastCheckpointAtUTC) ||
			m.LastCheckpointAtUTC.Before(m.StartedAtUTC) ||
			(m.EndedAtUTC != nil && m.LastCheckpointAtUTC.After(*m.EndedAtUTC))) {
		return ErrInvalidManifest
	}
	if cursorGreater(m.PersistedAcceptedCursor, m.CommittedCursor) {
		return ErrInvalidManifest
	}
	switch m.IntegrityState {
	case IntegrityOpening, IntegrityRecording, IntegrityRecovering:
		if m.EndedAtUTC != nil || m.IncompleteReason != IncompleteNone {
			return ErrInvalidManifest
		}
	case IntegrityComplete:
		if m.EndedAtUTC == nil || m.IncompleteReason != IncompleteNone ||
			m.PersistedAcceptedCursor != m.CommittedCursor {
			return ErrInvalidManifest
		}
	case IntegrityIncomplete:
		if m.EndedAtUTC == nil || m.IncompleteReason == IncompleteNone {
			return ErrInvalidManifest
		}
	}
	return nil
}

func cursorGreater(left, right Cursor) bool {
	if left.IsZero() {
		return false
	}
	if right.IsZero() {
		return true
	}
	return right.Before(left)
}

func (m SessionManifest) EffectiveIntegrity() IntegrityState {
	switch m.IntegrityState {
	case IntegrityOpening, IntegrityRecording, IntegrityRecovering:
		return IntegrityIncomplete
	default:
		return m.IntegrityState
	}
}

func validIntegrity(value IntegrityState) bool {
	switch value {
	case IntegrityOpening, IntegrityRecording, IntegrityComplete, IntegrityIncomplete, IntegrityRecovering:
		return true
	default:
		return false
	}
}

func safeLocalID(value string) bool {
	if len(value) < 8 || len(value) > 128 {
		return false
	}
	for _, character := range value {
		if (character >= 'a' && character <= 'z') ||
			(character >= 'A' && character <= 'Z') ||
			(character >= '0' && character <= '9') ||
			character == '-' || character == '_' {
			continue
		}
		return false
	}
	return true
}

func safeEnum(value string) bool {
	if value == "" || len(value) > 32 {
		return false
	}
	for _, character := range value {
		if (character >= 'a' && character <= 'z') || character == '-' || character == '_' {
			continue
		}
		return false
	}
	return true
}
