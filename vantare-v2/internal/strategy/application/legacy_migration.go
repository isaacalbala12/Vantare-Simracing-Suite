package application

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"reflect"
	"sort"
	"strings"
	"time"

	strategydocument "github.com/vantare/overlays/v2/internal/strategy/document"
	"github.com/vantare/overlays/v2/internal/strategy/repository"
)

const (
	legacyEventsStorageKey          = "vantare.v03orbit.strategy.events"
	legacyStrategyStorageKey        = "vantare.v03orbit.strategy"
	legacyMigrationStatusBackedUp   = "backed_up"
	legacyMigrationStatusCommitted  = "committed"
	legacyMigrationStatusRolledBack = "rolled_back"
	maxLegacyStorageBytes           = 4 << 20
)

// PreviewLegacyMigration is the pure migration engine. The application
// methods wrap it with the durable backup journal and repository transaction.
func PreviewLegacyMigration(sources []LegacyStorageSource, migratedAt time.Time) (LegacyMigrationPreview, error) {
	fingerprint, ordered, err := validateLegacySources(sources)
	if err != nil {
		return LegacyMigrationPreview{}, err
	}
	return buildLegacyMigrationPreview(ordered, fingerprint, migratedAt, nil, nil)
}

func (service *Service[T]) PreviewLegacyMigration(ctx context.Context, command LegacyMigrationCommand) (Result[T], error) {
	if err := validateLegacyMigrationCommand(command, OperationPreviewLegacyMigration, false); err != nil {
		return Result[T]{}, err
	}
	snapshot, sources, fingerprint, err := service.ensureLegacyBackup(ctx, command)
	if err != nil {
		return Result[T]{}, err
	}
	meta := snapshot.StrategyDocument.MigrationMeta
	if meta.Status == legacyMigrationStatusCommitted {
		preview := previewFromPersisted(*snapshot.StrategyDocument, true, false)
		return legacyMigrationResult(command.CommandID, snapshot, preview), nil
	}
	preview, err := buildLegacyMigrationPreview(sources, fingerprint, command.MigratedAt, meta.PreviousEvents, meta.PreviousActiveEventID)
	if err != nil {
		return Result[T]{}, err
	}
	carryLegacyMigrationHistory(&preview.Document, *snapshot.StrategyDocument)
	return legacyMigrationResult(command.CommandID, snapshot, preview), nil
}

func (service *Service[T]) MigrateLegacy(ctx context.Context, command LegacyMigrationCommand) (Result[T], error) {
	if err := validateLegacyMigrationCommand(command, OperationMigrateLegacy, true); err != nil {
		return Result[T]{}, err
	}
	snapshot, sources, fingerprint, err := service.ensureLegacyBackup(ctx, command)
	if err != nil {
		return Result[T]{}, err
	}
	if command.ConfirmedFingerprint != fingerprint {
		return Result[T]{}, applicationError(ErrorLegacyMigrationConflict, "confirmedFingerprint", ErrLegacyMigrationConflict)
	}
	meta := snapshot.StrategyDocument.MigrationMeta
	if meta.Status == legacyMigrationStatusCommitted {
		preview := previewFromPersisted(*snapshot.StrategyDocument, true, false)
		return legacyMigrationResult(command.CommandID, snapshot, preview), nil
	}
	if meta.Status != legacyMigrationStatusBackedUp {
		return Result[T]{}, applicationError(ErrorLegacyMigrationConflict, "migrationMeta.status", ErrLegacyMigrationConflict)
	}
	preview, err := buildLegacyMigrationPreview(sources, fingerprint, command.MigratedAt, meta.PreviousEvents, meta.PreviousActiveEventID)
	if err != nil {
		return Result[T]{}, err
	}
	carryLegacyMigrationHistory(&preview.Document, *snapshot.StrategyDocument)
	preview.Document.MigrationMeta.Status = legacyMigrationStatusCommitted
	commit, err := service.repository.Commit(ctx, snapshot.Version, repository.ChangeSet[T]{StrategyDocument: &preview.Document})
	if err != nil {
		if errors.Is(err, repository.ErrStaleWrite) {
			return Result[T]{}, applicationError(ErrorStaleCommand, "expectedRepositoryVersion", errors.Join(ErrStaleCommand, err))
		}
		return Result[T]{}, err
	}
	preview.Imported = true
	return legacyMigrationResult(command.CommandID, commit.Snapshot, preview), nil
}

