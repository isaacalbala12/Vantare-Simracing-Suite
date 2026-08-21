package document

import (
	"encoding/json"
	"fmt"
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
	// RawLegacy preserva el json original del backup byte a byte para auditoría.
	RawLegacy json.RawMessage `json:"rawLegacy,omitempty"`
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
	MigrationMeta *MigrationMeta `json:"migrationMeta,omitempty"`
}

type MigrationMeta struct {
	SourceFingerprint string    `json:"sourceFingerprint"`
	JournalID         string    `json:"journalId"`
	MigratedAt        time.Time `json:"migratedAt"`
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
		if !ev.Source.Value.Valid() {
			return fmt.Errorf("event %q source invalid %q", ev.ID, ev.Source.Value)
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
		if err := ev.TankLiters.Evidence.Validate(); err != nil {
			return fmt.Errorf("event %q tankLiters evidence: %w", ev.ID, err)
		}
		if err := ev.PitLossSeconds.Evidence.Validate(); err != nil {
			return fmt.Errorf("event %q pitLossSeconds evidence: %w", ev.ID, err)
		}
		// drivers: validar shape completo (matriz exige no solo id).
		for _, dr := range ev.Drivers {
			if strings.TrimSpace(string(dr.ID)) == "" {
				return fmt.Errorf("event %q driver id required", ev.ID)
			}
		}
		for _, v := range ev.Strategies {
			if err := v.Validate(); err != nil {
				return fmt.Errorf("event %q variant %q: %w", ev.ID, v.ID, err)
			}
			// referencias a pilotos deben existir en drivers.
			for _, pid := range v.Order {
				found := false
				for _, dr := range ev.Drivers {
					if dr.ID == pid {
						found = true
						break
					}
				}
				if !found {
					return fmt.Errorf("event %q variant %q order references unknown driver %q", ev.ID, v.ID, pid)
				}
			}
		}
		if ev.ActiveStrategyID != nil {
			found := false
			for _, v := range ev.Strategies {
				if v.ID == *ev.ActiveStrategyID {
					found = true
					break
				}
			}
			if !found {
				return fmt.Errorf("event %q activeStrategyId %q not found", ev.ID, *ev.ActiveStrategyID)
			}
		}
		for driverID, wins := range ev.Availability {
			found := false
			for _, dr := range ev.Drivers {
				if dr.ID == driverID {
					found = true
					break
				}
			}
			if !found {
				return fmt.Errorf("event %q availability references unknown driver %q", ev.ID, driverID)
			}
			for _, w := range wins {
				if err := w.Validate(); err != nil {
					return fmt.Errorf("event %q availability %q: %w", ev.ID, driverID, err)
				}
			}
		}
	}
	if d.ActiveEventID != nil {
		if _, ok := seen[*d.ActiveEventID]; !ok {
			return fmt.Errorf("activeEventId %q not found", *d.ActiveEventID)
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
