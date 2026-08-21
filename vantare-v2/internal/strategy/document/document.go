package document

import (
	"encoding/json"
	"fmt"
	"math"
	"strings"
	"time"
)

// ContractVersion v2 — el documento v2 debe poder representar todo lo que la
// migración traerá según matriz-migracion-orbit.csv, incluida la marca
// legacy_synthetic_default. Compatibilidad: v1 = strategy.v1, v2 = strategy.v2.
const (
	ContractVersionV1 ContractVersion = "strategy.v1"
	ContractVersionV2 ContractVersion = "strategy.v2"
	SchemaVersionV2   string          = "2.0.0"
)

type ContractVersion string

// ProvenanceKind cubre el vocabulario vigente de strategy.v1 más `reference`
// (datos del catálogo comunitario, D15) y `legacy_synthetic_default` para
// distinguir defaults sintéticos de Orbit (90 L, 60 s, 60 min) del dato real
// del usuario, según matriz de migración y spec §6 (gana ADR 0009 si hay conflicto,
// pero ADR 0009 §5 no contradice este añadido: lo exige).
type ProvenanceKind string

const (
	ProvenanceUnknown                ProvenanceKind = "unknown"
	ProvenanceObserved               ProvenanceKind = "observed"
	ProvenanceCorrected              ProvenanceKind = "corrected"
	ProvenanceManual                 ProvenanceKind = "manual"
	ProvenanceDerived                ProvenanceKind = "derived"
	ProvenanceEstimated              ProvenanceKind = "estimated"
	ProvenanceRange                  ProvenanceKind = "range"
	ProvenanceReference              ProvenanceKind = "reference"
	ProvenanceLegacySyntheticDefault ProvenanceKind = "legacy_synthetic_default"
)

func (k ProvenanceKind) Valid() bool {
	switch k {
	case ProvenanceUnknown, ProvenanceObserved, ProvenanceCorrected, ProvenanceManual, ProvenanceDerived, ProvenanceEstimated, ProvenanceRange, ProvenanceReference, ProvenanceLegacySyntheticDefault:
		return true
	default:
		return false
	}
}

type Provenance struct {
	Kind       ProvenanceKind `json:"kind"`
	SourceID   string         `json:"sourceId,omitempty"`
	ObservedAt *time.Time     `json:"observedAt,omitempty"`
}

func (p Provenance) Validate() error {
	switch p.Kind {
	case ProvenanceUnknown:
		if strings.TrimSpace(p.SourceID) != "" || p.ObservedAt != nil {
			return fmt.Errorf("unknown provenance cannot claim source")
		}
		return nil
	case ProvenanceObserved, ProvenanceCorrected, ProvenanceManual, ProvenanceDerived, ProvenanceEstimated, ProvenanceRange, ProvenanceReference, ProvenanceLegacySyntheticDefault:
		if strings.TrimSpace(p.SourceID) == "" {
			return fmt.Errorf("provenance.sourceId is required for %s", p.Kind)
		}
		if p.ObservedAt != nil && p.ObservedAt.IsZero() {
			return fmt.Errorf("provenance.observedAt is zero")
		}
		return nil
	default:
		return fmt.Errorf("unknown provenance kind %q", p.Kind)
	}
}

type ConfidenceLevel string

const (
	ConfidenceUnknown ConfidenceLevel = "unknown"
	ConfidenceLow     ConfidenceLevel = "low"
	ConfidenceMedium  ConfidenceLevel = "medium"
	ConfidenceHigh    ConfidenceLevel = "high"
)

type Confidence struct {
	Level ConfidenceLevel `json:"level"`
	Basis string          `json:"basis,omitempty"`
}

func (c Confidence) Validate() error {
	switch c.Level {
	case ConfidenceUnknown:
		if strings.TrimSpace(c.Basis) != "" {
			return fmt.Errorf("unknown confidence cannot claim basis")
		}
		return nil
	case ConfidenceLow, ConfidenceMedium, ConfidenceHigh:
		if strings.TrimSpace(c.Basis) == "" {
			return fmt.Errorf("basis is required for %s", c.Level)
		}
		return nil
	default:
		return fmt.Errorf("unknown confidence level %q", c.Level)
	}
}