func (service *Service[T]) RollbackLegacyMigration(ctx context.Context, command RollbackLegacyMigrationCommand) (Result[T], error) {
	if err := validateHeader(command.CommandHeader, OperationRollbackLegacyMigration); err != nil {
		return Result[T]{}, err
	}
	if strings.TrimSpace(command.JournalID) == "" || command.RolledBackAt.IsZero() {
		return Result[T]{}, applicationError(ErrorInvalidCommand, "journalId", ErrInvalidCommand)
	}
	snapshot, err := service.repository.Snapshot(ctx)
	if err != nil {
		return Result[T]{}, err
	}
	if snapshot.Version != command.ExpectedRepositoryVersion {
		return Result[T]{}, applicationError(ErrorStaleCommand, "expectedRepositoryVersion", ErrStaleCommand)
	}
	if snapshot.StrategyDocument == nil || snapshot.StrategyDocument.MigrationMeta == nil {
		return Result[T]{}, applicationError(ErrorLegacyMigrationNotFound, "journalId", ErrLegacyMigrationNotFound)
	}
	current := snapshot.StrategyDocument
	meta := current.MigrationMeta
	if meta.JournalID != command.JournalID {
		return Result[T]{}, applicationError(ErrorLegacyMigrationNotFound, "journalId", ErrLegacyMigrationNotFound)
	}
	if meta.Status == legacyMigrationStatusRolledBack {
		preview := previewFromPersisted(*current, false, true)
		return legacyMigrationResult(command.CommandID, snapshot, preview), nil
	}
	if meta.Status != legacyMigrationStatusCommitted {
		return Result[T]{}, applicationError(ErrorLegacyMigrationConflict, "migrationMeta.status", ErrLegacyMigrationConflict)
	}
	generatedAt := command.RolledBackAt
	if meta.PreviousGeneratedAt != nil {
		generatedAt = *meta.PreviousGeneratedAt
	}
	restored := strategydocument.StrategyDocumentV2{
		ContractVersion:   strategydocument.ContractVersionV2,
		SchemaVersion:     strategydocument.SchemaVersionV2,
		GeneratedAt:       generatedAt,
		Events:            append([]strategydocument.Event{}, meta.PreviousEvents...),
		ActiveEventID:     cloneEventID(meta.PreviousActiveEventID),
		MigrationMeta:     cloneMigrationMeta(meta),
		MigrationArchives: append([]strategydocument.MigrationArchive{}, current.MigrationArchives...),
	}
	restored.MigrationMeta.Status = legacyMigrationStatusRolledBack
	restored.MigrationArchives = append(restored.MigrationArchives, strategydocument.MigrationArchive{
		JournalID:     meta.JournalID,
		ArchivedAt:    command.RolledBackAt,
		GeneratedAt:   current.GeneratedAt,
		Events:        append([]strategydocument.Event{}, current.Events...),
		ActiveEventID: cloneEventID(current.ActiveEventID),
	})
	if err := restored.Validate(); err != nil {
		return Result[T]{}, fmt.Errorf("validate legacy migration rollback: %w", err)
	}
	commit, err := service.repository.Commit(ctx, snapshot.Version, repository.ChangeSet[T]{StrategyDocument: &restored})
	if err != nil {
		return Result[T]{}, err
	}
	preview := previewFromPersisted(restored, false, true)
	return legacyMigrationResult(command.CommandID, commit.Snapshot, preview), nil
}

func (service *Service[T]) ensureLegacyBackup(ctx context.Context, command LegacyMigrationCommand) (repository.Snapshot[T], []LegacyStorageSource, string, error) {
	fingerprint, sources, err := validateLegacySources(command.Sources)
	if err != nil {
		return repository.Snapshot[T]{}, nil, "", err
	}
	snapshot, err := service.repository.Snapshot(ctx)
	if err != nil {
		return repository.Snapshot[T]{}, nil, "", err
	}
	if snapshot.StrategyDocument != nil && snapshot.StrategyDocument.MigrationMeta != nil {
		meta := snapshot.StrategyDocument.MigrationMeta
		if meta.SourceFingerprint == fingerprint {
			persisted := sourcesFromBackups(meta.Sources)
			return snapshot, persisted, fingerprint, nil
		}
		if meta.Status != legacyMigrationStatusBackedUp {
			return repository.Snapshot[T]{}, nil, "", applicationError(ErrorLegacyMigrationConflict, "sources", ErrLegacyMigrationConflict)
		}
		// A cancelled preview may be followed by edits in localStorage. Start a
		// fresh journal while retaining the abandoned raw backup; never trap the
		// user in a fingerprint conflict and never discard the earlier bytes.
		replacement := *snapshot.StrategyDocument
		replacement.GeneratedAt = command.MigratedAt
		replacement.Events = append([]strategydocument.Event{}, meta.PreviousEvents...)
		replacement.ActiveEventID = cloneEventID(meta.PreviousActiveEventID)
		superseded := append([]strategydocument.LegacyJournalBackup{}, meta.SupersededJournals...)
		superseded = append(superseded, strategydocument.LegacyJournalBackup{
			SourceFingerprint: meta.SourceFingerprint,
			JournalID:         meta.JournalID,
			BackedUpAt:        meta.MigratedAt,
			Sources:           append([]strategydocument.LegacyStorageBackup{}, meta.Sources...),
		})
		replacement.MigrationMeta = &strategydocument.MigrationMeta{
			SourceFingerprint:     fingerprint,
			JournalID:             journalIDFor(fingerprint),
			MigratedAt:            command.MigratedAt,
			Status:                legacyMigrationStatusBackedUp,
			Sources:               backupsFromSources(sources),
			PreviousGeneratedAt:   meta.PreviousGeneratedAt,
			PreviousEvents:        append([]strategydocument.Event{}, meta.PreviousEvents...),
			PreviousActiveEventID: cloneEventID(meta.PreviousActiveEventID),
			SupersededJournals:    superseded,
		}
		commit, commitErr := service.repository.Commit(ctx, snapshot.Version, repository.ChangeSet[T]{StrategyDocument: &replacement})
		if commitErr != nil {
			return repository.Snapshot[T]{}, nil, "", commitErr
		}
		return commit.Snapshot, sources, fingerprint, nil
	}
	if snapshot.Version != command.ExpectedRepositoryVersion {
		return repository.Snapshot[T]{}, nil, "", applicationError(ErrorStaleCommand, "expectedRepositoryVersion", ErrStaleCommand)
	}
	backup := strategydocument.StrategyDocumentV2{
		ContractVersion: strategydocument.ContractVersionV2,
		SchemaVersion:   strategydocument.SchemaVersionV2,
		GeneratedAt:     command.MigratedAt,
		Events:          []strategydocument.Event{},
		MigrationMeta: &strategydocument.MigrationMeta{
			SourceFingerprint: fingerprint,
			JournalID:         journalIDFor(fingerprint),
			MigratedAt:        command.MigratedAt,
			Status:            legacyMigrationStatusBackedUp,
			Sources:           backupsFromSources(sources),
		},
	}
	if snapshot.StrategyDocument != nil {
		backup.Events = append([]strategydocument.Event{}, snapshot.StrategyDocument.Events...)
		backup.ActiveEventID = cloneEventID(snapshot.StrategyDocument.ActiveEventID)
		backup.MigrationArchives = append([]strategydocument.MigrationArchive{}, snapshot.StrategyDocument.MigrationArchives...)
		previousGeneratedAt := snapshot.StrategyDocument.GeneratedAt
		backup.MigrationMeta.PreviousGeneratedAt = &previousGeneratedAt
		backup.MigrationMeta.PreviousEvents = append([]strategydocument.Event{}, snapshot.StrategyDocument.Events...)
		backup.MigrationMeta.PreviousActiveEventID = cloneEventID(snapshot.StrategyDocument.ActiveEventID)
	}
	commit, err := service.repository.Commit(ctx, snapshot.Version, repository.ChangeSet[T]{StrategyDocument: &backup})
	if err != nil {
		return repository.Snapshot[T]{}, nil, "", err
	}
	return commit.Snapshot, sources, fingerprint, nil
}

