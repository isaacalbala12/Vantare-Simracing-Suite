package application

import (
	"regexp"
	"time"

	"github.com/vantare/overlays/v2/internal/strategy/contract"
	strategydocument "github.com/vantare/overlays/v2/internal/strategy/document"
	"github.com/vantare/overlays/v2/internal/strategy/packaging"
)

const ProtocolVersionV1 = "strategy.application.v1"

type CommandID string
type Operation string

const (
	OperationCreate                  Operation = "create"
	OperationOpen                    Operation = "open"
	OperationEdit                    Operation = "edit"
	OperationSaveRevision            Operation = "save_revision"
	OperationDuplicate               Operation = "duplicate"
	OperationActivate                Operation = "activate"
	OperationDeactivate              Operation = "deactivate"
	OperationRestore                 Operation = "restore"
	OperationClose                   Operation = "close"
	OperationList                    Operation = "list"
	OperationExport                  Operation = "export"
	OperationImport                  Operation = "import"
	OperationCreateEvent             Operation = "create_event"
	OperationEditEvent               Operation = "edit_event"
	OperationListEvents              Operation = "list_events"
	OperationCreateDriver            Operation = "create_driver"
	OperationEditDriver              Operation = "edit_driver"
	OperationDeleteDriver            Operation = "delete_driver"
	OperationListDrivers             Operation = "list_drivers"
	OperationCreateVariant           Operation = "create_variant"
	OperationEditVariant             Operation = "edit_variant"
	OperationListVariants            Operation = "list_variants"
	OperationCompareVariants         Operation = "compare_variants"
	OperationCalculateOrbit          Operation = "calculate_orbit"
	OperationPreviewLegacyMigration  Operation = "preview_legacy_migration"
	OperationMigrateLegacy           Operation = "migrate_legacy"
	OperationRollbackLegacyMigration Operation = "rollback_legacy_migration"
)

var commandIDPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`)

type CommandHeader struct {
	ProtocolVersion           string    `json:"protocolVersion"`
	CommandID                 CommandID `json:"commandId"`
	Operation                 Operation `json:"operation"`
	ExpectedRepositoryVersion uint64    `json:"expectedRepositoryVersion"`
}

type CreateCommand[T any] struct {
	CommandHeader
	Draft contract.PlanDraft[T] `json:"draft"`
}

type OpenCommand struct {
	CommandHeader
	DraftID contract.DraftID `json:"draftId"`
}

type EditCommand[T any] struct {
	CommandHeader
	Draft contract.PlanDraft[T] `json:"draft"`
}

type SaveRevisionCommand[T any] struct {
	CommandHeader
	Draft      contract.PlanDraft[T] `json:"draft"`
	RevisionID contract.RevisionID   `json:"revisionId"`
	CreatedAt  time.Time             `json:"createdAt"`
}

type DuplicateCommand[T any] struct {
	CommandHeader
	SourceDraft     contract.PlanDraft[T] `json:"sourceDraft"`
	TargetDraftID   contract.DraftID      `json:"targetDraftId"`
	TargetPlanID    contract.PlanID       `json:"targetPlanId"`
	TargetVariantID contract.VariantID    `json:"targetVariantId"`
	Name            string                `json:"name"`
	UpdatedAt       time.Time             `json:"updatedAt"`
}

type ActivateCommand struct {
	CommandHeader
	Revision     contract.RevisionRef  `json:"revision"`
	ActivationID contract.ActivationID `json:"activationId"`
	ActivatedAt  time.Time             `json:"activatedAt"`
	Current      *contract.ActivePlan  `json:"current,omitempty"`
}

type DeactivateCommand struct {
	CommandHeader
	Current              *contract.ActivePlan  `json:"current,omitempty"`
	ExpectedActivationID contract.ActivationID `json:"expectedActivationId"`
}

type RestoreCommand struct {
	CommandHeader
	DraftID contract.DraftID `json:"draftId"`
}

type CloseCommand[T any] struct {
	CommandHeader
	Draft      contract.PlanDraft[T] `json:"draft"`
	SavedDraft contract.PlanDraft[T] `json:"savedDraft"`
	Discard    bool                  `json:"discard"`
}

// ListCommand asks for the library. It reads and never writes, so it carries no
// expected version to check against.
type ListCommand struct {
	CommandHeader
}

// PlanSummary is what "My plans" needs to find and choose a plan. It carries no
// payload on purpose: a library view must not load the contents of every plan
// to draw a list of them.
type PlanSummary struct {
	PlanID    contract.PlanID    `json:"planId"`
	VariantID contract.VariantID `json:"variantId"`
	// DraftID is present only while the plan has unsaved work open.
	DraftID contract.DraftID  `json:"draftId,omitempty"`
	Name    string            `json:"name"`
	Mode    contract.PlanMode `json:"mode"`
	// UpdatedAt is the most recent activity, draft or revision.
	UpdatedAt     time.Time `json:"updatedAt"`
	HasDraft      bool      `json:"hasDraft"`
	RevisionCount int       `json:"revisionCount"`
	// LatestRevision identifies what would be opened or activated.
	LatestRevision   *contract.RevisionRef `json:"latestRevision,omitempty"`
	LatestRevisionAt *time.Time            `json:"latestRevisionAt,omitempty"`
}

// PlanSelector names one plan variant to export.
type PlanSelector struct {
	PlanID    contract.PlanID    `json:"planId"`
	VariantID contract.VariantID `json:"variantId"`
	// Revision narrows the package to one immutable snapshot. When omitted,
	// export keeps the library behaviour and includes the whole plan bundle.
	Revision *contract.RevisionRef `json:"revision,omitempty"`
}

// ExportCommand asks for a package containing the selected plans. Exporting is
// explicit and local: the service returns the bytes, and writing them anywhere
// is the caller's decision, not this service's.
type ExportCommand struct {
	CommandHeader
	// Plans selects what to export. Empty is rejected rather than treated as
	// "everything": exporting more than intended is not a safe default.
	Plans      []PlanSelector       `json:"plans"`
	Provenance packaging.Provenance `json:"provenance"`
}

// ImportCommand offers a package. With DryRun set, the service reports what
// would happen and touches nothing; without it, the whole package is applied
// as one repository transaction or not at all.
type ImportCommand struct {
	CommandHeader
	Package []byte `json:"package"`
	DryRun  bool   `json:"dryRun"`
}

type CreateEventCommand struct {
	CommandHeader
	Event     strategydocument.Event `json:"event"`
	UpdatedAt time.Time              `json:"updatedAt"`
}

type EditEventCommand = CreateEventCommand

type ListEventsCommand struct{ CommandHeader }

type CreateDriverCommand struct {
	CommandHeader
	EventID   strategydocument.EventID `json:"eventId"`
	Driver    strategydocument.Driver  `json:"driver"`
	UpdatedAt time.Time                `json:"updatedAt"`
}

type EditDriverCommand = CreateDriverCommand

type DeleteDriverCommand struct {
	CommandHeader
	EventID   strategydocument.EventID  `json:"eventId"`
	DriverID  strategydocument.DriverID `json:"driverId"`
	UpdatedAt time.Time                 `json:"updatedAt"`
}

type ListDriversCommand struct {
	CommandHeader
	EventID strategydocument.EventID `json:"eventId"`
}

type CreateVariantCommand struct {
	CommandHeader
	EventID   strategydocument.EventID `json:"eventId"`
	Variant   strategydocument.Variant `json:"variant"`
	UpdatedAt time.Time                `json:"updatedAt"`
}

type EditVariantCommand = CreateVariantCommand

type ListVariantsCommand struct {
	CommandHeader
	EventID strategydocument.EventID `json:"eventId"`
}

type CompareVariantsCommand struct {
	CommandHeader
	EventID        strategydocument.EventID   `json:"eventId"`
	LeftVariantID  strategydocument.VariantID `json:"leftVariantId"`
	RightVariantID strategydocument.VariantID `json:"rightVariantId"`
}

// CalculateOrbitCommand is the narrow compatibility boundary used while
// Command Orbit is cut over from its historical TypeScript calculator. The
// application layer owns the translation; manual and solver remain the
// authorities for race/resource calculation and stint optimisation.
type CalculateOrbitCommand struct {
	CommandHeader
	Input OrbitCalculationInput `json:"input"`
}

type OrbitCalculationInput struct {
	Event           OrbitCalculationEvent     `json:"event"`
	Drivers         []OrbitCalculationDriver  `json:"drivers"`
	Variants        []OrbitCalculationVariant `json:"variants"`
	ActiveVariantID string                    `json:"activeVariantId"`
}

type OrbitCalculationEvent struct {
	DurationMinutes float64 `json:"durationMinutes"`
	TankLiters      float64 `json:"tankLiters"`
	PitLossSeconds  float64 `json:"pitLossSeconds"`
}

type OrbitCalculationPace struct {
	PaceSeconds      float64 `json:"paceSeconds"`
	FuelLitersPerLap float64 `json:"fuelLitersPerLap"`
}

type OrbitCalculationDriver struct {
	ID   string               `json:"id"`
	Name string               `json:"name"`
	Dry  OrbitCalculationPace `json:"dry"`
	Wet  OrbitCalculationPace `json:"wet"`
	Eco  OrbitCalculationPace `json:"eco"`
}

type OrbitCalculationOverride struct {
	Laps *int64   `json:"laps,omitempty"`
	Fuel *float64 `json:"fuel,omitempty"`
}

type OrbitCalculationVariant struct {
	ID        string                           `json:"id"`
	Mode      string                           `json:"mode"`
	Order     []string                         `json:"order"`
	Overrides map[int]OrbitCalculationOverride `json:"overrides"`
}

type OrbitCalculationStint struct {
	Index            int     `json:"i"`
	DriverID         string  `json:"d"`
	Laps             int64   `json:"laps"`
	Fuel             float64 `json:"fuel"`
	Pace             float64 `json:"pace"`
	StartSeconds     float64 `json:"start"`
	EndSeconds       float64 `json:"end"`
	FirstLap         int64   `json:"lap0"`
	LastLap          int64   `json:"lap1"`
	PitWindowLap     int64   `json:"pitWindowLap"`
	PitWindowSeconds float64 `json:"pitWindowSeconds"`
	OverCapacity     bool    `json:"over"`
	Manual           bool    `json:"manual"`
}

type OrbitCalculationDistribution struct {
	DriverID string  `json:"driverId"`
	Laps     int64   `json:"laps"`
	Seconds  float64 `json:"seconds"`
}

type OrbitCalculationPlan struct {
	Stints       []OrbitCalculationStint        `json:"stints"`
	TotalLaps    int64                          `json:"totalLaps"`
	TotalSeconds float64                        `json:"total"`
	Stops        int64                          `json:"stops"`
	MaxLaps      int64                          `json:"maxLaps"`
	AverageFuel  float64                        `json:"avgFuel"`
	AveragePace  float64                        `json:"avgPace"`
	Distribution []OrbitCalculationDistribution `json:"distribution"`
}

type OrbitCalculationComparison struct {
	WinnerID    string   `json:"winnerId"`
	LoserID     string   `json:"loserId"`
	WinnerLaps  int64    `json:"winnerLaps"`
	LoserLaps   int64    `json:"loserLaps"`
	Difference  int64    `json:"diff"`
	SavedStops  int64    `json:"savedStops"`
	SavedSecs   float64  `json:"savedS"`
	CostSecs    float64  `json:"costS"`
	Pays        bool     `json:"pays"`
	SameStops   bool     `json:"sameStops"`
	Stints      int      `json:"stints"`
	DriverCount int      `json:"driverCount"`
	Doubles     []string `json:"doubles"`
}

type OrbitCalculationResult struct {
	Plans       map[string]OrbitCalculationPlan       `json:"plans"`
	Comparisons map[string]OrbitCalculationComparison `json:"comparisons"`
}

type LegacyStorageSource struct {
	Key     string `json:"key"`
	Present bool   `json:"present"`
	Raw     []byte `json:"raw"`
}

type LegacyMigrationCommand struct {
	CommandHeader
	Sources              []LegacyStorageSource `json:"sources"`
	ConfirmedFingerprint string                `json:"confirmedFingerprint,omitempty"`
	MigratedAt           time.Time             `json:"migratedAt"`
}

type RollbackLegacyMigrationCommand struct {
	CommandHeader
	JournalID    string    `json:"journalId"`
	RolledBackAt time.Time `json:"rolledBackAt"`
}

type LegacyMigrationPreview struct {
	Fingerprint     string                                  `json:"fingerprint"`
	JournalID       string                                  `json:"journalId"`
	Document        strategydocument.StrategyDocumentV2     `json:"document"`
	Quarantine      []strategydocument.LegacyQuarantineItem `json:"quarantine"`
	Warnings        []string                                `json:"warnings"`
	ActiveEventID   *strategydocument.EventID               `json:"activeEventId,omitempty"`
	Imported        bool                                    `json:"imported"`
	AlreadyImported bool                                    `json:"alreadyImported"`
	RolledBack      bool                                    `json:"rolledBack"`
}

type VariantComparison struct {
	EventID         strategydocument.EventID `json:"eventId"`
	Left            strategydocument.Variant `json:"left"`
	Right           strategydocument.Variant `json:"right"`
	DifferentFields []string                 `json:"differentFields"`
}

type Result[T any] struct {
	ProtocolVersion   string                    `json:"protocolVersion"`
	CommandID         CommandID                 `json:"commandId"`
	RepositoryVersion uint64                    `json:"repositoryVersion"`
	Draft             *contract.PlanDraft[T]    `json:"draft,omitempty"`
	SavedDraft        *contract.PlanDraft[T]    `json:"savedDraft,omitempty"`
	Revision          *contract.PlanRevision[T] `json:"revision,omitempty"`
	ActivePlan        *contract.ActivePlan      `json:"activePlan,omitempty"`
	// Activations is the audit trail, oldest first: what was activated, when,
	// and what it replaced. It is append-only and never rewritten.
	Activations      []contract.ActivePlan                `json:"activations,omitempty"`
	Plans            []PlanSummary                        `json:"plans,omitempty"`
	StrategyDocument *strategydocument.StrategyDocumentV2 `json:"strategyDocument,omitempty"`
	Events           []strategydocument.Event             `json:"events,omitempty"`
	Drivers          []strategydocument.Driver            `json:"drivers,omitempty"`
	Variants         []strategydocument.Variant           `json:"variants,omitempty"`
	Comparison       *VariantComparison                   `json:"comparison,omitempty"`
	OrbitCalculation *OrbitCalculationResult              `json:"orbitCalculation,omitempty"`
	LegacyMigration  *LegacyMigrationPreview              `json:"legacyMigration,omitempty"`
	// Package carries exported bytes. Import returns no package.
	Package []byte `json:"package,omitempty"`
	// Preview is what an import would do. It is present on a dry run and on a
	// completed import, so the caller can report what actually happened.
	Preview             *packaging.Preview `json:"preview,omitempty"`
	Imported            bool               `json:"imported"`
	RecoveredFromBackup bool               `json:"recoveredFromBackup"`
	Closed              bool               `json:"closed"`
}