type Evidence struct {
	Provenance Provenance `json:"provenance"`
	Confidence Confidence `json:"confidence"`
}

func (e Evidence) Validate() error {
	if err := e.Provenance.Validate(); err != nil {
		return err
	}
	return e.Confidence.Validate()
}

// Sourced envuelve un valor con su evidencia (presencia/procedencia/confianza).
type Sourced[T any] struct {
	Value    T        `json:"value"`
	Evidence Evidence `json:"evidence"`
}

// Presence para familias o campos individuales (spec §6, congelado en F1.2).
type Presence string

const (
	PresenceValid       Presence = "valid"
	PresenceMissing     Presence = "missing"
	PresenceInvalid     Presence = "invalid"
	PresenceStale       Presence = "stale"
	PresenceUnsupported Presence = "unsupported"
	PresenceUnknown     Presence = "unknown"
)

func (p Presence) Valid() bool {
	switch p {
	case PresenceValid, PresenceMissing, PresenceInvalid, PresenceStale, PresenceUnsupported, PresenceUnknown:
		return true
	default:
		return false
	}
}

type EventSource string

const (
	EventSourceCustom EventSource = "custom"
	EventSourceSeries EventSource = "series"
	EventSourceRoster EventSource = "roster"
)

func (s EventSource) Valid() bool {
	switch s {
	case EventSourceCustom, EventSourceSeries, EventSourceRoster:
		return true
	default:
		return false
	}
}

type TeamMode string

const (
	TeamModeSolo TeamMode = "solo"
	TeamModeTeam TeamMode = "team"
)

type FillMode string

const (
	FillModeManual FillMode = "manual"
)

func (m FillMode) Valid() bool { return m == FillModeManual }

type DriverID string
type EventID string
type VariantID string

type AvailabilityState string

const (
	AvailabilityOK AvailabilityState = "ok"
	AvailabilityNo AvailabilityState = "no"
)

type AvailabilityWindow struct {
	State AvailabilityState `json:"state"`
	From  int               `json:"from"`
	To    int               `json:"to"`
}

func (w AvailabilityWindow) Validate() error {
	if w.State != AvailabilityOK && w.State != AvailabilityNo {
		return fmt.Errorf("unknown availability state %q", w.State)
	}
	if w.From >= w.To {
		return fmt.Errorf("availability from must be < to")
	}
	if w.From < 0 || w.To > 24*60 {
		return fmt.Errorf("availability must be within a day")
	}
	return nil
}

type Driver struct {
	ID       DriverID                   `json:"id"`
	Order    int                        `json:"order"`
	Name     *Sourced[string]           `json:"name,omitempty"`
	Ini      *Sourced[string]           `json:"ini,omitempty"`
	Color    *Sourced[string]           `json:"color,omitempty"`
	Class    *Sourced[string]           `json:"cls,omitempty"`
	RawExtra map[string]json.RawMessage `json:"rawExtra,omitempty"`
}

type VariantState string

const (
	VariantStateDraft VariantState = "draft"
	VariantStateOK    VariantState = "ok"
)

type VariantMode string

const (
	VariantModeDry   VariantMode = "dry"
	VariantModeWet   VariantMode = "wet"
	VariantModeEco   VariantMode = "eco"
	VariantModeHumid VariantMode = "humid"
)

type Variant struct {
	ID        VariantID                  `json:"id"`
	Name      Sourced[string]            `json:"name"`
	Note      Sourced[string]            `json:"note"`
	Mode      Sourced[VariantMode]       `json:"mode"`
	Order     []DriverID                 `json:"order"`
	State     Sourced[VariantState]      `json:"state"`
	Overrides map[string]json.RawMessage `json:"overrides,omitempty"`
	Tyres     map[string]json.RawMessage `json:"tyres,omitempty"`
}