func validateLegacyMigrationCommand(command LegacyMigrationCommand, operation Operation, confirmation bool) error {
	if err := validateHeader(command.CommandHeader, operation); err != nil {
		return err
	}
	if command.MigratedAt.IsZero() {
		return applicationError(ErrorInvalidCommand, "migratedAt", ErrInvalidCommand)
	}
	if confirmation && strings.TrimSpace(command.ConfirmedFingerprint) == "" {
		return applicationError(ErrorInvalidCommand, "confirmedFingerprint", ErrInvalidCommand)
	}
	return nil
}

func validateLegacySources(sources []LegacyStorageSource) (string, []LegacyStorageSource, error) {
	if len(sources) == 0 || len(sources) > 2 {
		return "", nil, applicationError(ErrorInvalidCommand, "sources", ErrInvalidCommand)
	}
	ordered := append([]LegacyStorageSource{}, sources...)
	sort.Slice(ordered, func(i, j int) bool { return ordered[i].Key < ordered[j].Key })
	seen := map[string]bool{}
	hash := sha256.New()
	for _, source := range ordered {
		if source.Key != legacyEventsStorageKey && source.Key != legacyStrategyStorageKey {
			return "", nil, applicationError(ErrorInvalidCommand, "sources.key", ErrInvalidCommand)
		}
		if seen[source.Key] || (!source.Present && len(source.Raw) != 0) || len(source.Raw) > maxLegacyStorageBytes {
			return "", nil, applicationError(ErrorInvalidCommand, "sources", ErrInvalidCommand)
		}
		seen[source.Key] = true
		hash.Write([]byte(source.Key))
		hash.Write([]byte{0})
		if source.Present {
			hash.Write([]byte{1})
		} else {
			hash.Write([]byte{0})
		}
		hash.Write([]byte{0})
		hash.Write(source.Raw)
		hash.Write([]byte{0xff})
	}
	return hex.EncodeToString(hash.Sum(nil)), ordered, nil
}

func journalIDFor(fingerprint string) string { return "orbit-legacy-" + fingerprint[:24] }

func backupsFromSources(sources []LegacyStorageSource) []strategydocument.LegacyStorageBackup {
	backups := make([]strategydocument.LegacyStorageBackup, 0, len(sources))
	for _, source := range sources {
		backups = append(backups, strategydocument.LegacyStorageBackup{Key: source.Key, Present: source.Present, Raw: append([]byte{}, source.Raw...)})
	}
	return backups
}

func sourcesFromBackups(backups []strategydocument.LegacyStorageBackup) []LegacyStorageSource {
	sources := make([]LegacyStorageSource, 0, len(backups))
	for _, backup := range backups {
		sources = append(sources, LegacyStorageSource{Key: backup.Key, Present: backup.Present, Raw: append([]byte{}, backup.Raw...)})
	}
	return sources
}

func buildLegacyMigrationPreview(sources []LegacyStorageSource, fingerprint string, migratedAt time.Time, previous []strategydocument.Event, previousActive *strategydocument.EventID) (LegacyMigrationPreview, error) {
	state := legacyParseState{
		events:        append([]strategydocument.Event{}, previous...),
		byID:          map[strategydocument.EventID]int{},
		migratedIDs:   map[strategydocument.EventID]bool{},
		activeEventID: cloneEventID(previousActive),
	}
	for index := range state.events {
		state.byID[state.events[index].ID] = index
	}
	for _, source := range sources {
		if !source.Present {
			state.warnings = append(state.warnings, "No existe "+source.Key+"; el preview lo distingue de un valor vacío.")
			continue
		}
		switch source.Key {
		case legacyEventsStorageKey:
			parseLegacyEventsSource(&state, source)
		case legacyStrategyStorageKey:
			parseLegacyStrategySource(&state, source)
		}
	}
	meta := &strategydocument.MigrationMeta{
		SourceFingerprint:     fingerprint,
		JournalID:             journalIDFor(fingerprint),
		MigratedAt:            migratedAt,
		Status:                legacyMigrationStatusBackedUp,
		Sources:               backupsFromSources(sources),
		Quarantine:            append([]strategydocument.LegacyQuarantineItem{}, state.quarantine...),
		Warnings:              append([]string{}, state.warnings...),
		PreviousEvents:        append([]strategydocument.Event{}, previous...),
		PreviousActiveEventID: cloneEventID(previousActive),
	}
	document := strategydocument.StrategyDocumentV2{
		ContractVersion: strategydocument.ContractVersionV2,
		SchemaVersion:   strategydocument.SchemaVersionV2,
		GeneratedAt:     migratedAt,
		Events:          state.events,
		ActiveEventID:   state.activeEventID,
		MigrationMeta:   meta,
	}
	if err := document.Validate(); err != nil {
		return LegacyMigrationPreview{}, fmt.Errorf("validate legacy migration preview: %w", err)
	}
	return LegacyMigrationPreview{
		Fingerprint:   fingerprint,
		JournalID:     meta.JournalID,
		Document:      document,
		Quarantine:    meta.Quarantine,
		Warnings:      meta.Warnings,
		ActiveEventID: cloneEventID(document.ActiveEventID),
	}, nil
}

type legacyParseState struct {
	events        []strategydocument.Event
	byID          map[strategydocument.EventID]int
	migratedIDs   map[strategydocument.EventID]bool
	activeEventID *strategydocument.EventID
	quarantine    []strategydocument.LegacyQuarantineItem
	warnings      []string
}