func (v Variant) Validate() error {
	if strings.TrimSpace(string(v.ID)) == "" {
		return fmt.Errorf("variant id is required")
	}
	if len(v.Order) == 0 {
		return fmt.Errorf("variant order must be non-empty")
	}
	if err := v.Name.Evidence.Validate(); err != nil {
		return fmt.Errorf("name evidence: %w", err)
	}
	if strings.TrimSpace(v.Name.Value) == "" {
		return fmt.Errorf("variant name is required")
	}
	if err := v.Note.Evidence.Validate(); err != nil {
		return fmt.Errorf("note evidence: %w", err)
	}
	if err := v.Mode.Evidence.Validate(); err != nil {
		return fmt.Errorf("mode evidence: %w", err)
	}
	switch v.Mode.Value {
	case VariantModeDry, VariantModeWet, VariantModeEco, VariantModeHumid:
	default:
		return fmt.Errorf("unknown variant mode %q", v.Mode.Value)
	}
	if err := v.State.Evidence.Validate(); err != nil {
		return fmt.Errorf("state evidence: %w", err)
	}
	if v.State.Value != VariantStateDraft && v.State.Value != VariantStateOK {
		return fmt.Errorf("unknown variant state %q", v.State.Value)
	}
	seen := make(map[DriverID]struct{}, len(v.Order))
	for _, driverID := range v.Order {
		if strings.TrimSpace(string(driverID)) == "" {
			return fmt.Errorf("variant order contains empty driver id")
		}
		if _, duplicate := seen[driverID]; duplicate {
			return fmt.Errorf("variant order contains duplicate driver %q", driverID)
		}
		seen[driverID] = struct{}{}
	}
	for field, raw := range v.Overrides {
		if !json.Valid(raw) {
			return fmt.Errorf("override %q is invalid JSON", field)
		}
	}
	for field, raw := range v.Tyres {
		if !json.Valid(raw) {
			return fmt.Errorf("tyre %q is invalid JSON", field)
		}
	}
	return nil
}

// TyreCompound es el identificador de compuesto (mapping 0-2 sin semántica
// garantizada; se conserva raw y nota).
type TyreCompound string

type TyreInventory struct {
	// Sets por evento: inventario físico disponible. Cada set tiene compuesto
	// y cantidad. El contrato no inventa sets si no existen en el backup.
	Sets []TyreSet `json:"sets"`
	// ByCompound es el conteo físico por compuesto crudo ("0","1","2" o nombre
	// semántico cuando el mapping esté resuelto).
	ByCompound map[TyreCompound]int `json:"byCompound,omitempty"`
	// Note explica mapping (p.ej. compoundMappingNote de projection).
	Note string `json:"note,omitempty"`
}

type TyreSet struct {
	CompoundRaw *int          `json:"compoundRaw,omitempty"`
	Compound    *TyreCompound `json:"compound,omitempty"`
	Count       int           `json:"count"`
	Presence    Presence      `json:"presence"`
	Provenance  Provenance    `json:"provenance"`
}

type SessionSelection struct {
	SessionID string `json:"sessionId"`
	Included  bool   `json:"included"`
}

// CombinationReference links an event to Analysis-owned historical sessions.
// The decisions are non-destructive: they only say which session participates
// in this event and never mutate or remove historical telemetry.
type CombinationReference struct {
	CombinationID string             `json:"combinationId"`
	Sessions      []SessionSelection `json:"sessions"`
}

type Event struct {
	ID               EventID                           `json:"id"`
	Name             Sourced[string]                   `json:"name"`
	Source           Sourced[EventSource]              `json:"source"`
	SeriesID         *Sourced[string]                  `json:"seriesId,omitempty"`
	Track            Sourced[string]                   `json:"track"`
	Class            Sourced[string]                   `json:"cls"`
	DurationMin      Sourced[int]                      `json:"durationMin"`
	StartAt          Sourced[*time.Time]               `json:"startAt"`
	Team             *Sourced[string]                  `json:"team,omitempty"`
	Drivers          []Driver                          `json:"drivers"`
	TankLiters       Sourced[float64]                  `json:"tankLiters"`
	PitLossSeconds   Sourced[float64]                  `json:"pitLossSeconds"`
	Strategies       []Variant                         `json:"strategies"`
	Availability     map[DriverID][]AvailabilityWindow `json:"availability"`
	ActiveStrategyID *VariantID                        `json:"activeStrategyId,omitempty"`
	TeamMode         *Sourced[TeamMode]                `json:"teamMode,omitempty"`
	FillMode         Sourced[FillMode]                 `json:"fillMode"`
	LastOpenedAt     *Sourced[*time.Time]              `json:"lastOpenedAt,omitempty"`
	TyreInventory    TyreInventory                     `json:"tyreInventory"`
	Combination      *CombinationReference             `json:"combination,omitempty"`
	// RawLegacy preserva los bytes originales del backup, incluso cuando el
	// JSON está corrupto y debe ir a cuarentena. encoding/json lo representa
	// como base64, evitando la compactación destructiva de json.RawMessage.
	RawLegacy []byte `json:"rawLegacy,omitempty"`
}