func parseLegacyEventsSource(state *legacyParseState, source LegacyStorageSource) {
	var root map[string]json.RawMessage
	if err := json.Unmarshal(source.Raw, &root); err != nil || root == nil {
		state.quarantineValue(source.Key, "$", "invalid_json", "La raíz no es JSON válido.", source.Raw)
		return
	}
	rawEvents, exists := root["events"]
	if !exists {
		state.warnings = append(state.warnings, "La propiedad events está ausente; no se interpreta como una lista vacía explícita.")
	} else {
		var entries []json.RawMessage
		if err := json.Unmarshal(rawEvents, &entries); err != nil {
			state.quarantineValue(source.Key, "$.events", "invalid_events", "events no es una lista.", rawEvents)
		} else {
			for index, raw := range entries {
				event, ok := parseLegacyEvent(state, source.Key, fmt.Sprintf("$.events[%d]", index), raw)
				if !ok {
					continue
				}
				if existingIndex, collision := state.byID[event.ID]; collision {
					if !reflect.DeepEqual(state.events[existingIndex], event) {
						state.quarantineValue(source.Key, fmt.Sprintf("$.events[%d].id", index), "event_id_collision", "El ID ya existe en el documento canónico con otro contenido.", raw)
					} else {
						state.migratedIDs[event.ID] = true
					}
					continue
				}
				state.byID[event.ID] = len(state.events)
				state.migratedIDs[event.ID] = true
				state.events = append(state.events, event)
			}
		}
	}
	if rawActive, ok := root["activeId"]; ok && !bytes.Equal(bytes.TrimSpace(rawActive), []byte("null")) {
		var id string
		if err := json.Unmarshal(rawActive, &id); err != nil || strings.TrimSpace(id) == "" {
			state.quarantineValue(source.Key, "$.activeId", "invalid_active_event", "activeId no es un string válido.", rawActive)
		} else if state.migratedIDs[strategydocument.EventID(id)] {
			value := strategydocument.EventID(id)
			state.activeEventID = &value
		} else {
			state.activeEventID = nil
			state.quarantineValue(source.Key, "$.activeId", "dangling_active_event", "activeId no apunta a un evento migrado; no se activa nada.", rawActive)
			state.warnings = append(state.warnings, "El evento activo legacy no existe o quedó en cuarentena; no se activó ningún evento.")
		}
	}
}

func parseLegacyEvent(state *legacyParseState, key, path string, raw json.RawMessage) (strategydocument.Event, bool) {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(raw, &fields); err != nil || fields == nil {
		state.quarantineValue(key, path, "invalid_event", "El evento no es un objeto JSON.", raw)
		return strategydocument.Event{}, false
	}
	id, ok := requiredString(fields["id"])
	if !ok {
		state.quarantineValue(key, path+".id", "missing_event_id", "El evento no tiene un ID string no vacío.", raw)
		return strategydocument.Event{}, false
	}
	manual := func(field string) strategydocument.Evidence {
		return legacyEvidence(strategydocument.ProvenanceManual, key+":"+path+"."+field)
	}
	synthetic := func(field string) strategydocument.Evidence {
		return legacyEvidence(strategydocument.ProvenanceLegacySyntheticDefault, key+":"+path+"."+field)
	}
	unknown := unknownEvidence()

	name, nameOK := optionalString(fields, "name")
	nameEvidence := manual("name")
	if !nameOK || strings.TrimSpace(name) == "" {
		name = id
		nameEvidence = synthetic("name")
	}
	sourceValue := strategydocument.EventSourceCustom
	sourceEvidence := synthetic("source")
	if rawSource, exists := fields["source"]; exists {
		value, valid := requiredString(rawSource)
		sourceValue = strategydocument.EventSource(value)
		if !valid || !sourceValue.Valid() {
			state.quarantineValue(key, path+".source", "unknown_event_source", "source contiene un enum desconocido; el evento se bloquea.", rawSource)
			return strategydocument.Event{}, false
		}
		sourceEvidence = manual("source")
	}
	track, trackOK := optionalString(fields, "track")
	trackEvidence := manual("track")
	if !trackOK {
		track = ""
		trackEvidence = unknown
		if _, exists := fields["track"]; exists {
			state.quarantineValue(key, path+".track", "invalid_track", "track no es string; queda missing.", fields["track"])
		}
	}
	class, classOK := optionalString(fields, "cls")
	classEvidence := manual("cls")
	if !classOK {
		class = ""
		classEvidence = unknown
		if _, exists := fields["cls"]; exists {
			state.quarantineValue(key, path+".cls", "invalid_class", "cls no es string; queda missing.", fields["cls"])
		}
	}
	duration, durationOK := positiveInt(fields["durationMin"])
	durationEvidence := manual("durationMin")
	if !durationOK {
		duration = 60
		durationEvidence = synthetic("durationMin")
	}
	tank, tankOK := finiteNumber(fields["tankL"], true)
	tankEvidence := manual("tankL")
	if !tankOK {
		tank = 90
		tankEvidence = synthetic("tankL")
	}
	pitLoss, pitOK := finiteNumber(fields["pitLossSec"], false)
	pitEvidence := manual("pitLossSec")
	if !pitOK {
		pitLoss = 60
		pitEvidence = synthetic("pitLossSec")
	}

	var startAt *time.Time
	startEvidence := unknown
	if rawStart, exists := fields["startAt"]; exists {
		value, valid := requiredString(rawStart)
		parsed, err := time.Parse(time.RFC3339Nano, value)
		if valid && err == nil {
			startAt = &parsed
			startEvidence = manual("startAt")
		} else {
			state.quarantineValue(key, path+".startAt", "invalid_start_at", "startAt no es un timestamp ISO válido; queda missing.", rawStart)
		}
	}
	drivers := parseLegacyDrivers(state, key, path, fields["drivers"])
	if len(drivers) == 0 {
		state.quarantineValue(key, path+".drivers", "event_without_drivers", "El evento no tiene pilotos válidos y queda en cuarentena.", raw)
		return strategydocument.Event{}, false
	}
	driverIDs := map[strategydocument.DriverID]bool{}
	for _, driver := range drivers {
		driverIDs[driver.ID] = true
	}
	strategies := parseLegacyVariants(state, key, path+".strategies", fields["strategies"], driverIDs)
	availability := parseLegacyAvailability(state, key, path+".availability", fields["availability"], driverIDs)

	event := strategydocument.Event{
		ID:             strategydocument.EventID(id),
		Name:           strategydocument.Sourced[string]{Value: name, Evidence: nameEvidence},
		Source:         strategydocument.Sourced[strategydocument.EventSource]{Value: sourceValue, Evidence: sourceEvidence},
		Track:          strategydocument.Sourced[string]{Value: track, Evidence: trackEvidence},
		Class:          strategydocument.Sourced[string]{Value: class, Evidence: classEvidence},
		DurationMin:    strategydocument.Sourced[int]{Value: duration, Evidence: durationEvidence},
		StartAt:        strategydocument.Sourced[*time.Time]{Value: startAt, Evidence: startEvidence},
		Drivers:        drivers,
		TankLiters:     strategydocument.Sourced[float64]{Value: tank, Evidence: tankEvidence},
		PitLossSeconds: strategydocument.Sourced[float64]{Value: pitLoss, Evidence: pitEvidence},
		Strategies:     strategies,
		Availability:   availability,
		FillMode:       strategydocument.Sourced[strategydocument.FillMode]{Value: strategydocument.FillModeManual, Evidence: synthetic("fillMode")},
		TyreInventory:  strategydocument.TyreInventory{Sets: []strategydocument.TyreSet{}},
		RawLegacy:      append([]byte{}, raw...),
	}
	if value, valid := optionalString(fields, "seriesId"); valid && value != "" {
		sourced := strategydocument.Sourced[string]{Value: value, Evidence: manual("seriesId")}
		event.SeriesID = &sourced
	} else if rawValue, exists := fields["seriesId"]; exists {
		state.quarantineValue(key, path+".seriesId", "invalid_series_id", "seriesId no es string y queda missing.", rawValue)
	}
	if value, valid := optionalString(fields, "team"); valid {
		sourced := strategydocument.Sourced[string]{Value: value, Evidence: manual("team")}
		event.Team = &sourced
	} else if rawValue, exists := fields["team"]; exists {
		state.quarantineValue(key, path+".team", "invalid_team", "team no es string y queda missing.", rawValue)
	}
	if rawValue, exists := fields["teamMode"]; exists {
		value, valid := requiredString(rawValue)
		if valid && (value == "solo" || value == "team") {
			sourced := strategydocument.Sourced[strategydocument.TeamMode]{Value: strategydocument.TeamMode(value), Evidence: manual("teamMode")}
			event.TeamMode = &sourced
		} else {
			state.quarantineValue(key, path+".teamMode", "invalid_team_mode", "teamMode contiene un valor desconocido y queda missing.", rawValue)
		}
	}
	if rawValue, exists := fields["fillMode"]; exists {
		value, valid := requiredString(rawValue)
		if !valid || value != "manual" {
			state.quarantineValue(key, path+".fillMode", "unsupported_fill_mode", "fillMode no puede mapearse al contrato v2; el evento se bloquea.", rawValue)
			return strategydocument.Event{}, false
		}
		event.FillMode.Evidence = manual("fillMode")
	}
	if rawValue, exists := fields["lastOpenedAt"]; exists {
		value, valid := requiredString(rawValue)
		parsed, err := time.Parse(time.RFC3339Nano, value)
		if valid && err == nil {
			sourced := strategydocument.Sourced[*time.Time]{Value: &parsed, Evidence: manual("lastOpenedAt")}
			event.LastOpenedAt = &sourced
		} else {
			state.quarantineValue(key, path+".lastOpenedAt", "invalid_last_opened_at", "lastOpenedAt no es ISO válido y queda missing.", rawValue)
		}
	}
	if rawValue, exists := fields["activeStrategyId"]; exists {
		value, valid := requiredString(rawValue)
		found := false
		for _, variant := range strategies {
			if string(variant.ID) == value {
				found = true
				break
			}
		}
		if valid && found {
			id := strategydocument.VariantID(value)
			event.ActiveStrategyID = &id
		} else {
			state.quarantineValue(key, path+".activeStrategyId", "dangling_active_strategy", "activeStrategyId no apunta a una estrategia migrada; no se activa nada.", rawValue)
			state.warnings = append(state.warnings, "Una estrategia activa legacy quedó colgante; no se activó ninguna estrategia.")
		}
	}
	return event, true
}