// StrategyDocumentV2 es el documento del evento para Orbit tras la migración.
// Cada campo que en Orbit tenía default silencioso (90 L, 60 s, 60 min, now,
// name fallback, track/cls vacíos, availability sin validar) viaja ahora con
// procedencia explícita (observed vs legacy_synthetic_default vs missing) y
// el backup raw permite preview/cuarentena sin pérdida.
type StrategyDocumentV2 struct {
	ContractVersion ContractVersion `json:"contractVersion"`
	SchemaVersion   string          `json:"schemaVersion"`
	GeneratedAt     time.Time       `json:"generatedAt"`
	Events          []Event         `json:"events"`
	ActiveEventID   *EventID        `json:"activeEventId,omitempty"`
	// MigrationMeta registra fingerprint/journal para idempotencia.
	MigrationMeta     *MigrationMeta     `json:"migrationMeta,omitempty"`
	MigrationArchives []MigrationArchive `json:"migrationArchives,omitempty"`
}

type MigrationMeta struct {
	SourceFingerprint     string                 `json:"sourceFingerprint"`
	JournalID             string                 `json:"journalId"`
	MigratedAt            time.Time              `json:"migratedAt"`
	Status                string                 `json:"status"`
	Sources               []LegacyStorageBackup  `json:"sources"`
	Quarantine            []LegacyQuarantineItem `json:"quarantine,omitempty"`
	Warnings              []string               `json:"warnings,omitempty"`
	PreviousGeneratedAt   *time.Time             `json:"previousGeneratedAt,omitempty"`
	PreviousEvents        []Event                `json:"previousEvents,omitempty"`
	PreviousActiveEventID *EventID               `json:"previousActiveEventId,omitempty"`
	SupersededJournals    []LegacyJournalBackup  `json:"supersededJournals,omitempty"`
}

type LegacyJournalBackup struct {
	SourceFingerprint string                `json:"sourceFingerprint"`
	JournalID         string                `json:"journalId"`
	BackedUpAt        time.Time             `json:"backedUpAt"`
	Sources           []LegacyStorageBackup `json:"sources"`
}

type LegacyStorageBackup struct {
	Key     string `json:"key"`
	Present bool   `json:"present"`
	Raw     []byte `json:"raw"`
}

type LegacyQuarantineItem struct {
	SourceKey string `json:"sourceKey"`
	Path      string `json:"path"`
	Code      string `json:"code"`
	Message   string `json:"message"`
	Raw       []byte `json:"raw,omitempty"`
}

type MigrationArchive struct {
	JournalID     string    `json:"journalId"`
	ArchivedAt    time.Time `json:"archivedAt"`
	GeneratedAt   time.Time `json:"generatedAt"`
	Events        []Event   `json:"events"`
	ActiveEventID *EventID  `json:"activeEventId,omitempty"`
}

func (d StrategyDocumentV2) Validate() error {
	if d.ContractVersion != ContractVersionV2 {
		return fmt.Errorf("unsupported contractVersion %q", d.ContractVersion)
	}
	if d.SchemaVersion != SchemaVersionV2 {
		return fmt.Errorf("unsupported schemaVersion %q", d.SchemaVersion)
	}
	if d.GeneratedAt.IsZero() {
		return fmt.Errorf("generatedAt is required")
	}
	seen := make(map[EventID]struct{})
	for _, ev := range d.Events {
		if strings.TrimSpace(string(ev.ID)) == "" {
			return fmt.Errorf("event id is required")
		}
		if _, dup := seen[ev.ID]; dup {
			return fmt.Errorf("duplicate event id %q", ev.ID)
		}
		seen[ev.ID] = struct{}{}
		if err := ev.Name.Evidence.Validate(); err != nil {
			return fmt.Errorf("event %q name evidence: %w", ev.ID, err)
		}
		if strings.TrimSpace(ev.Name.Value) == "" {
			return fmt.Errorf("event %q name is required", ev.ID)
		}
		if !ev.Source.Value.Valid() {
			return fmt.Errorf("event %q source invalid %q", ev.ID, ev.Source.Value)
		}
		if err := ev.Source.Evidence.Validate(); err != nil {
			return fmt.Errorf("event %q source evidence: %w", ev.ID, err)
		}
		if ev.SeriesID != nil {
			if strings.TrimSpace(ev.SeriesID.Value) == "" {
				return fmt.Errorf("event %q seriesId is empty", ev.ID)
			}
			if err := ev.SeriesID.Evidence.Validate(); err != nil {
				return fmt.Errorf("event %q seriesId evidence: %w", ev.ID, err)
			}
		}
		if err := ev.Track.Evidence.Validate(); err != nil {
			return fmt.Errorf("event %q track evidence: %w", ev.ID, err)
		}
		if err := ev.Class.Evidence.Validate(); err != nil {
			return fmt.Errorf("event %q cls evidence: %w", ev.ID, err)
		}
		if err := ev.DurationMin.Evidence.Validate(); err != nil {
			return fmt.Errorf("event %q durationMin evidence: %w", ev.ID, err)
		}
		if ev.DurationMin.Value <= 0 {
			return fmt.Errorf("event %q durationMin must be >0", ev.ID)
		}
		if err := ev.StartAt.Evidence.Validate(); err != nil {
			return fmt.Errorf("event %q startAt evidence: %w", ev.ID, err)
		}
		if ev.StartAt.Value != nil && ev.StartAt.Value.IsZero() {
			return fmt.Errorf("event %q startAt is zero", ev.ID)
		}
		if ev.Team != nil {
			if err := ev.Team.Evidence.Validate(); err != nil {
				return fmt.Errorf("event %q team evidence: %w", ev.ID, err)
			}
		}
		if err := ev.TankLiters.Evidence.Validate(); err != nil {
			return fmt.Errorf("event %q tankLiters evidence: %w", ev.ID, err)
		}
		if ev.TankLiters.Value <= 0 || math.IsNaN(ev.TankLiters.Value) || math.IsInf(ev.TankLiters.Value, 0) {
			return fmt.Errorf("event %q tankLiters must be finite and >0", ev.ID)
		}
		if err := ev.PitLossSeconds.Evidence.Validate(); err != nil {
			return fmt.Errorf("event %q pitLossSeconds evidence: %w", ev.ID, err)
		}
		if ev.Combination != nil {
			if strings.TrimSpace(ev.Combination.CombinationID) == "" {
				return fmt.Errorf("event %q combination id is required", ev.ID)
			}
			sessions := make(map[string]struct{}, len(ev.Combination.Sessions))
			for _, session := range ev.Combination.Sessions {
				if strings.TrimSpace(session.SessionID) == "" {
					return fmt.Errorf("event %q combination session id is required", ev.ID)
				}
				if _, duplicate := sessions[session.SessionID]; duplicate {
					return fmt.Errorf("event %q duplicate combination session %q", ev.ID, session.SessionID)
				}
				sessions[session.SessionID] = struct{}{}
			}
		}
		if ev.PitLossSeconds.Value < 0 || math.IsNaN(ev.PitLossSeconds.Value) || math.IsInf(ev.PitLossSeconds.Value, 0) {
			return fmt.Errorf("event %q pitLossSeconds must be finite and >=0", ev.ID)
		}
		// drivers: validar shape completo (matriz exige no solo id).
		driverIDs := make(map[DriverID]struct{}, len(ev.Drivers))
		driverOrders := make(map[int]struct{}, len(ev.Drivers))
		for _, dr := range ev.Drivers {
			if strings.TrimSpace(string(dr.ID)) == "" {
				return fmt.Errorf("event %q driver id required", ev.ID)
			}
			if _, duplicate := driverIDs[dr.ID]; duplicate {
				return fmt.Errorf("event %q duplicate driver id %q", ev.ID, dr.ID)
			}
			driverIDs[dr.ID] = struct{}{}
			if dr.Order < 0 || dr.Order >= len(ev.Drivers) {
				return fmt.Errorf("event %q driver %q order out of range", ev.ID, dr.ID)
			}
			if _, duplicate := driverOrders[dr.Order]; duplicate {
				return fmt.Errorf("event %q duplicate driver order %d", ev.ID, dr.Order)
			}
			driverOrders[dr.Order] = struct{}{}
			for field, sourced := range map[string]*Sourced[string]{"name": dr.Name, "ini": dr.Ini, "color": dr.Color, "cls": dr.Class} {
				if sourced != nil {
					if err := sourced.Evidence.Validate(); err != nil {
						return fmt.Errorf("event %q driver %q %s evidence: %w", ev.ID, dr.ID, field, err)
					}
				}
			}
			for field, raw := range dr.RawExtra {
				if !json.Valid(raw) {
					return fmt.Errorf("event %q driver %q rawExtra %q is invalid JSON", ev.ID, dr.ID, field)
				}
			}
		}
		variantIDs := make(map[VariantID]struct{}, len(ev.Strategies))
		for _, v := range ev.Strategies {
			if err := v.Validate(); err != nil {
				return fmt.Errorf("event %q variant %q: %w", ev.ID, v.ID, err)
			}
			if _, duplicate := variantIDs[v.ID]; duplicate {
				return fmt.Errorf("event %q duplicate variant id %q", ev.ID, v.ID)
			}
			variantIDs[v.ID] = struct{}{}
			// referencias a pilotos deben existir en drivers.
			for _, pid := range v.Order {
				if _, found := driverIDs[pid]; !found {
					return fmt.Errorf("event %q variant %q order references unknown driver %q", ev.ID, v.ID, pid)
				}
			}
		}
		if ev.ActiveStrategyID != nil {
			if _, found := variantIDs[*ev.ActiveStrategyID]; !found {
				return fmt.Errorf("event %q activeStrategyId %q not found", ev.ID, *ev.ActiveStrategyID)
			}
		}
		for driverID, wins := range ev.Availability {
			if _, found := driverIDs[driverID]; !found {
				return fmt.Errorf("event %q availability references unknown driver %q", ev.ID, driverID)
			}
			for index, w := range wins {
				if err := w.Validate(); err != nil {
					return fmt.Errorf("event %q availability %q: %w", ev.ID, driverID, err)
				}
				for previous := 0; previous < index; previous++ {
					other := wins[previous]
					if w.From < other.To && other.From < w.To {
						return fmt.Errorf("event %q availability %q has overlapping windows", ev.ID, driverID)
					}
				}
			}
		}
		if ev.TeamMode != nil {
			if err := ev.TeamMode.Evidence.Validate(); err != nil {
				return fmt.Errorf("event %q teamMode evidence: %w", ev.ID, err)
			}
			if ev.TeamMode.Value != TeamModeSolo && ev.TeamMode.Value != TeamModeTeam {
				return fmt.Errorf("event %q teamMode invalid %q", ev.ID, ev.TeamMode.Value)
			}
		}
		if err := ev.FillMode.Evidence.Validate(); err != nil {
			return fmt.Errorf("event %q fillMode evidence: %w", ev.ID, err)
		}
		if !ev.FillMode.Value.Valid() {
			return fmt.Errorf("event %q fillMode invalid %q", ev.ID, ev.FillMode.Value)
		}
		if ev.LastOpenedAt != nil {
			if err := ev.LastOpenedAt.Evidence.Validate(); err != nil {
				return fmt.Errorf("event %q lastOpenedAt evidence: %w", ev.ID, err)
			}
			if ev.LastOpenedAt.Value != nil && ev.LastOpenedAt.Value.IsZero() {
				return fmt.Errorf("event %q lastOpenedAt is zero", ev.ID)
			}
		}
		if err := ev.TyreInventory.Validate(); err != nil {
			return fmt.Errorf("event %q tyreInventory: %w", ev.ID, err)
		}
	}
	if d.ActiveEventID != nil {
		if _, ok := seen[*d.ActiveEventID]; !ok {
			return fmt.Errorf("activeEventId %q not found", *d.ActiveEventID)
		}
	}
	if d.MigrationMeta != nil {
		if strings.TrimSpace(d.MigrationMeta.SourceFingerprint) == "" {
			return fmt.Errorf("migrationMeta.sourceFingerprint is required")
		}
		if strings.TrimSpace(d.MigrationMeta.JournalID) == "" {
			return fmt.Errorf("migrationMeta.journalId is required")
		}
		if d.MigrationMeta.MigratedAt.IsZero() {
			return fmt.Errorf("migrationMeta.migratedAt is required")
		}
		if d.MigrationMeta.Status != "backed_up" && d.MigrationMeta.Status != "committed" && d.MigrationMeta.Status != "rolled_back" {
			return fmt.Errorf("migrationMeta.status invalid %q", d.MigrationMeta.Status)
		}
		if len(d.MigrationMeta.Sources) == 0 {
			return fmt.Errorf("migrationMeta.sources is required")
		}
		for index, source := range d.MigrationMeta.Sources {
			if strings.TrimSpace(source.Key) == "" {
				return fmt.Errorf("migrationMeta.sources[%d].key is required", index)
			}
			if !source.Present && len(source.Raw) != 0 {
				return fmt.Errorf("migrationMeta.sources[%d] absent source has bytes", index)
			}
		}
		for index, journal := range d.MigrationMeta.SupersededJournals {
			if strings.TrimSpace(journal.SourceFingerprint) == "" || strings.TrimSpace(journal.JournalID) == "" || journal.BackedUpAt.IsZero() || len(journal.Sources) == 0 {
				return fmt.Errorf("migrationMeta.supersededJournals[%d] is invalid", index)
			}
		}
	}
	for index, archive := range d.MigrationArchives {
		if strings.TrimSpace(archive.JournalID) == "" || archive.ArchivedAt.IsZero() || archive.GeneratedAt.IsZero() {
			return fmt.Errorf("migrationArchives[%d] metadata is invalid", index)
		}
		archived := StrategyDocumentV2{
			ContractVersion: ContractVersionV2,
			SchemaVersion:   SchemaVersionV2,
			GeneratedAt:     archive.GeneratedAt,
			Events:          archive.Events,
			ActiveEventID:   archive.ActiveEventID,
		}
		if err := archived.Validate(); err != nil {
			return fmt.Errorf("migrationArchives[%d]: %w", index, err)
		}
	}
	return nil
}