func parseLegacyDrivers(state *legacyParseState, key, path string, raw json.RawMessage) []strategydocument.Driver {
	var entries []json.RawMessage
	if err := json.Unmarshal(raw, &entries); err != nil {
		state.quarantineValue(key, path+".drivers", "invalid_drivers", "drivers no es una lista.", raw)
		return nil
	}
	result := []strategydocument.Driver{}
	seen := map[string]bool{}
	for index, entry := range entries {
		var fields map[string]json.RawMessage
		entryPath := fmt.Sprintf("%s.drivers[%d]", path, index)
		if json.Unmarshal(entry, &fields) != nil {
			state.quarantineValue(key, entryPath, "invalid_driver", "El piloto no es un objeto.", entry)
			continue
		}
		id, ok := requiredString(fields["id"])
		if !ok || seen[id] {
			state.quarantineValue(key, entryPath+".id", "invalid_driver_id", "El ID de piloto falta o está duplicado.", entry)
			continue
		}
		driver := strategydocument.Driver{ID: strategydocument.DriverID(id), Order: len(result), RawExtra: map[string]json.RawMessage{}}
		valid := true
		for legacyName, target := range map[string]**strategydocument.Sourced[string]{"name": &driver.Name, "ini": &driver.Ini, "color": &driver.Color, "cls": &driver.Class} {
			if rawValue, exists := fields[legacyName]; exists {
				value, ok := requiredString(rawValue)
				if !ok {
					state.quarantineValue(key, entryPath+"."+legacyName, "invalid_driver_field", "El campo del piloto no es string.", rawValue)
					valid = false
					continue
				}
				sourced := strategydocument.Sourced[string]{Value: value, Evidence: legacyEvidence(strategydocument.ProvenanceManual, key+":"+entryPath+"."+legacyName)}
				*target = &sourced
			}
		}
		for _, pace := range []string{"dry", "wet", "eco"} {
			if rawValue, exists := fields[pace]; exists {
				if !validPace(rawValue) {
					state.quarantineValue(key, entryPath+"."+pace, "invalid_driver_pace", "El ritmo legacy no es una pareja finita.", rawValue)
					valid = false
				} else {
					driver.RawExtra[pace] = append([]byte{}, rawValue...)
				}
			}
		}
		if !valid {
			continue
		}
		seen[id] = true
		result = append(result, driver)
	}
	return result
}

func parseLegacyVariants(state *legacyParseState, key, path string, raw json.RawMessage, drivers map[strategydocument.DriverID]bool) []strategydocument.Variant {
	if len(raw) == 0 {
		return []strategydocument.Variant{}
	}
	var entries []json.RawMessage
	if err := json.Unmarshal(raw, &entries); err != nil {
		state.quarantineValue(key, path, "invalid_strategies", "strategies no es una lista.", raw)
		return []strategydocument.Variant{}
	}
	result := []strategydocument.Variant{}
	seen := map[string]bool{}
	for index, entry := range entries {
		variant, ok := parseLegacyVariant(state, key, fmt.Sprintf("%s[%d]", path, index), "", entry, drivers)
		if !ok {
			continue
		}
		if seen[string(variant.ID)] {
			state.quarantineValue(key, fmt.Sprintf("%s[%d].id", path, index), "variant_id_collision", "El ID de estrategia está duplicado.", entry)
			continue
		}
		seen[string(variant.ID)] = true
		result = append(result, variant)
	}
	return result
}

func parseLegacyVariant(state *legacyParseState, key, path, mapID string, raw json.RawMessage, drivers map[strategydocument.DriverID]bool) (strategydocument.Variant, bool) {
	var fields map[string]json.RawMessage
	if json.Unmarshal(raw, &fields) != nil {
		state.quarantineValue(key, path, "invalid_variant", "La estrategia no es un objeto.", raw)
		return strategydocument.Variant{}, false
	}
	id := mapID
	if id == "" {
		id, _ = optionalString(fields, "id")
	}
	if strings.TrimSpace(id) == "" {
		state.quarantineValue(key, path+".id", "missing_variant_id", "La estrategia no tiene ID.", raw)
		return strategydocument.Variant{}, false
	}
	var orderRaw []json.RawMessage
	if json.Unmarshal(fields["order"], &orderRaw) != nil || len(orderRaw) == 0 {
		state.quarantineValue(key, path+".order", "missing_variant_order", "La estrategia no tiene un orden de pilotos válido.", raw)
		return strategydocument.Variant{}, false
	}
	order := make([]strategydocument.DriverID, 0, len(orderRaw))
	seen := map[string]bool{}
	for _, rawID := range orderRaw {
		value, ok := requiredString(rawID)
		if !ok || seen[value] || (drivers != nil && !drivers[strategydocument.DriverID(value)]) {
			state.quarantineValue(key, path+".order", "invalid_variant_order", "order contiene pilotos inválidos, duplicados o colgantes.", fields["order"])
			return strategydocument.Variant{}, false
		}
		seen[value] = true
		order = append(order, strategydocument.DriverID(value))
	}
	synthetic := func(field string) strategydocument.Evidence {
		return legacyEvidence(strategydocument.ProvenanceLegacySyntheticDefault, key+":"+path+"."+field)
	}
	manual := func(field string) strategydocument.Evidence {
		return legacyEvidence(strategydocument.ProvenanceManual, key+":"+path+"."+field)
	}
	name, ok := optionalString(fields, "name")
	nameEvidence := manual("name")
	if !ok || strings.TrimSpace(name) == "" {
		name = id
		nameEvidence = synthetic("name")
	}
	note, ok := optionalString(fields, "note")
	noteEvidence := manual("note")
	if !ok {
		note = ""
		noteEvidence = synthetic("note")
	}
	modeText, ok := optionalString(fields, "mode")
	modeEvidence := manual("mode")
	if !ok {
		modeText = "dry"
		modeEvidence = synthetic("mode")
	}
	mode := strategydocument.VariantMode(modeText)
	if mode != strategydocument.VariantModeDry && mode != strategydocument.VariantModeWet && mode != strategydocument.VariantModeEco && mode != strategydocument.VariantModeHumid {
		state.quarantineValue(key, path+".mode", "invalid_variant_mode", "mode contiene un enum desconocido.", fields["mode"])
		return strategydocument.Variant{}, false
	}
	stateText, ok := optionalString(fields, "state")
	stateEvidence := manual("state")
	if !ok {
		stateText = "draft"
		stateEvidence = synthetic("state")
	}
	variantState := strategydocument.VariantState(stateText)
	if variantState != strategydocument.VariantStateDraft && variantState != strategydocument.VariantStateOK {
		state.quarantineValue(key, path+".state", "invalid_variant_state", "state contiene un enum desconocido.", fields["state"])
		return strategydocument.Variant{}, false
	}
	overrides, valid := rawObject(fields["overrides"])
	if !valid {
		state.quarantineValue(key, path+".overrides", "invalid_variant_overrides", "overrides no es un objeto.", fields["overrides"])
		return strategydocument.Variant{}, false
	}
	tyres, valid := rawObject(fields["tyres"])
	if !valid {
		state.quarantineValue(key, path+".tyres", "invalid_variant_tyres", "tyres no es un objeto.", fields["tyres"])
		return strategydocument.Variant{}, false
	}
	return strategydocument.Variant{ID: strategydocument.VariantID(id), Name: strategydocument.Sourced[string]{Value: name, Evidence: nameEvidence}, Note: strategydocument.Sourced[string]{Value: note, Evidence: noteEvidence}, Mode: strategydocument.Sourced[strategydocument.VariantMode]{Value: mode, Evidence: modeEvidence}, Order: order, State: strategydocument.Sourced[strategydocument.VariantState]{Value: variantState, Evidence: stateEvidence}, Overrides: overrides, Tyres: tyres}, true
}