func (inventory TyreInventory) Validate() error {
	for index, set := range inventory.Sets {
		if set.CompoundRaw == nil && set.Compound == nil {
			return fmt.Errorf("set %d compound is required", index)
		}
		if set.CompoundRaw != nil && (*set.CompoundRaw < 0 || *set.CompoundRaw > 2) {
			return fmt.Errorf("set %d compoundRaw must be between 0 and 2", index)
		}
		if set.Compound != nil && strings.TrimSpace(string(*set.Compound)) == "" {
			return fmt.Errorf("set %d compound is empty", index)
		}
		if set.Count <= 0 {
			return fmt.Errorf("set %d count must be >0", index)
		}
		if !set.Presence.Valid() {
			return fmt.Errorf("set %d presence invalid %q", index, set.Presence)
		}
		if err := set.Provenance.Validate(); err != nil {
			return fmt.Errorf("set %d provenance: %w", index, err)
		}
	}
	for compound, count := range inventory.ByCompound {
		if strings.TrimSpace(string(compound)) == "" {
			return fmt.Errorf("byCompound contains empty compound")
		}
		if count < 0 {
			return fmt.Errorf("byCompound %q count must be >=0", compound)
		}
	}
	return nil
}

// CompatibilityNote documenta la matriz v1→v2 (ver docs/strategy-planner/f1-3-matriz-v1-v2.md pendiente).
// v1 (strategy.v1) era PlanDraft/PlanRevision orientado a planes individuales;
// v2 es StrategyDocumentV2 orientado a eventos con pilotos/variantes/inventario
// por evento y con procedencia explícita para defaults sintéticos legacy.
func CompatibilityNote() string {
	return "v1 (strategy.v1) PlanDraft/Revision sigue válido para planes individuales; v2 (strategy.v2) añade " +
		"StrategyDocumentV2 con eventos, pilotos orden/disponibilidad, variantes por evento e inventario de neumáticos por evento; " +
		"la migración distingue dato real de legacy_synthetic_default (90L/60s/60min/now/name fallback) y preserva backup byte a byte; " +
		"v1 no se retira en este corte"
}