func parseLegacyAvailability(state *legacyParseState, key, path string, raw json.RawMessage, drivers map[strategydocument.DriverID]bool) map[strategydocument.DriverID][]strategydocument.AvailabilityWindow {
	result := map[strategydocument.DriverID][]strategydocument.AvailabilityWindow{}
	if len(raw) == 0 {
		return result
	}
	var entries map[string]json.RawMessage
	if json.Unmarshal(raw, &entries) != nil || entries == nil {
		state.quarantineValue(key, path, "invalid_availability", "availability no es un objeto.", raw)
		return result
	}
	for driverID, windowsRaw := range entries {
		if drivers != nil && !drivers[strategydocument.DriverID(driverID)] {
			state.quarantineValue(key, path+"."+driverID, "unknown_availability_driver", "availability referencia un piloto inexistente.", windowsRaw)
			continue
		}
		var windows []json.RawMessage
		if json.Unmarshal(windowsRaw, &windows) != nil {
			state.quarantineValue(key, path+"."+driverID, "invalid_availability_windows", "Las ventanas no son una lista.", windowsRaw)
			continue
		}
		parsed := []strategydocument.AvailabilityWindow{}
		for index, windowRaw := range windows {
			var fields map[string]json.RawMessage
			if json.Unmarshal(windowRaw, &fields) != nil {
				state.quarantineValue(key, fmt.Sprintf("%s.%s[%d]", path, driverID, index), "invalid_availability_window", "La ventana no es un objeto.", windowRaw)
				continue
			}
			stateText, ok := requiredString(fields["state"])
			from, fromOK := integer(fields["from"])
			to, toOK := integer(fields["to"])
			window := strategydocument.AvailabilityWindow{State: strategydocument.AvailabilityState(stateText), From: from, To: to}
			if !ok || !fromOK || !toOK || window.Validate() != nil || overlaps(parsed, window) {
				state.quarantineValue(key, fmt.Sprintf("%s.%s[%d]", path, driverID, index), "invalid_availability_window", "La ventana tiene estado, límites, orden o solape inválido.", windowRaw)
				continue
			}
			parsed = append(parsed, window)
		}
		if len(parsed) > 0 {
			result[strategydocument.DriverID(driverID)] = parsed
		}
	}
	return result
}

func parseLegacyStrategySource(state *legacyParseState, source LegacyStorageSource) {
	var root map[string]json.RawMessage
	if json.Unmarshal(source.Raw, &root) != nil || root == nil {
		state.quarantineValue(source.Key, "$", "invalid_json", "La raíz legacy no es JSON válido.", source.Raw)
		return
	}
	variantsRoot := root
	wrapped := false
	if rawVariants, exists := root["variants"]; exists {
		wrapped = true
		if json.Unmarshal(rawVariants, &variantsRoot) != nil || variantsRoot == nil {
			state.quarantineValue(source.Key, "$.variants", "invalid_variant_map", "variants no es un mapa.", rawVariants)
			return
		}
	}
	if !wrapped {
		state.warnings = append(state.warnings, "La raíz plana de variantes legacy es ambigua; cada entrada se valida explícitamente antes de aplicarla.")
	}
	target := legacyStrategyTarget(state.events)
	if target < 0 {
		for id, raw := range variantsRoot {
			if wrapped && id == "availability" {
				continue
			}
			state.quarantineValue(source.Key, "$.variants."+id, "orphan_legacy_variant", "No hay un único evento destino seguro; se conserva sin aplicar.", raw)
		}
		if raw, ok := root["availability"]; ok {
			state.quarantineValue(source.Key, "$.availability", "orphan_legacy_availability", "No hay un único evento destino seguro; se conserva sin aplicar.", raw)
		}
		return
	}
	event := &state.events[target]
	drivers := map[strategydocument.DriverID]bool{}
	for _, driver := range event.Drivers {
		drivers[driver.ID] = true
	}
	for id, raw := range variantsRoot {
		if wrapped && id == "availability" {
			continue
		}
		variant, ok := parseLegacyVariant(state, source.Key, "$.variants."+id, id, raw, drivers)
		if !ok {
			continue
		}
		index := -1
		for i := range event.Strategies {
			if event.Strategies[i].ID == variant.ID {
				index = i
				break
			}
		}
		if index >= 0 {
			event.Strategies[index] = mergeLegacyVariant(event.Strategies[index], variant, raw)
		} else {
			event.Strategies = append(event.Strategies, variant)
		}
	}
	if raw, ok := root["availability"]; ok {
		for driver, windows := range parseLegacyAvailability(state, source.Key, "$.availability", raw, drivers) {
			event.Availability[driver] = windows
		}
	}
}

func legacyStrategyTarget(events []strategydocument.Event) int {
	target := -1
	for index := range events {
		if events[index].Source.Value == strategydocument.EventSourceRoster {
			if target >= 0 {
				return -1
			}
			target = index
		}
	}
	if target >= 0 {
		return target
	}
	if len(events) == 1 {
		return 0
	}
	return -1
}

func mergeLegacyVariant(base, override strategydocument.Variant, raw json.RawMessage) strategydocument.Variant {
	var fields map[string]json.RawMessage
	_ = json.Unmarshal(raw, &fields)
	if _, exists := fields["name"]; exists {
		base.Name = override.Name
	}
	if _, exists := fields["note"]; exists {
		base.Note = override.Note
	}
	if _, exists := fields["mode"]; exists {
		base.Mode = override.Mode
	}
	base.Order = override.Order
	if _, exists := fields["state"]; exists {
		base.State = override.State
	}
	if _, exists := fields["overrides"]; exists {
		base.Overrides = override.Overrides
	}
	if _, exists := fields["tyres"]; exists {
		base.Tyres = override.Tyres
	}
	return base
}

func (state *legacyParseState) quarantineValue(key, path, code, message string, raw []byte) {
	state.quarantine = append(state.quarantine, strategydocument.LegacyQuarantineItem{SourceKey: key, Path: path, Code: code, Message: message, Raw: append([]byte{}, raw...)})
}

func legacyEvidence(kind strategydocument.ProvenanceKind, sourceID string) strategydocument.Evidence {
	return strategydocument.Evidence{Provenance: strategydocument.Provenance{Kind: kind, SourceID: sourceID}, Confidence: strategydocument.Confidence{Level: strategydocument.ConfidenceUnknown}}
}
func unknownEvidence() strategydocument.Evidence {
	return strategydocument.Evidence{Provenance: strategydocument.Provenance{Kind: strategydocument.ProvenanceUnknown}, Confidence: strategydocument.Confidence{Level: strategydocument.ConfidenceUnknown}}
}

func requiredString(raw json.RawMessage) (string, bool) {
	var value string
	if len(raw) == 0 || json.Unmarshal(raw, &value) != nil || strings.TrimSpace(value) == "" {
		return "", false
	}
	return value, true
}
func optionalString(fields map[string]json.RawMessage, key string) (string, bool) {
	raw, ok := fields[key]
	if !ok {
		return "", false
	}
	var value string
	if json.Unmarshal(raw, &value) != nil {
		return "", false
	}
	return value, true
}
func positiveInt(raw json.RawMessage) (int, bool) {
	var value float64
	if len(raw) == 0 || json.Unmarshal(raw, &value) != nil || math.IsNaN(value) || math.IsInf(value, 0) || value <= 0 || math.Trunc(value) != value || value > math.MaxInt {
		return 0, false
	}
	return int(value), true
}
func integer(raw json.RawMessage) (int, bool) {
	var value float64
	if len(raw) == 0 || json.Unmarshal(raw, &value) != nil || math.IsNaN(value) || math.IsInf(value, 0) || math.Trunc(value) != value || value > math.MaxInt || value < math.MinInt {
		return 0, false
	}
	return int(value), true
}
func finiteNumber(raw json.RawMessage, positive bool) (float64, bool) {
	var value float64
	if len(raw) == 0 || json.Unmarshal(raw, &value) != nil || math.IsNaN(value) || math.IsInf(value, 0) || (positive && value <= 0) || (!positive && value < 0) {
		return 0, false
	}
	return value, true
}
func validPace(raw json.RawMessage) bool {
	var values []float64
	if json.Unmarshal(raw, &values) != nil || len(values) != 2 {
		return false
	}
	for _, v := range values {
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return false
		}
	}
	return true
}
func rawObject(raw json.RawMessage) (map[string]json.RawMessage, bool) {
	if len(raw) == 0 {
		return map[string]json.RawMessage{}, true
	}
	if bytes.TrimSpace(raw)[0] != '{' {
		return nil, false
	}
	var value map[string]json.RawMessage
	if json.Unmarshal(raw, &value) != nil || value == nil {
		return nil, false
	}
	return value, true
}
func overlaps(existing []strategydocument.AvailabilityWindow, candidate strategydocument.AvailabilityWindow) bool {
	for _, window := range existing {
		if candidate.From < window.To && window.From < candidate.To {
			return true
		}
	}
	return false
}

func previewFromPersisted(document strategydocument.StrategyDocumentV2, alreadyImported, rolledBack bool) LegacyMigrationPreview {
	meta := document.MigrationMeta
	return LegacyMigrationPreview{Fingerprint: meta.SourceFingerprint, JournalID: meta.JournalID, Document: document, Quarantine: append([]strategydocument.LegacyQuarantineItem{}, meta.Quarantine...), Warnings: append([]string{}, meta.Warnings...), ActiveEventID: cloneEventID(document.ActiveEventID), Imported: alreadyImported, AlreadyImported: alreadyImported, RolledBack: rolledBack}
}

func carryLegacyMigrationHistory(target *strategydocument.StrategyDocumentV2, backup strategydocument.StrategyDocumentV2) {
	if target == nil || target.MigrationMeta == nil || backup.MigrationMeta == nil {
		return
	}
	target.MigrationMeta.PreviousGeneratedAt = backup.MigrationMeta.PreviousGeneratedAt
	target.MigrationMeta.SupersededJournals = append([]strategydocument.LegacyJournalBackup{}, backup.MigrationMeta.SupersededJournals...)
	target.MigrationArchives = append([]strategydocument.MigrationArchive{}, backup.MigrationArchives...)
}

func legacyMigrationResult[T any](commandID CommandID, snapshot repository.Snapshot[T], preview LegacyMigrationPreview) Result[T] {
	return Result[T]{ProtocolVersion: ProtocolVersionV1, CommandID: commandID, RepositoryVersion: snapshot.Version, StrategyDocument: snapshot.StrategyDocument, LegacyMigration: &preview, RecoveredFromBackup: snapshot.RecoveredFromBackup}
}
func cloneEventID(value *strategydocument.EventID) *strategydocument.EventID {
	if value == nil {
		return nil
	}
	clone := *value
	return &clone
}
func cloneMigrationMeta(value *strategydocument.MigrationMeta) *strategydocument.MigrationMeta {
	if value == nil {
		return nil
	}
	raw, _ := json.Marshal(value)
	var clone strategydocument.MigrationMeta
	_ = json.Unmarshal(raw, &clone)
	return &clone
}
