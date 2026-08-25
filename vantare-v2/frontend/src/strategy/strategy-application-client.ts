import { Events } from "@wailsio/runtime";

import {
  decodePlanRevisionV1,
  parseActivePlanV1,
  parsePlanDraftV1,
  type ActivePlanV1,
  type PlanDraftV1,
  type PlanRevisionV1,
  type RevisionRefV1,
} from "./strategy-contract-v1";

export const STRATEGY_APPLICATION_PROTOCOL_V1 =
  "strategy.application.v1" as const;

export type StrategyApplicationOperation =
  | "create"
  | "open"
  | "edit"
  | "save_revision"
  | "duplicate"
  | "activate"
  | "deactivate"
  | "restore"
  | "close"
  | "list"
  | "export"
  | "import"
  | "create_event"
  | "edit_event"
  | "list_events"
  | "create_driver"
  | "edit_driver"
  | "delete_driver"
  | "list_drivers"
  | "create_variant"
  | "edit_variant"
  | "list_variants"
  | "compare_variants"
  | "calculate_orbit"
  | "list_session_combinations"
  | "get_event_planning_inputs"
  | "get_validated_examples"
  | "list_reference_catalog"
  | "get_cold_start_status"
  | "import_cold_start_next"
  | "retry_cold_start_failures"
  | "reject_cold_start"
  | "preview_legacy_migration"
  | "migrate_legacy"
  | "rollback_legacy_migration";

export type StrategyProvenanceKindV2 =
  | "unknown"
  | "observed"
  | "corrected"
  | "manual"
  | "derived"
  | "estimated"
  | "range"
  | "reference"
  | "legacy_synthetic_default";

export type StrategyConfidenceLevelV2 = "unknown" | "low" | "medium" | "high";

export type StrategyEvidenceV2 = {
  readonly provenance: {
    readonly kind: StrategyProvenanceKindV2;
    readonly sourceId?: string;
    readonly observedAt?: string;
  };
  readonly confidence: {
    readonly level: StrategyConfidenceLevelV2;
    readonly basis?: string;
  };
};

export type StrategySourcedV2<T> = {
  readonly value: T;
  readonly evidence: StrategyEvidenceV2;
};

export type StrategyAvailabilityWindowV2 = {
  readonly state: "ok" | "no";
  readonly from: number;
  readonly to: number;
};

export type StrategyDriverV2 = {
  readonly id: string;
  readonly order: number;
  readonly name?: StrategySourcedV2<string>;
  readonly ini?: StrategySourcedV2<string>;
  readonly color?: StrategySourcedV2<string>;
  readonly cls?: StrategySourcedV2<string>;
  readonly rawExtra?: Readonly<Record<string, unknown>>;
};

export type StrategyVariantV2 = {
  readonly id: string;
  readonly name: StrategySourcedV2<string>;
  readonly note: StrategySourcedV2<string>;
  readonly mode: StrategySourcedV2<"dry" | "wet" | "eco" | "humid">;
  readonly order: readonly string[];
  readonly state: StrategySourcedV2<"draft" | "ok">;
  readonly overrides?: Readonly<Record<string, unknown>>;
  readonly tyres?: Readonly<Record<string, unknown>>;
};

export type StrategyTyreInventoryV2 = {
  readonly sets: readonly {
    readonly compoundRaw?: number;
    readonly compound?: string;
    readonly count: number;
    readonly presence: "valid" | "missing" | "invalid" | "stale" | "unsupported" | "unknown";
    readonly provenance: StrategyEvidenceV2["provenance"];
  }[];
  readonly byCompound?: Readonly<Record<string, number>>;
  readonly note?: string;
};

export type StrategyPlanningInputFieldV2 =
  | "fuel_per_lap_liters"
  | "ve_per_lap_percent"
  | "base_pace_seconds"
  | "tank_liters"
  | "pit_loss_seconds"
  | "tyre_life_laps"
  | "degradation_per_lap_seconds"
  | "saving_fuel_per_lap"
  | "saving_time_cost_per_lap";

export type StrategyProjectionConfidenceV2 = {
  readonly sampleSize: number;
  readonly rangeLower?: number;
  readonly rangeUpper?: number;
  readonly variance?: number;
  readonly computationVersion: string;
};

export type StrategyProjectionFamilyV2 = {
  readonly presence: "valid" | "missing" | "invalid" | "stale" | "unsupported" | "unknown";
  readonly provenance: StrategyEvidenceV2["provenance"];
  readonly confidence: StrategyProjectionConfidenceV2;
  readonly reason?: string;
};

export type StrategyClassPaceReasonV2 = "no_class_pace_source";

export type StrategyInputProjectionV2 = {
  readonly contractVersion: "strategyinputprojection.v2";
  readonly generatedAt: string;
  readonly computationVersion: string;
  readonly sourceSessions: readonly string[];
  readonly combinationId: string;
  readonly fuelConsumption: StrategyProjectionFamilyV2 & {
    readonly meanPerLap: number;
    readonly rangeLower: number;
    readonly rangeUpper: number;
    readonly byClimateBucket?: Readonly<Partial<Record<"dry" | "humid" | "wet", number>>>;
  };
  readonly virtualEnergyConsumption: StrategyProjectionFamilyV2 & {
    readonly meanPerLap: number;
    readonly rangeLower: number;
    readonly rangeUpper: number;
    readonly byClimateBucket?: Readonly<Partial<Record<"dry" | "humid" | "wet", number>>>;
  };
  readonly representativePaceByClimateBucket?: Readonly<Partial<Record<"dry" | "humid" | "wet", StrategyProjectionFamilyV2 & {
    readonly medianLapSeconds: number;
  }>>>;
  readonly classPace?: StrategyProjectionFamilyV2 & {
    readonly reason?: StrategyClassPaceReasonV2;
    readonly byClassName: Readonly<Record<string, number>>;
  };
  readonly combinedStintPaceCurve: StrategyProjectionFamilyV2 & {
    readonly identifiability: "combined_only" | "separable";
    readonly points: readonly {
      readonly lapInStint: number;
      readonly deltaSeconds: number;
      readonly sampleSize: number;
      readonly rangeLower?: number;
      readonly rangeUpper?: number;
    }[];
  };
  readonly tyreDegradation: StrategyProjectionFamilyV2 & {
    readonly lifeLapsEstimate?: number;
    readonly lifeLapsRangeLower?: number;
    readonly lifeLapsRangeUpper?: number;
  };
  readonly pit: StrategyProjectionFamilyV2;
  readonly savingCost: StrategyProjectionFamilyV2 & {
    readonly levels?: readonly {
      readonly mixtureCode: number;
      readonly fuelSavedPerLap: number;
      readonly veSavedPerLap?: number;
      readonly timeCostPerLap: number;
    }[];
  };
  readonly [family: string]: unknown;
};

export type StrategyPlanningInputsV2 = {
  readonly projection?: StrategyInputProjectionV2;
  readonly overrides: Readonly<Partial<Record<StrategyPlanningInputFieldV2, {
    readonly value: number;
    readonly presence: "valid";
    readonly provenance: StrategyEvidenceV2["provenance"] & { readonly kind: "manual" | "reference" };
    readonly confidence: StrategyProjectionConfidenceV2;
  }>>>;
};

export type StrategyWeatherNodeProgressV1 = "START" | "25" | "50" | "75" | "FINISH";
export type StrategyWeatherSkyV1 = "clear" | "light_clouds" | "mostly_cloudy" | "overcast" | "partially_cloudy" | "drizzle";
export type StrategyWeatherNodeV1 = {
  readonly progress: StrategyWeatherNodeProgressV1;
  readonly rainChance: number;
  readonly sky: StrategyWeatherSkyV1;
  readonly airTempC: number;
  readonly trackTempC: number;
};
export type StrategyWeatherScenarioV1 = {
  readonly contractVersion: "weatherscenario.v1";
  readonly scenarioId: string;
  readonly combinationId: string;
  readonly generatedAt: string;
  readonly nodes: readonly [StrategyWeatherNodeV1, StrategyWeatherNodeV1, StrategyWeatherNodeV1, StrategyWeatherNodeV1, StrategyWeatherNodeV1];
  readonly provenance: {
    readonly source: string;
    readonly capturedAt: string;
    readonly freshUntil: string;
    readonly sessionType: string;
    readonly signalFreshness: string;
  };
};
export type StrategyWeightedWeatherScenarioV1 = { readonly scenario: StrategyWeatherScenarioV1; readonly weight: number };

export type StrategyEventV2 = {
  readonly id: string;
  readonly name: StrategySourcedV2<string>;
  readonly source: StrategySourcedV2<"custom" | "series" | "roster">;
  readonly seriesId?: StrategySourcedV2<string>;
  readonly track: StrategySourcedV2<string>;
  readonly cls: StrategySourcedV2<string>;
  readonly durationMin: StrategySourcedV2<number>;
  readonly startAt: StrategySourcedV2<string | null>;
  readonly team?: StrategySourcedV2<string>;
  readonly drivers: readonly StrategyDriverV2[];
  readonly tankLiters: StrategySourcedV2<number>;
  readonly pitLossSeconds: StrategySourcedV2<number>;
  readonly strategies: readonly StrategyVariantV2[];
  readonly availability: Readonly<Record<string, readonly StrategyAvailabilityWindowV2[]>>;
  readonly activeStrategyId?: string;
  readonly teamMode?: StrategySourcedV2<"solo" | "team">;
  readonly fillMode: StrategySourcedV2<"manual">;
  readonly lastOpenedAt?: StrategySourcedV2<string | null>;
  readonly tyreInventory: StrategyTyreInventoryV2;
  readonly combination?: {
    readonly combinationId: string;
    readonly sessions: readonly { readonly sessionId: string; readonly included: boolean }[];
  };
  readonly planningInputs?: StrategyPlanningInputsV2;
  readonly weatherScenarios?: readonly StrategyWeightedWeatherScenarioV1[];
  /** Go encodes the byte-exact legacy backup as base64. */
  readonly rawLegacy?: string;
};

export type StrategyDocumentV2 = {
  readonly contractVersion: "strategy.v2";
  readonly schemaVersion: "2.0.0";
  readonly generatedAt: string;
  readonly events: readonly StrategyEventV2[];
  readonly activeEventId?: string;
  readonly migrationMeta?: {
    readonly sourceFingerprint: string;
    readonly journalId: string;
    readonly migratedAt: string;
    readonly status: "backed_up" | "committed" | "rolled_back";
    readonly sources: readonly StrategyLegacyStorageSourceV1[];
    readonly quarantine?: readonly StrategyLegacyQuarantineItemV1[];
    readonly warnings?: readonly string[];
    readonly previousGeneratedAt?: string;
    readonly previousEvents?: readonly StrategyEventV2[];
    readonly previousActiveEventId?: string;
    readonly supersededJournals?: readonly {
      readonly sourceFingerprint: string;
      readonly journalId: string;
      readonly backedUpAt: string;
      readonly sources: readonly StrategyLegacyStorageSourceV1[];
    }[];
  };
  readonly migrationArchives?: readonly {
    readonly journalId: string;
    readonly archivedAt: string;
    readonly generatedAt: string;
    readonly events: readonly StrategyEventV2[];
    readonly activeEventId?: string;
  }[];
};

export type StrategyLegacyStorageSourceV1 = {
  readonly key: string;
  readonly present: boolean;
  /** UTF-8 bytes encoded as base64, exactly as Go encodes []byte. */
  readonly raw: string;
};

export type StrategyLegacyQuarantineItemV1 = {
  readonly sourceKey: string;
  readonly path: string;
  readonly code: string;
  readonly message: string;
  readonly raw?: string;
};

export type StrategyLegacyMigrationPreviewV1 = {
  readonly fingerprint: string;
  readonly journalId: string;
  readonly document: StrategyDocumentV2;
  readonly quarantine: readonly StrategyLegacyQuarantineItemV1[];
  readonly warnings: readonly string[];
  readonly activeEventId?: string;
  readonly imported: boolean;
  readonly alreadyImported: boolean;
  readonly rolledBack: boolean;
};

export type StrategyVariantComparisonV2 = {
  readonly eventId: string;
  readonly left: StrategyVariantV2;
  readonly right: StrategyVariantV2;
  readonly differentFields: readonly string[];
};

export type StrategyOrbitCalculationInputV1 = {
  readonly event: {
    readonly durationMinutes: number;
    readonly tankLiters: number;
    readonly pitLossSeconds: number;
  };
  readonly drivers: readonly {
    readonly id: string;
    readonly name: string;
    readonly dry: StrategyOrbitCalculationPaceV1;
    readonly wet: StrategyOrbitCalculationPaceV1;
    readonly eco: StrategyOrbitCalculationPaceV1;
  }[];
  readonly variants: readonly {
    readonly id: string;
    readonly mode: "dry" | "wet" | "eco";
    readonly order: readonly string[];
    readonly overrides: Readonly<Record<number, { readonly laps?: number; readonly fuel?: number }>>;
  }[];
  readonly activeVariantId: string;
  readonly planningInputs?: StrategyPlanningInputsV2;
  readonly weatherScenarios?: readonly StrategyWeightedWeatherScenarioV1[];
};

export type StrategyOrbitCalculationPaceV1 = {
  readonly paceSeconds: number;
  readonly fuelLitersPerLap: number;
};

export type StrategyOrbitCalculatedStintV1 = {
  readonly i: number;
  readonly d: string;
  readonly laps: number;
  readonly fuel: number;
  readonly pace: number;
  readonly start: number;
  readonly end: number;
  readonly lap0: number;
  readonly lap1: number;
  readonly pitWindowLap: number;
  readonly pitWindowSeconds: number;
  readonly over: boolean;
  readonly manual: boolean;
  readonly savingLevel: string;
  readonly fuelSavedPerLap: number;
  readonly savingCostSeconds: number;
};

export type StrategyOrbitCalculatedPlanV1 = {
  readonly stints: readonly StrategyOrbitCalculatedStintV1[];
  readonly totalLaps: number;
  readonly total: number;
  readonly stops: number;
  readonly maxLaps: number;
  readonly avgFuel: number;
  readonly avgPace: number;
  readonly distribution: readonly {
    readonly driverId: string;
    readonly laps: number;
    readonly seconds: number;
  }[];
  readonly drivingSeconds: number;
  readonly pitSeconds: number;
  readonly startFuelLiters: number;
  readonly finishFuelLiters: number;
  readonly reserveLaps: number;
  /** Margen exigido por producto y si el plan lo cumple (ISA-832). */
  readonly reserveRequiredLaps: number;
  readonly reserveSatisfied: boolean;
  readonly stopDetails: readonly {
    readonly index: number;
    readonly lap: number;
    readonly fuelInLiters: number;
    readonly fuelOutLiters: number;
    readonly pitLossSeconds: number;
    readonly pitTransitSeconds: number;
    readonly pitServiceSeconds: number;
    readonly pitOverlapSeconds: number;
    readonly pitBreakdownAvailable: boolean;
  }[];
  readonly savingApplied: boolean;
};

export type StrategyOrbitCalculationComparisonV1 = {
  readonly winnerId: string;
  readonly loserId: string;
  readonly winnerLaps: number;
  readonly loserLaps: number;
  readonly diff: number;
  readonly savedStops: number;
  readonly savedS: number;
  readonly costS: number;
  readonly totalDeltaSeconds: number;
  readonly pays: boolean;
  readonly sameStops: boolean;
  readonly stints: number;
  readonly driverCount: number;
  readonly doubles: readonly string[];
};

export type StrategyOrbitCalculationResultV1 = {
  readonly plans: Readonly<Record<string, StrategyOrbitCalculatedPlanV1>>;
  readonly comparisons: Readonly<Record<string, StrategyOrbitCalculationComparisonV1>>;
  readonly weather?: StrategyOrbitWeatherResultV1;
};

export type StrategyOrbitWeatherStintV1 = { readonly index: number; readonly laps: number; readonly compound?: string };
export type StrategyOrbitWeatherConditionV1 = { readonly lap: number; readonly rainChance: number; readonly bucket: "dry" | "humid" | "wet" };
export type StrategyOrbitWeatherResultV1 = {
  readonly plans: readonly {
    readonly scenarioId: string;
    readonly weight: number;
    readonly totalSeconds: number;
    readonly stops: number;
    readonly stints: readonly StrategyOrbitWeatherStintV1[];
    readonly timeline: readonly StrategyOrbitWeatherConditionV1[];
  }[];
  readonly robust: {
    readonly method: "minimax_regret";
    readonly maxRegretSeconds: number;
    readonly weightedExpectedLossSeconds: number;
    readonly stints: readonly StrategyOrbitWeatherStintV1[];
  };
};

export type StrategyBacktestIntervalV1 = {
  readonly count: number;
  readonly mean: number;
  readonly lower: number;
  readonly upper: number;
};

export type StrategyValidatedExamplesV1 = {
  readonly status: "available" | "no_combination" | "no_races";
  readonly combinationId?: string;
  readonly races: readonly {
    readonly raceId: string;
    readonly occurredAt: string;
    readonly predictedTotalSeconds: number;
    readonly observedTotalSeconds: number;
    readonly absoluteErrorSeconds: number;
    readonly absoluteErrorRatio: number;
    readonly stints: readonly {
      readonly stintNumber: number;
      readonly laps: number;
      readonly compoundRaw?: number;
      readonly predictedSeconds: number;
      readonly observedSeconds: number;
      readonly absoluteErrorSeconds: number;
      readonly absoluteErrorRatio: number;
    }[];
    readonly pitLaps: readonly number[];
  }[];
  readonly aggregate: {
    readonly raceCount: number;
    readonly totalErrorRatio: StrategyBacktestIntervalV1;
    readonly stintErrorRatio: StrategyBacktestIntervalV1;
  };
};

type CommandHeader<T extends StrategyApplicationOperation> = {
  protocolVersion: typeof STRATEGY_APPLICATION_PROTOCOL_V1;
  commandId: string;
  operation: T;
  expectedRepositoryVersion: number;
};

export type StrategyApplicationCommandV1<TPayload> =
  | (CommandHeader<"create"> & { draft: PlanDraftV1<TPayload> })
  | (CommandHeader<"open"> & { draftId: string })
  | (CommandHeader<"edit"> & { draft: PlanDraftV1<TPayload> })
  | (CommandHeader<"save_revision"> & {
      draft: PlanDraftV1<TPayload>;
      revisionId: string;
      createdAt: string;
    })
  | (CommandHeader<"duplicate"> & {
      sourceDraft: PlanDraftV1<TPayload>;
      targetDraftId: string;
      targetPlanId: string;
      targetVariantId: string;
      name: string;
      updatedAt: string;
    })
  | (CommandHeader<"activate"> & {
      revision: RevisionRefV1;
      activationId: string;
      activatedAt: string;
      current?: ActivePlanV1;
    })
  | (CommandHeader<"deactivate"> & {
      current?: ActivePlanV1;
      expectedActivationId: string;
    })
  | CommandHeader<"list">
  | (CommandHeader<"export"> & {
      plans: readonly StrategyPlanSelectorV1[];
      provenance: StrategyPackageProvenanceV1;
    })
  | (CommandHeader<"import"> & {
      /** The package bytes, base64-encoded, exactly as Go encodes []byte. */
      package: string;
      dryRun?: boolean;
    })
  | (CommandHeader<"create_event" | "edit_event"> & {
      event: StrategyEventV2;
      updatedAt: string;
    })
  | CommandHeader<"list_events">
  | CommandHeader<"list_session_combinations">
  | (CommandHeader<"get_event_planning_inputs"> & { eventId: string; generatedAt: string })
  | (CommandHeader<"get_validated_examples"> & { eventId: string })
  | CommandHeader<"list_reference_catalog" | "get_cold_start_status" | "import_cold_start_next" | "retry_cold_start_failures" | "reject_cold_start">
  | (CommandHeader<"create_driver" | "edit_driver"> & {
      eventId: string;
      driver: StrategyDriverV2;
      updatedAt: string;
    })
  | (CommandHeader<"delete_driver"> & {
      eventId: string;
      driverId: string;
      updatedAt: string;
    })
  | (CommandHeader<"list_drivers"> & { eventId: string })
  | (CommandHeader<"create_variant" | "edit_variant"> & {
      eventId: string;
      variant: StrategyVariantV2;
      updatedAt: string;
    })
  | (CommandHeader<"list_variants"> & { eventId: string })
  | (CommandHeader<"compare_variants"> & {
      eventId: string;
      leftVariantId: string;
      rightVariantId: string;
    })
  | (CommandHeader<"calculate_orbit"> & {
      input: StrategyOrbitCalculationInputV1;
    })
  | (CommandHeader<"preview_legacy_migration" | "migrate_legacy"> & {
      sources: readonly StrategyLegacyStorageSourceV1[];
      confirmedFingerprint?: string;
      migratedAt: string;
    })
  | (CommandHeader<"rollback_legacy_migration"> & {
      journalId: string;
      rolledBackAt: string;
    })
  | (CommandHeader<"restore"> & { draftId: string })
  | (CommandHeader<"close"> & {
      draft: PlanDraftV1<TPayload>;
      savedDraft: PlanDraftV1<TPayload>;
      discard: boolean;
    });

/**
 * One entry in "My plans". It carries no payload: the library identifies plans
 * so one can be chosen, and only then is that plan opened.
 */
export type StrategyPlanSummaryV1 = {
  readonly planId: string;
  readonly variantId: string;
  readonly draftId?: string;
  readonly name: string;
  readonly mode: string;
  readonly updatedAt: string;
  readonly hasDraft: boolean;
  readonly revisionCount: number;
  readonly latestRevision?: RevisionRefV1;
  readonly latestRevisionAt?: string;
};

/** Names one plan variant to export. */
export type StrategyPlanSelectorV1 = {
  readonly planId: string;
  readonly variantId: string;
  /** When present, export includes only this immutable revision and no draft. */
  readonly revision?: RevisionRefV1;
};

/**
 * Where a package came from. It is evidence for the person importing, never an
 * authorisation: nothing in it grants access to anything.
 */
export type StrategyPackageProvenanceV1 = {
  readonly application: string;
  readonly applicationVersion: string;
  readonly exportedAt: string;
  readonly note?: string;
};

/** What importing one plan variant would do. */
export type StrategyImportDispositionV1 =
  | "new"
  | "unchanged"
  | "adds_revisions"
  | "replaces_draft"
  | "conflict";

export type StrategyImportEntryV1 = {
  readonly planId: string;
  readonly variantId: string;
  readonly name: string;
  readonly mode: string;
  readonly disposition: StrategyImportDispositionV1;
  readonly hasDraft: boolean;
  readonly revisionCount: number;
  readonly newRevisions: number;
  readonly conflictingRevisions: readonly string[];
};

/** What an import would do, decided before anything is written. */
export type StrategyImportPreviewV1 = {
  readonly packageVersion: string;
  readonly contractVersion: string;
  readonly provenance: StrategyPackageProvenanceV1;
  readonly checksum: string;
  readonly entries: readonly StrategyImportEntryV1[];
  readonly importable: boolean;
};

export type StrategyApplicationResultV1<TPayload> = {
  readonly protocolVersion: typeof STRATEGY_APPLICATION_PROTOCOL_V1;
  readonly commandId: string;
  readonly repositoryVersion: number;
  readonly draft?: PlanDraftV1<TPayload>;
  readonly savedDraft?: PlanDraftV1<TPayload>;
  readonly revision?: PlanRevisionV1<TPayload>;
  readonly activePlan?: ActivePlanV1;
  readonly activations?: readonly ActivePlanV1[];
  readonly plans?: readonly StrategyPlanSummaryV1[];
  readonly strategyDocument?: StrategyDocumentV2;
  readonly events?: readonly StrategyEventV2[];
  readonly drivers?: readonly StrategyDriverV2[];
  readonly variants?: readonly StrategyVariantV2[];
  readonly comparison?: StrategyVariantComparisonV2;
  readonly orbitCalculation?: StrategyOrbitCalculationResultV1;
  readonly sessionCatalogStatus?: "available" | "no_authorized_telemetry";
  readonly sessionCombinations?: readonly StrategySessionCombinationV1[];
  readonly planningInputStatus?: "available" | "manual_only" | "no_included_sessions";
  readonly planningInputs?: StrategyPlanningInputsV2;
  readonly validatedExamples?: StrategyValidatedExamplesV1;
  readonly referenceCatalog?: StrategyReferenceCatalogResultV1;
  readonly coldStartStatus?: StrategyColdStartStatusV1;
  readonly coldStartProgress?: StrategyColdStartProgressV1;
  readonly legacyMigration?: StrategyLegacyMigrationPreviewV1;
  /** Exported package bytes, base64-encoded. Import returns none. */
  readonly package?: string;
  readonly preview?: StrategyImportPreviewV1;
  /** True only when an import actually wrote. Absent means nothing was written. */
  readonly imported?: boolean;
  readonly recoveredFromBackup: boolean;
  readonly closed: boolean;
};

export type StrategySessionClimateBucketV1 = {
  readonly bucket: "dry" | "humid" | "wet";
  readonly laps: number;
};

export type StrategySessionCatalogItemV1 = {
  readonly sessionId: string;
  readonly type: "practice" | "qualify" | "race";
  readonly status: "identified_usable" | "identified_not_usable";
  readonly defaultIncluded: boolean;
  readonly exclusionReason?: "no_completed_lap" | "session_type_not_race";
  readonly lastActivity: string;
  readonly climateBuckets: readonly StrategySessionClimateBucketV1[];
};

export type StrategySessionCombinationV1 = {
  readonly combinationId: string;
  readonly simId: string;
  readonly trackName: string;
  readonly trackLayout: string;
  readonly carName: string;
  readonly carClass: string;
  readonly sessionCount: number;
  readonly raceCount: number;
  readonly lastActivity: string;
  readonly climateBuckets: readonly StrategySessionClimateBucketV1[];
  readonly sessions: readonly StrategySessionCatalogItemV1[];
};

export type StrategyReferenceSampleV1 = {
  readonly semanticBundles: number;
  readonly contributors: number;
  readonly sessions: number;
};

export type StrategyReferenceProfileV1 = {
  readonly targetContractVersion: string;
  readonly provenance: { readonly kind: "reference"; readonly environment: string };
  readonly sample: StrategyReferenceSampleV1;
  readonly quality: { readonly validSessions: number; readonly invalidSessions: number; readonly sampleSessions: number; readonly validRatio: number };
  readonly fuel?: { readonly medianPerLap: number; readonly rangeLower: number; readonly rangeUpper: number; readonly sampleLaps: number };
  readonly virtualEnergy?: { readonly medianPerLap: number; readonly rangeLower: number; readonly rangeUpper: number; readonly sampleLaps: number };
  readonly pit?: { readonly count: number; readonly typicalDurationSeconds: number };
};

export type StrategyReferenceStrategyV1 = {
  readonly rank: number;
  readonly clusterDigest: string;
  readonly representative: { readonly stintCount: number; readonly pitLaps: readonly number[]; readonly compounds: readonly string[] };
  readonly provenance: { readonly kind: "reference"; readonly environment: string };
  readonly sample: StrategyReferenceSampleV1;
};

export type StrategyReferenceCatalogResultV1 = {
  readonly source: "candidate" | "cache" | "empty";
  readonly warning?: "invalid_signature" | "unknown_epoch" | "rollback" | "expired" | "schema_incompatible" | "unavailable";
  readonly catalog: {
    readonly contractVersion: string;
    readonly source: { readonly minimumCohort: number };
    readonly combinations: readonly {
      readonly combinationId: string;
      readonly referenceProfile?: StrategyReferenceProfileV1;
      readonly strategies: readonly StrategyReferenceStrategyV1[];
    }[];
  };
};

export type StrategyColdStartStatusV1 = {
  readonly shouldShow: boolean;
  readonly checking: boolean;
  readonly found: number;
  readonly imported: number;
  readonly skipped: number;
  readonly failures: readonly StrategyColdStartFailureV1[];
  readonly decision: "pending" | "accepted" | "rejected";
};

export type StrategyColdStartFailureV1 = { readonly locator: string; readonly reason: string };
export type StrategyColdStartProgressV1 = { readonly imported: number; readonly skipped: number; readonly total: number; readonly done: boolean; readonly failures: readonly StrategyColdStartFailureV1[] };

export type StrategyApplicationErrorCode =
  | "invalid_command"
  | "stale_command"
  | "draft_not_found"
  | "draft_conflict"
  | "revision_not_found"
  | "active_plan_conflict"
  | "unsaved_changes"
  | "plan_not_found"
  | "event_not_found"
  | "event_conflict"
  | "driver_not_found"
  | "driver_conflict"
  | "driver_in_use"
  | "variant_not_found"
  | "variant_conflict"
  | "legacy_migration_conflict"
  | "legacy_migration_not_found"
  | "calculation_invalid"
  | "calculation_infeasible"
  | "calculation_overflow"
  | "calculation_timeout"
  | "import_refused"
  // Refusals raised by the package format itself.
  | "invalid_package"
  | "unsupported_package_version"
  | "unsupported_contract_version"
  | "package_checksum_mismatch"
  | "invalid_package_provenance"
  | "empty_package"
  | "empty_plan_bundle"
  | "duplicate_package_document"
  | "misplaced_package_document"
  | "package_revision_conflict";

export class StrategyApplicationError extends Error {
  readonly code: StrategyApplicationErrorCode;
  readonly field: string;

  constructor(
    code: StrategyApplicationErrorCode,
    field: string,
    message: string,
  ) {
    super(message);
    this.name = "StrategyApplicationError";
    this.code = code;
    this.field = field;
  }
}

export interface StrategyApplicationClient<TPayload> {
  execute(
    command: StrategyApplicationCommandV1<TPayload>,
    options?: { readonly timeoutMs?: number },
  ): Promise<StrategyApplicationResultV1<TPayload>>;
  cancel(commandId: string): boolean;
  dispose(): void;
}

export type StrategyApplicationEventTransport = {
  emit(name: string, payload: unknown): void;
  on(name: string, listener: (payload: unknown) => void): () => void;
};

const COMMAND_EVENT = "strategy:application:command";
const RESULT_EVENT = "strategy:application:result";
const ERROR_EVENT = "strategy:application:error";
const DEFAULT_TIMEOUT_MS = 10_000;
const applicationErrorCodes = new Set<StrategyApplicationErrorCode>([
  "invalid_command",
  "stale_command",
  "draft_not_found",
  "draft_conflict",
  "revision_not_found",
  "active_plan_conflict",
  "unsaved_changes",
  "plan_not_found",
  "event_not_found",
  "event_conflict",
  "driver_not_found",
  "driver_conflict",
  "driver_in_use",
  "variant_not_found",
  "variant_conflict",
  "legacy_migration_conflict",
  "legacy_migration_not_found",
  "calculation_invalid",
  "calculation_infeasible",
  "calculation_overflow",
  "calculation_timeout",
  "import_refused",
  "invalid_package",
  "unsupported_package_version",
  "unsupported_contract_version",
  "package_checksum_mismatch",
  "invalid_package_provenance",
  "empty_package",
  "empty_plan_bundle",
  "duplicate_package_document",
  "misplaced_package_document",
  "package_revision_conflict",
]);

export function createStrategyApplicationClient<TPayload>(
  transport: StrategyApplicationEventTransport,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): StrategyApplicationClient<TPayload> {
  const pending = new Map<string, (error: Error) => void>();
  let disposed = false;

  const client: StrategyApplicationClient<TPayload> = {
    execute(command, options) {
      if (disposed) {
        return Promise.reject(new Error("Strategy application client is disposed"));
      }
      validateCommandHeader(command);
      if (pending.has(command.commandId)) {
        return Promise.reject(new Error("Strategy application command is already pending"));
      }
      return new Promise<StrategyApplicationResultV1<TPayload>>(
        (resolve, reject) => {
          const unsubs: Array<() => void> = [];
          let settled = false;
          const cleanup = () => {
            globalThis.clearTimeout(timeout);
            for (const unsubscribe of unsubs) unsubscribe();
            pending.delete(command.commandId);
          };
          const fail = (error: Error) => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(error);
          };
          const commandTimeoutMs = options?.timeoutMs ?? timeoutMs;
          const timeout = globalThis.setTimeout(() => {
            fail(new Error("Timeout waiting for Strategy application response"));
          }, commandTimeoutMs);

          try {
            unsubs.push(transport.on(RESULT_EVENT, (event) => {
              const payload = readEventPayload(event);
              if (payload.commandId !== command.commandId) return;
              void parseResult<TPayload>(payload).then(
                (result) => {
                  if (settled) return;
                  settled = true;
                  cleanup();
                  resolve(result);
                },
                (error) => {
                  fail(toError(error));
                },
              );
            }));
            unsubs.push(transport.on(ERROR_EVENT, (event) => {
              const payload = readEventPayload(event);
              if (payload.commandId !== command.commandId) return;
              fail(parseApplicationError(payload));
            }));
            pending.set(command.commandId, fail);
            transport.emit(COMMAND_EVENT, command);
          } catch (error) {
            fail(toError(error));
          }
        },
      );
    },
    cancel(commandId) {
      const fail = pending.get(commandId);
      if (!fail) return false;
      fail(new Error(`Strategy application command ${commandId} was cancelled`));
      return true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const fail of [...pending.values()]) {
        fail(new Error("Strategy application client was disposed"));
      }
    },
  };
  return client;
}

export function createWailsStrategyApplicationTransport(): StrategyApplicationEventTransport {
  return {
    emit(name, payload) {
      Events.Emit(name, payload);
    },
    on(name, listener) {
      return Events.On(name, (event) => listener(event));
    },
  };
}

function validateCommandHeader(command: StrategyApplicationCommandV1<unknown>): void {
  if (command.protocolVersion !== STRATEGY_APPLICATION_PROTOCOL_V1) {
    throw new Error("Unsupported Strategy application protocol");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(command.commandId)) {
    throw new Error("Invalid Strategy application command ID");
  }
  if (
    !Number.isSafeInteger(command.expectedRepositoryVersion) ||
    command.expectedRepositoryVersion < 0
  ) {
    throw new Error("Invalid Strategy repository version");
  }
}

async function parseResult<TPayload>(
  payload: Record<string, unknown>,
): Promise<StrategyApplicationResultV1<TPayload>> {
  if (payload.protocolVersion !== STRATEGY_APPLICATION_PROTOCOL_V1) {
    throw new Error("Unsupported Strategy application result protocol");
  }
  if (typeof payload.commandId !== "string" || payload.commandId === "") {
    throw new Error("Invalid Strategy application result command ID");
  }
  if (
    typeof payload.repositoryVersion !== "number" ||
    !Number.isSafeInteger(payload.repositoryVersion) ||
    payload.repositoryVersion < 0
  ) {
    throw new Error("Invalid Strategy application result repository version");
  }
  if (typeof payload.recoveredFromBackup !== "boolean") {
    throw new Error("Invalid Strategy application recovery state");
  }
  if (typeof payload.closed !== "boolean") {
    throw new Error("Invalid Strategy application close state");
  }
  const result: StrategyApplicationResultV1<TPayload> = {
    protocolVersion: STRATEGY_APPLICATION_PROTOCOL_V1,
    commandId: payload.commandId,
    repositoryVersion: payload.repositoryVersion,
    ...(payload.draft === undefined
      ? {}
      : { draft: parsePlanDraftV1<TPayload>(payload.draft) }),
    ...(payload.savedDraft === undefined
      ? {}
      : { savedDraft: parsePlanDraftV1<TPayload>(payload.savedDraft) }),
    ...(payload.revision === undefined
      ? {}
      : {
          revision: (await decodePlanRevisionV1(
            JSON.stringify(payload.revision),
          )) as PlanRevisionV1<TPayload>,
        }),
    ...(payload.activePlan === undefined
      ? {}
      : { activePlan: parseActivePlanV1(payload.activePlan) }),
    ...(payload.activations === undefined
      ? {}
      : { activations: parseActivePlans(payload.activations) }),
    ...(payload.plans === undefined ? {} : { plans: parsePlanSummaries(payload.plans) }),
    ...(payload.strategyDocument === undefined
      ? {}
      : { strategyDocument: parseStrategyDocumentV2(payload.strategyDocument) }),
    ...(payload.events === undefined
      ? {}
      : { events: parseStrategyEventsV2(payload.events, "events") }),
    ...(payload.drivers === undefined
      ? {}
      : { drivers: parseStrategyDriversV2(payload.drivers, "drivers") }),
    ...(payload.variants === undefined
      ? {}
      : { variants: parseStrategyVariantsV2(payload.variants, "variants") }),
    ...(payload.comparison === undefined
      ? {}
      : { comparison: parseStrategyVariantComparisonV2(payload.comparison) }),
    ...(payload.orbitCalculation === undefined
      ? {}
      : { orbitCalculation: parseStrategyOrbitCalculation(payload.orbitCalculation) }),
    ...(payload.sessionCatalogStatus === undefined
      ? {}
      : { sessionCatalogStatus: parseSessionCatalogStatus(payload.sessionCatalogStatus) }),
    ...(payload.sessionCombinations === undefined
      ? {}
      : { sessionCombinations: parseSessionCombinations(payload.sessionCombinations) }),
    ...(payload.planningInputStatus === undefined
      ? {}
      : { planningInputStatus: parsePlanningInputStatus(payload.planningInputStatus) }),
    ...(payload.planningInputs === undefined
      ? {}
      : { planningInputs: parsePlanningInputs(payload.planningInputs, "planningInputs") }),
    ...(payload.validatedExamples === undefined
      ? {}
      : { validatedExamples: parseValidatedExamples(payload.validatedExamples) }),
    ...(payload.referenceCatalog === undefined
      ? {}
      : { referenceCatalog: parseReferenceCatalog(payload.referenceCatalog) }),
    ...(payload.coldStartStatus === undefined
      ? {}
      : { coldStartStatus: parseColdStartStatus(payload.coldStartStatus) }),
    ...(payload.coldStartProgress === undefined
      ? {}
      : { coldStartProgress: parseColdStartProgress(payload.coldStartProgress) }),
    ...(payload.legacyMigration === undefined
      ? {}
      : { legacyMigration: parseLegacyMigrationPreview(payload.legacyMigration) }),
    ...(payload.package === undefined ? {} : { package: parsePackageBytes(payload.package) }),
    ...(payload.preview === undefined
      ? {}
      : { preview: parseImportPreview(payload.preview) }),
    imported: payload.imported === true,
    recoveredFromBackup: payload.recoveredFromBackup,
    closed: payload.closed,
  };
  return deepFreeze(result);
}

function parseActivePlans(value: unknown): readonly ActivePlanV1[] {
  if (!Array.isArray(value)) {
    throw new Error("Invalid Strategy activation list");
  }
  return value.map((activePlan) => parseActivePlanV1(activePlan));
}

function parseStrategyDocumentV2(value: unknown): StrategyDocumentV2 {
  const document = strategyRecord(value, "document");
  if (document.contractVersion !== "strategy.v2" || document.schemaVersion !== "2.0.0") {
    throw new Error("Unsupported Strategy document version");
  }
  strategyString(document.generatedAt, "document.generatedAt");
  const events = parseStrategyEventsV2(document.events, "document.events");
  if (document.activeEventId !== undefined) {
    strategyString(document.activeEventId, "document.activeEventId");
  }
  if (document.migrationMeta !== undefined) {
    const migration = strategyRecord(document.migrationMeta, "document.migrationMeta");
    strategyString(migration.sourceFingerprint, "document.migrationMeta.sourceFingerprint");
    strategyString(migration.journalId, "document.migrationMeta.journalId");
    strategyString(migration.migratedAt, "document.migrationMeta.migratedAt");
    strategyEnum(migration.status, "document.migrationMeta.status", ["backed_up", "committed", "rolled_back"]);
    parseLegacyStorageSources(migration.sources, "document.migrationMeta.sources");
    if (migration.quarantine !== undefined) parseLegacyQuarantine(migration.quarantine, "document.migrationMeta.quarantine");
    if (migration.warnings !== undefined && (!Array.isArray(migration.warnings) || migration.warnings.some((warning) => typeof warning !== "string"))) {
      throw new Error("Invalid Strategy document.migrationMeta.warnings");
    }
    if (migration.previousGeneratedAt !== undefined) strategyString(migration.previousGeneratedAt, "document.migrationMeta.previousGeneratedAt");
    if (migration.previousEvents !== undefined) parseStrategyEventsV2(migration.previousEvents, "document.migrationMeta.previousEvents");
    if (migration.previousActiveEventId !== undefined) strategyString(migration.previousActiveEventId, "document.migrationMeta.previousActiveEventId");
    if (migration.supersededJournals !== undefined) {
      if (!Array.isArray(migration.supersededJournals)) throw new Error("Invalid Strategy document.migrationMeta.supersededJournals");
      for (const [index, candidate] of migration.supersededJournals.entries()) {
        const journal = strategyRecord(candidate, `document.migrationMeta.supersededJournals.${index}`);
        strategyString(journal.sourceFingerprint, `document.migrationMeta.supersededJournals.${index}.sourceFingerprint`);
        strategyString(journal.journalId, `document.migrationMeta.supersededJournals.${index}.journalId`);
        strategyString(journal.backedUpAt, `document.migrationMeta.supersededJournals.${index}.backedUpAt`);
        parseLegacyStorageSources(journal.sources, `document.migrationMeta.supersededJournals.${index}.sources`);
      }
    }
  }
  if (document.migrationArchives !== undefined) {
    if (!Array.isArray(document.migrationArchives)) throw new Error("Invalid Strategy document.migrationArchives");
    for (const [index, candidate] of document.migrationArchives.entries()) {
      const archive = strategyRecord(candidate, `document.migrationArchives.${index}`);
      strategyString(archive.journalId, `document.migrationArchives.${index}.journalId`);
      strategyString(archive.archivedAt, `document.migrationArchives.${index}.archivedAt`);
      strategyString(archive.generatedAt, `document.migrationArchives.${index}.generatedAt`);
      parseStrategyEventsV2(archive.events, `document.migrationArchives.${index}.events`);
      if (archive.activeEventId !== undefined) strategyString(archive.activeEventId, `document.migrationArchives.${index}.activeEventId`);
    }
  }
  return { ...document, events } as StrategyDocumentV2;
}

function parseLegacyMigrationPreview(value: unknown): StrategyLegacyMigrationPreviewV1 {
  const preview = strategyRecord(value, "legacyMigration");
  strategyString(preview.fingerprint, "legacyMigration.fingerprint");
  strategyString(preview.journalId, "legacyMigration.journalId");
  const document = parseStrategyDocumentV2(preview.document);
  const quarantine = parseLegacyQuarantine(preview.quarantine, "legacyMigration.quarantine");
  if (!Array.isArray(preview.warnings) || preview.warnings.some((warning) => typeof warning !== "string")) {
    throw new Error("Invalid Strategy legacyMigration.warnings");
  }
  if (preview.activeEventId !== undefined) strategyString(preview.activeEventId, "legacyMigration.activeEventId");
  for (const field of ["imported", "alreadyImported", "rolledBack"] as const) {
    if (typeof preview[field] !== "boolean") throw new Error(`Invalid Strategy legacyMigration.${field}`);
  }
  return {
    fingerprint: preview.fingerprint as string,
    journalId: preview.journalId as string,
    document,
    quarantine,
    warnings: preview.warnings as string[],
    ...(preview.activeEventId === undefined ? {} : { activeEventId: preview.activeEventId as string }),
    imported: preview.imported as boolean,
    alreadyImported: preview.alreadyImported as boolean,
    rolledBack: preview.rolledBack as boolean,
  };
}

function parseLegacyStorageSources(value: unknown, field: string): readonly StrategyLegacyStorageSourceV1[] {
  if (!Array.isArray(value)) throw new Error(`Invalid Strategy ${field}`);
  return value.map((candidate, index) => {
    const source = strategyRecord(candidate, `${field}.${index}`);
    strategyString(source.key, `${field}.${index}.key`);
    if (typeof source.present !== "boolean" || typeof source.raw !== "string") throw new Error(`Invalid Strategy ${field}.${index}`);
    return { key: source.key as string, present: source.present, raw: source.raw };
  });
}

function parseLegacyQuarantine(value: unknown, field: string): readonly StrategyLegacyQuarantineItemV1[] {
  if (!Array.isArray(value)) throw new Error(`Invalid Strategy ${field}`);
  return value.map((candidate, index) => {
    const item = strategyRecord(candidate, `${field}.${index}`);
    for (const name of ["sourceKey", "path", "code", "message"] as const) strategyString(item[name], `${field}.${index}.${name}`);
    if (item.raw !== undefined && typeof item.raw !== "string") throw new Error(`Invalid Strategy ${field}.${index}.raw`);
    return item as StrategyLegacyQuarantineItemV1;
  });
}

function parseStrategyEventsV2(value: unknown, field: string): readonly StrategyEventV2[] {
  if (!Array.isArray(value)) throw new Error(`Invalid Strategy ${field}`);
  return value.map((candidate, index) => parseStrategyEventV2(candidate, `${field}.${index}`));
}

function parseStrategyEventV2(value: unknown, field: string): StrategyEventV2 {
  const event = strategyRecord(value, field);
  strategyString(event.id, `${field}.id`);
  strategyString(parseStrategySourcedV2(event.name, `${field}.name`), `${field}.name.value`);
  strategyEnum(parseStrategySourcedV2(event.source, `${field}.source`), `${field}.source.value`, ["custom", "series", "roster"]);
  strategyAnyString(parseStrategySourcedV2(event.track, `${field}.track`), `${field}.track.value`);
  strategyAnyString(parseStrategySourcedV2(event.cls, `${field}.cls`), `${field}.cls.value`);
  strategyInteger(parseStrategySourcedV2(event.durationMin, `${field}.durationMin`), `${field}.durationMin.value`);
  strategyNullableString(parseStrategySourcedV2(event.startAt, `${field}.startAt`), `${field}.startAt.value`);
  strategyNumber(parseStrategySourcedV2(event.tankLiters, `${field}.tankLiters`), `${field}.tankLiters.value`);
  strategyNumber(parseStrategySourcedV2(event.pitLossSeconds, `${field}.pitLossSeconds`), `${field}.pitLossSeconds.value`);
  strategyEnum(parseStrategySourcedV2(event.fillMode, `${field}.fillMode`), `${field}.fillMode.value`, ["manual"]);
  if (event.seriesId !== undefined) strategyString(parseStrategySourcedV2(event.seriesId, `${field}.seriesId`), `${field}.seriesId.value`);
  if (event.team !== undefined) strategyAnyString(parseStrategySourcedV2(event.team, `${field}.team`), `${field}.team.value`);
  if (event.teamMode !== undefined) strategyEnum(parseStrategySourcedV2(event.teamMode, `${field}.teamMode`), `${field}.teamMode.value`, ["solo", "team"]);
  if (event.lastOpenedAt !== undefined) strategyNullableString(parseStrategySourcedV2(event.lastOpenedAt, `${field}.lastOpenedAt`), `${field}.lastOpenedAt.value`);
  const drivers = parseStrategyDriversV2(event.drivers, `${field}.drivers`);
  const strategies = parseStrategyVariantsV2(event.strategies, `${field}.strategies`);
  const availability = strategyRecord(event.availability, `${field}.availability`);
  for (const [driverId, windows] of Object.entries(availability)) {
    if (!Array.isArray(windows)) throw new Error(`Invalid Strategy ${field}.availability.${driverId}`);
    for (const [index, window] of windows.entries()) {
      const entry = strategyRecord(window, `${field}.availability.${driverId}.${index}`);
      if (entry.state !== "ok" && entry.state !== "no") {
        throw new Error(`Invalid Strategy ${field}.availability.${driverId}.${index}.state`);
      }
      strategyInteger(entry.from, `${field}.availability.${driverId}.${index}.from`);
      strategyInteger(entry.to, `${field}.availability.${driverId}.${index}.to`);
    }
  }
  if (event.activeStrategyId !== undefined) strategyString(event.activeStrategyId, `${field}.activeStrategyId`);
  if (event.rawLegacy !== undefined) strategyString(event.rawLegacy, `${field}.rawLegacy`);
  if (event.combination !== undefined) {
    const combination = strategyRecord(event.combination, `${field}.combination`);
    strategyString(combination.combinationId, `${field}.combination.combinationId`);
    if (!Array.isArray(combination.sessions)) throw new Error(`Invalid Strategy ${field}.combination.sessions`);
    for (const [index, candidate] of combination.sessions.entries()) {
      const session = strategyRecord(candidate, `${field}.combination.sessions.${index}`);
      strategyString(session.sessionId, `${field}.combination.sessions.${index}.sessionId`);
      if (typeof session.included !== "boolean") throw new Error(`Invalid Strategy ${field}.combination.sessions.${index}.included`);
    }
  }
  if (event.planningInputs !== undefined) parsePlanningInputs(event.planningInputs, `${field}.planningInputs`);
  if (event.weatherScenarios !== undefined) parseWeatherScenarios(event.weatherScenarios, `${field}.weatherScenarios`);
  parseStrategyTyreInventoryV2(event.tyreInventory, `${field}.tyreInventory`);
  return { ...event, drivers, strategies, availability } as StrategyEventV2;
}

function parseWeatherScenarios(value: unknown, field: string): readonly StrategyWeightedWeatherScenarioV1[] {
  if (!Array.isArray(value)) throw new Error(`Invalid Strategy ${field}`);
  return value.map((candidate, index) => {
    const weighted = strategyRecord(candidate, `${field}.${index}`);
    strategyNumber(weighted.weight, `${field}.${index}.weight`);
    const scenario = strategyRecord(weighted.scenario, `${field}.${index}.scenario`);
    strategyEnum(scenario.contractVersion, `${field}.${index}.scenario.contractVersion`, ["weatherscenario.v1"]);
    for (const name of ["scenarioId", "combinationId", "generatedAt"] as const) strategyString(scenario[name], `${field}.${index}.scenario.${name}`);
    if (!Array.isArray(scenario.nodes) || scenario.nodes.length !== 5) throw new Error(`Invalid Strategy ${field}.${index}.scenario.nodes`);
    scenario.nodes.forEach((nodeCandidate, nodeIndex) => {
      const node = strategyRecord(nodeCandidate, `${field}.${index}.scenario.nodes.${nodeIndex}`);
      strategyEnum(node.progress, `${field}.${index}.scenario.nodes.${nodeIndex}.progress`, ["START", "25", "50", "75", "FINISH"]);
      strategyEnum(node.sky, `${field}.${index}.scenario.nodes.${nodeIndex}.sky`, ["clear", "light_clouds", "mostly_cloudy", "overcast", "partially_cloudy", "drizzle"]);
      for (const name of ["rainChance", "airTempC", "trackTempC"] as const) strategyNumber(node[name], `${field}.${index}.scenario.nodes.${nodeIndex}.${name}`);
    });
    const provenance = strategyRecord(scenario.provenance, `${field}.${index}.scenario.provenance`);
    for (const name of ["source", "capturedAt", "freshUntil", "sessionType", "signalFreshness"] as const) strategyString(provenance[name], `${field}.${index}.scenario.provenance.${name}`);
    return weighted as StrategyWeightedWeatherScenarioV1;
  });
}

function parsePlanningInputStatus(value: unknown): "available" | "manual_only" | "no_included_sessions" {
  strategyEnum(value, "planningInputStatus", ["available", "manual_only", "no_included_sessions"]);
  return value as "available" | "manual_only" | "no_included_sessions";
}

function parseValidatedExamples(value: unknown): StrategyValidatedExamplesV1 {
  const examples = strategyRecord(value, "validatedExamples");
  strategyEnum(examples.status, "validatedExamples.status", ["available", "no_combination", "no_races"]);
  if (examples.combinationId !== undefined) strategyString(examples.combinationId, "validatedExamples.combinationId");
  if (!Array.isArray(examples.races)) throw new Error("Invalid Strategy validatedExamples.races");
  examples.races.forEach((candidate, index) => {
    const field = `validatedExamples.races.${index}`;
    const race = strategyRecord(candidate, field);
    strategyString(race.raceId, `${field}.raceId`);
    strategyString(race.occurredAt, `${field}.occurredAt`);
    for (const name of ["predictedTotalSeconds", "observedTotalSeconds", "absoluteErrorSeconds", "absoluteErrorRatio"] as const) {
      strategyNumber(race[name], `${field}.${name}`);
    }
    if (!Array.isArray(race.pitLaps)) throw new Error(`Invalid Strategy ${field}.pitLaps`);
    race.pitLaps.forEach((lap, lapIndex) => strategyInteger(lap, `${field}.pitLaps.${lapIndex}`));
    if (!Array.isArray(race.stints)) throw new Error(`Invalid Strategy ${field}.stints`);
    race.stints.forEach((stintCandidate, stintIndex) => {
      const stintField = `${field}.stints.${stintIndex}`;
      const stint = strategyRecord(stintCandidate, stintField);
      strategyInteger(stint.stintNumber, `${stintField}.stintNumber`);
      strategyInteger(stint.laps, `${stintField}.laps`);
      if (stint.compoundRaw !== undefined) strategyInteger(stint.compoundRaw, `${stintField}.compoundRaw`);
      for (const name of ["predictedSeconds", "observedSeconds", "absoluteErrorSeconds", "absoluteErrorRatio"] as const) {
        strategyNumber(stint[name], `${stintField}.${name}`);
      }
    });
  });
  const aggregate = strategyRecord(examples.aggregate, "validatedExamples.aggregate");
  strategyInteger(aggregate.raceCount, "validatedExamples.aggregate.raceCount");
  for (const name of ["totalErrorRatio", "stintErrorRatio"] as const) {
    const interval = strategyRecord(aggregate[name], `validatedExamples.aggregate.${name}`);
    strategyInteger(interval.count, `validatedExamples.aggregate.${name}.count`);
    for (const metric of ["mean", "lower", "upper"] as const) {
      strategyNumber(interval[metric], `validatedExamples.aggregate.${name}.${metric}`);
    }
  }
  return examples as StrategyValidatedExamplesV1;
}

const planningInputFields: readonly StrategyPlanningInputFieldV2[] = [
  "fuel_per_lap_liters", "ve_per_lap_percent", "base_pace_seconds", "tank_liters",
  "pit_loss_seconds", "tyre_life_laps", "degradation_per_lap_seconds",
  "saving_fuel_per_lap", "saving_time_cost_per_lap",
];

function parsePlanningInputs(value: unknown, field: string): StrategyPlanningInputsV2 {
  const planning = strategyRecord(value, field);
  const overrides = strategyRecord(planning.overrides, `${field}.overrides`);
  for (const [name, candidate] of Object.entries(overrides)) {
    if (!planningInputFields.includes(name as StrategyPlanningInputFieldV2)) throw new Error(`Invalid Strategy ${field}.overrides.${name}`);
    const override = strategyRecord(candidate, `${field}.overrides.${name}`);
    strategyNumber(override.value, `${field}.overrides.${name}.value`);
    strategyEnum(override.presence, `${field}.overrides.${name}.presence`, ["valid"]);
    const provenance = strategyRecord(override.provenance, `${field}.overrides.${name}.provenance`);
    strategyEnum(provenance.kind, `${field}.overrides.${name}.provenance.kind`, ["manual", "reference"]);
    strategyString(provenance.sourceId, `${field}.overrides.${name}.provenance.sourceId`);
    parseProjectionConfidence(override.confidence, `${field}.overrides.${name}.confidence`);
  }
  const projection = planning.projection === undefined ? undefined : parseInputProjection(planning.projection, `${field}.projection`);
  return { ...(projection ? { projection } : {}), overrides: overrides as StrategyPlanningInputsV2["overrides"] };
}

function parseInputProjection(value: unknown, field: string): StrategyInputProjectionV2 {
  const projection = strategyRecord(value, field);
  strategyEnum(projection.contractVersion, `${field}.contractVersion`, ["strategyinputprojection.v2"]);
  for (const name of ["generatedAt", "computationVersion", "combinationId"] as const) strategyString(projection[name], `${field}.${name}`);
  if (!Array.isArray(projection.sourceSessions) || projection.sourceSessions.some((id) => typeof id !== "string" || id === "")) throw new Error(`Invalid Strategy ${field}.sourceSessions`);
  for (const name of ["fuelConsumption", "virtualEnergyConsumption"] as const) {
    const family = parseProjectionFamily(projection[name], `${field}.${name}`);
    for (const numeric of ["meanPerLap", "rangeLower", "rangeUpper"] as const) strategyNumber(family[numeric], `${field}.${name}.${numeric}`);
    if (family.byClimateBucket !== undefined) {
      const byBucket = strategyRecord(family.byClimateBucket, `${field}.${name}.byClimateBucket`);
      for (const [bucket, candidate] of Object.entries(byBucket)) {
        strategyEnum(bucket, `${field}.${name}.byClimateBucket bucket`, ["dry", "humid", "wet"]);
        strategyNumber(candidate, `${field}.${name}.byClimateBucket.${bucket}`);
      }
    }
  }
  if (projection.representativePaceByClimateBucket !== undefined) {
    const byBucket = strategyRecord(projection.representativePaceByClimateBucket, `${field}.representativePaceByClimateBucket`);
    for (const [bucket, candidate] of Object.entries(byBucket)) {
      strategyEnum(bucket, `${field}.representativePaceByClimateBucket bucket`, ["dry", "humid", "wet"]);
      const family = parseProjectionFamily(candidate, `${field}.representativePaceByClimateBucket.${bucket}`);
      strategyNumber(family.medianLapSeconds, `${field}.representativePaceByClimateBucket.${bucket}.medianLapSeconds`);
    }
  }
  if (projection.classPace !== undefined) {
    const classPace = parseProjectionFamily(projection.classPace, `${field}.classPace`);
    const provenance = strategyRecord(classPace.provenance, `${field}.classPace.provenance`);
    strategyEnum(provenance.kind, `${field}.classPace.provenance.kind`, ["reference"]);
    const byClassName = strategyRecord(classPace.byClassName, `${field}.classPace.byClassName`);
    for (const [className, paceSeconds] of Object.entries(byClassName)) {
      if (className.trim() === "") throw new Error(`Invalid Strategy ${field}.classPace.byClassName class`);
      strategyNumber(paceSeconds, `${field}.classPace.byClassName.${className}`);
      if (paceSeconds <= 0) throw new Error(`Invalid Strategy ${field}.classPace.byClassName.${className}`);
    }
    if (classPace.presence === "valid") {
      if (Object.keys(byClassName).length === 0 || classPace.reason !== undefined) {
        throw new Error(`Invalid Strategy ${field}.classPace`);
      }
    } else {
      strategyEnum(classPace.reason, `${field}.classPace.reason`, ["no_class_pace_source"]);
      if (Object.keys(byClassName).length !== 0) throw new Error(`Invalid Strategy ${field}.classPace.byClassName`);
    }
  }
  const pace = parseProjectionFamily(projection.combinedStintPaceCurve, `${field}.combinedStintPaceCurve`);
  strategyEnum(pace.identifiability, `${field}.combinedStintPaceCurve.identifiability`, ["combined_only", "separable"]);
  if (!Array.isArray(pace.points)) throw new Error(`Invalid Strategy ${field}.combinedStintPaceCurve.points`);
  const tyre = parseProjectionFamily(projection.tyreDegradation, `${field}.tyreDegradation`);
  for (const name of ["lifeLapsEstimate", "lifeLapsRangeLower", "lifeLapsRangeUpper"] as const) if (tyre[name] !== undefined) strategyNumber(tyre[name], `${field}.tyreDegradation.${name}`);
  parseProjectionFamily(projection.pit, `${field}.pit`);
  const saving = parseProjectionFamily(projection.savingCost, `${field}.savingCost`);
  if (saving.levels !== undefined && !Array.isArray(saving.levels)) throw new Error(`Invalid Strategy ${field}.savingCost.levels`);
  return projection as StrategyInputProjectionV2;
}

function parseProjectionFamily(value: unknown, field: string): Record<string, unknown> {
  const family = strategyRecord(value, field);
  strategyEnum(family.presence, `${field}.presence`, ["valid", "missing", "invalid", "stale", "unsupported", "unknown"]);
  const provenance = strategyRecord(family.provenance, `${field}.provenance`);
  strategyEnum(provenance.kind, `${field}.provenance.kind`, ["unknown", "observed", "corrected", "manual", "derived", "estimated", "range", "reference"]);
  if (provenance.sourceId !== undefined) strategyString(provenance.sourceId, `${field}.provenance.sourceId`);
  parseProjectionConfidence(family.confidence, `${field}.confidence`);
  if (family.reason !== undefined) strategyAnyString(family.reason, `${field}.reason`);
  return family;
}

function parseProjectionConfidence(value: unknown, field: string): void {
  const confidence = strategyRecord(value, field);
  strategyInteger(confidence.sampleSize, `${field}.sampleSize`);
  strategyString(confidence.computationVersion, `${field}.computationVersion`);
  for (const name of ["rangeLower", "rangeUpper", "variance"] as const) if (confidence[name] !== undefined) strategyNumber(confidence[name], `${field}.${name}`);
}

function parseSessionCombinations(value: unknown): readonly StrategySessionCombinationV1[] {
  if (!Array.isArray(value)) throw new Error("Invalid Strategy sessionCombinations");
  return value.map((candidate, index) => {
    const field = `sessionCombinations.${index}`;
    const combination = strategyRecord(candidate, field);
    for (const name of ["combinationId", "simId", "trackName", "trackLayout", "carName", "carClass", "lastActivity"] as const) {
      strategyString(combination[name], `${field}.${name}`);
    }
    strategyInteger(combination.sessionCount, `${field}.sessionCount`);
    strategyInteger(combination.raceCount, `${field}.raceCount`);
    const climateBuckets = parseSessionClimateBuckets(combination.climateBuckets, `${field}.climateBuckets`);
    if (!Array.isArray(combination.sessions)) throw new Error(`Invalid Strategy ${field}.sessions`);
    const sessions = combination.sessions.map((sessionCandidate, sessionIndex) => {
      const sessionField = `${field}.sessions.${sessionIndex}`;
      const session = strategyRecord(sessionCandidate, sessionField);
      strategyString(session.sessionId, `${sessionField}.sessionId`);
      strategyEnum(session.type, `${sessionField}.type`, ["practice", "qualify", "race"]);
      strategyEnum(session.status, `${sessionField}.status`, ["identified_usable", "identified_not_usable"]);
      if (typeof session.defaultIncluded !== "boolean") throw new Error(`Invalid Strategy ${sessionField}.defaultIncluded`);
      if (session.exclusionReason !== undefined) strategyEnum(session.exclusionReason, `${sessionField}.exclusionReason`, ["no_completed_lap", "session_type_not_race"]);
      strategyString(session.lastActivity, `${sessionField}.lastActivity`);
      return { ...session, climateBuckets: parseSessionClimateBuckets(session.climateBuckets, `${sessionField}.climateBuckets`) } as StrategySessionCatalogItemV1;
    });
    return {
      combinationId: combination.combinationId as string,
      simId: combination.simId as string,
      trackName: combination.trackName as string,
      trackLayout: combination.trackLayout as string,
      carName: combination.carName as string,
      carClass: combination.carClass as string,
      sessionCount: combination.sessionCount as number,
      raceCount: combination.raceCount as number,
      lastActivity: combination.lastActivity as string,
      climateBuckets,
      sessions,
    };
  });
}

function parseSessionCatalogStatus(value: unknown): "available" | "no_authorized_telemetry" {
  strategyEnum(value, "sessionCatalogStatus", ["available", "no_authorized_telemetry"]);
  return value as "available" | "no_authorized_telemetry";
}

function parseColdStartStatus(value: unknown): StrategyColdStartStatusV1 {
  const status = strategyRecord(value, "coldStartStatus");
  if (typeof status.shouldShow !== "boolean") throw new Error("Invalid Strategy coldStartStatus.shouldShow");
  if (typeof status.checking !== "boolean") throw new Error("Invalid Strategy coldStartStatus.checking");
  strategyInteger(status.found, "coldStartStatus.found");
  strategyInteger(status.imported, "coldStartStatus.imported");
  strategyInteger(status.skipped, "coldStartStatus.skipped");
  const failures = parseColdStartFailures(status.failures, "coldStartStatus.failures");
  strategyEnum(status.decision, "coldStartStatus.decision", ["pending", "accepted", "rejected"]);
  return { ...status, failures } as StrategyColdStartStatusV1;
}

function parseColdStartProgress(value: unknown): StrategyColdStartProgressV1 {
  const progress = strategyRecord(value, "coldStartProgress");
  strategyInteger(progress.imported, "coldStartProgress.imported");
  strategyInteger(progress.skipped, "coldStartProgress.skipped");
  strategyInteger(progress.total, "coldStartProgress.total");
  if (typeof progress.done !== "boolean") throw new Error("Invalid Strategy coldStartProgress.done");
  const failures = parseColdStartFailures(progress.failures, "coldStartProgress.failures");
  return { ...progress, failures } as StrategyColdStartProgressV1;
}

// Una lista ausente no es una lista malformada: cuando no queda ninguna sesion
// omitida el backend puede enviar el campo vacio o no enviarlo, y descartar la
// respuesta entera por eso hacia parecer roto un arranque en frio que estaba
// funcionando. Se normaliza siempre a un array para que la pantalla nunca
// reciba null donde su tipo promete una lista.
function parseColdStartFailures(value: unknown, field: string): readonly StrategyColdStartFailureV1[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error(`Invalid Strategy ${field}`);
  return value.map((entry, index) => {
    const failure = strategyRecord(entry, `${field}[${index}]`);
    if (typeof failure.locator !== "string" || failure.locator.length === 0) throw new Error(`Invalid Strategy ${field}[${index}].locator`);
    if (typeof failure.reason !== "string" || failure.reason.length === 0) throw new Error(`Invalid Strategy ${field}[${index}].reason`);
    return { locator: failure.locator, reason: failure.reason };
  });
}

function parseReferenceCatalog(value: unknown): StrategyReferenceCatalogResultV1 {
  const result = strategyRecord(value, "referenceCatalog");
  strategyEnum(result.source, "referenceCatalog.source", ["candidate", "cache", "empty"]);
  if (result.warning !== undefined) strategyEnum(result.warning, "referenceCatalog.warning", ["invalid_signature", "unknown_epoch", "rollback", "expired", "schema_incompatible", "unavailable"]);
  const catalog = strategyRecord(result.catalog, "referenceCatalog.catalog");
  if (result.source === "empty") {
    if (typeof catalog.contractVersion !== "string") throw new Error("Invalid Strategy referenceCatalog.catalog.contractVersion");
  } else {
    strategyString(catalog.contractVersion, "referenceCatalog.catalog.contractVersion");
  }
  const source = strategyRecord(catalog.source, "referenceCatalog.catalog.source");
  strategyInteger(source.minimumCohort, "referenceCatalog.catalog.source.minimumCohort");
  if (!Array.isArray(catalog.combinations)) throw new Error("Invalid Strategy referenceCatalog.catalog.combinations");
  for (const [index, candidate] of catalog.combinations.entries()) {
    const combination = strategyRecord(candidate, `referenceCatalog.catalog.combinations.${index}`);
    strategyString(combination.combinationId, `referenceCatalog.catalog.combinations.${index}.combinationId`);
    if (combination.referenceProfile !== undefined) parseReferenceItem(combination.referenceProfile, `referenceCatalog.catalog.combinations.${index}.referenceProfile`);
    if (!Array.isArray(combination.strategies)) throw new Error(`Invalid Strategy referenceCatalog.catalog.combinations.${index}.strategies`);
    combination.strategies.forEach((strategy, strategyIndex) => parseReferenceItem(strategy, `referenceCatalog.catalog.combinations.${index}.strategies.${strategyIndex}`));
  }
  return result as StrategyReferenceCatalogResultV1;
}

function parseReferenceItem(value: unknown, field: string): void {
  const item = strategyRecord(value, field);
  const provenance = strategyRecord(item.provenance, `${field}.provenance`);
  strategyEnum(provenance.kind, `${field}.provenance.kind`, ["reference"]);
  strategyString(provenance.environment, `${field}.provenance.environment`);
  const sample = strategyRecord(item.sample, `${field}.sample`);
  strategyInteger(sample.semanticBundles, `${field}.sample.semanticBundles`);
  strategyInteger(sample.contributors, `${field}.sample.contributors`);
  strategyInteger(sample.sessions, `${field}.sample.sessions`);
  if ((sample.contributors as number) < 3) throw new Error(`Invalid Strategy ${field}.sample.contributors`);
}

function parseSessionClimateBuckets(value: unknown, field: string): readonly StrategySessionClimateBucketV1[] {
  if (!Array.isArray(value)) throw new Error(`Invalid Strategy ${field}`);
  return value.map((candidate, index) => {
    const bucket = strategyRecord(candidate, `${field}.${index}`);
    strategyEnum(bucket.bucket, `${field}.${index}.bucket`, ["dry", "humid", "wet"]);
    strategyInteger(bucket.laps, `${field}.${index}.laps`);
    return bucket as StrategySessionClimateBucketV1;
  });
}

function parseStrategyDriversV2(value: unknown, field: string): readonly StrategyDriverV2[] {
  if (!Array.isArray(value)) throw new Error(`Invalid Strategy ${field}`);
  return value.map((candidate, index) => {
    const driver = strategyRecord(candidate, `${field}.${index}`);
    strategyString(driver.id, `${field}.${index}.id`);
    strategyInteger(driver.order, `${field}.${index}.order`);
    for (const optional of ["name", "ini", "color", "cls"] as const) {
      if (driver[optional] !== undefined) {
        strategyAnyString(parseStrategySourcedV2(driver[optional], `${field}.${index}.${optional}`), `${field}.${index}.${optional}.value`);
      }
    }
    if (driver.rawExtra !== undefined) strategyRecord(driver.rawExtra, `${field}.${index}.rawExtra`);
    return driver as StrategyDriverV2;
  });
}

function parseStrategyVariantsV2(value: unknown, field: string): readonly StrategyVariantV2[] {
  if (!Array.isArray(value)) throw new Error(`Invalid Strategy ${field}`);
  return value.map((candidate, index) => {
    const variant = strategyRecord(candidate, `${field}.${index}`);
    strategyString(variant.id, `${field}.${index}.id`);
    strategyString(parseStrategySourcedV2(variant.name, `${field}.${index}.name`), `${field}.${index}.name.value`);
    strategyAnyString(parseStrategySourcedV2(variant.note, `${field}.${index}.note`), `${field}.${index}.note.value`);
    strategyEnum(parseStrategySourcedV2(variant.mode, `${field}.${index}.mode`), `${field}.${index}.mode.value`, ["dry", "wet", "eco", "humid"]);
    strategyEnum(parseStrategySourcedV2(variant.state, `${field}.${index}.state`), `${field}.${index}.state.value`, ["draft", "ok"]);
    if (!Array.isArray(variant.order) || variant.order.some((driverId) => typeof driverId !== "string" || driverId === "")) {
      throw new Error(`Invalid Strategy ${field}.${index}.order`);
    }
    if (variant.overrides !== undefined) strategyRecord(variant.overrides, `${field}.${index}.overrides`);
    if (variant.tyres !== undefined) strategyRecord(variant.tyres, `${field}.${index}.tyres`);
    return variant as StrategyVariantV2;
  });
}

function parseStrategyVariantComparisonV2(value: unknown): StrategyVariantComparisonV2 {
  const comparison = strategyRecord(value, "comparison");
  strategyString(comparison.eventId, "comparison.eventId");
  const left = parseStrategyVariantsV2([comparison.left], "comparison.left")[0];
  const right = parseStrategyVariantsV2([comparison.right], "comparison.right")[0];
  if (!Array.isArray(comparison.differentFields) || comparison.differentFields.some((field) => typeof field !== "string")) {
    throw new Error("Invalid Strategy comparison.differentFields");
  }
  return { eventId: comparison.eventId as string, left, right, differentFields: comparison.differentFields as string[] };
}

function parseStrategyOrbitCalculation(value: unknown): StrategyOrbitCalculationResultV1 {
  const calculation = strategyRecord(value, "orbitCalculation");
  const rawPlans = strategyRecord(calculation.plans, "orbitCalculation.plans");
  const rawComparisons = strategyRecord(calculation.comparisons, "orbitCalculation.comparisons");
  const plans: Record<string, StrategyOrbitCalculatedPlanV1> = {};
  for (const [id, candidate] of Object.entries(rawPlans)) {
    const plan = strategyRecord(candidate, `orbitCalculation.plans.${id}`);
    for (const field of [
      "total", "avgFuel", "avgPace", "drivingSeconds", "pitSeconds",
      "startFuelLiters", "finishFuelLiters", "reserveLaps", "reserveRequiredLaps",
    ] as const) {
      strategyNumber(plan[field], `orbitCalculation.plans.${id}.${field}`);
    }
    for (const field of ["totalLaps", "stops", "maxLaps"] as const) {
      strategyInteger(plan[field], `orbitCalculation.plans.${id}.${field}`);
    }
    if (!Array.isArray(plan.stints) || !Array.isArray(plan.distribution) || !Array.isArray(plan.stopDetails)) {
      throw new Error(`Invalid Strategy orbitCalculation.plans.${id}`);
    }
    const stints = plan.stints.map((entry, index) => {
      const stint = strategyRecord(entry, `orbitCalculation.plans.${id}.stints.${index}`);
      strategyString(stint.d, `orbitCalculation.plans.${id}.stints.${index}.d`);
      strategyString(stint.savingLevel, `orbitCalculation.plans.${id}.stints.${index}.savingLevel`);
      for (const field of ["i", "laps", "lap0", "lap1", "pitWindowLap"] as const) {
        strategyInteger(stint[field], `orbitCalculation.plans.${id}.stints.${index}.${field}`);
      }
      for (const field of ["fuel", "pace", "start", "end", "pitWindowSeconds", "fuelSavedPerLap", "savingCostSeconds"] as const) {
        strategyNumber(stint[field], `orbitCalculation.plans.${id}.stints.${index}.${field}`);
      }
      if (typeof stint.over !== "boolean" || typeof stint.manual !== "boolean") {
        throw new Error(`Invalid Strategy orbitCalculation.plans.${id}.stints.${index}`);
      }
      return stint as StrategyOrbitCalculatedStintV1;
    });
    const distribution = plan.distribution.map((entry, index) => {
      const slice = strategyRecord(entry, `orbitCalculation.plans.${id}.distribution.${index}`);
      strategyString(slice.driverId, `orbitCalculation.plans.${id}.distribution.${index}.driverId`);
      strategyInteger(slice.laps, `orbitCalculation.plans.${id}.distribution.${index}.laps`);
      strategyNumber(slice.seconds, `orbitCalculation.plans.${id}.distribution.${index}.seconds`);
      return slice as StrategyOrbitCalculatedPlanV1["distribution"][number];
    });
    if (typeof plan.savingApplied !== "boolean") throw new Error(`Invalid Strategy orbitCalculation.plans.${id}.savingApplied`);
    const stopDetails = plan.stopDetails.map((entry, index) => {
      const stop = strategyRecord(entry, `orbitCalculation.plans.${id}.stopDetails.${index}`);
      for (const field of ["index", "lap"] as const) {
        strategyInteger(stop[field], `orbitCalculation.plans.${id}.stopDetails.${index}.${field}`);
      }
      for (const field of ["fuelInLiters", "fuelOutLiters", "pitLossSeconds", "pitTransitSeconds", "pitServiceSeconds", "pitOverlapSeconds"] as const) {
        strategyNumber(stop[field], `orbitCalculation.plans.${id}.stopDetails.${index}.${field}`);
      }
      if (typeof stop.pitBreakdownAvailable !== "boolean") throw new Error(`Invalid Strategy orbitCalculation.plans.${id}.stopDetails.${index}.pitBreakdownAvailable`);
      return stop as StrategyOrbitCalculatedPlanV1["stopDetails"][number];
    });
    plans[id] = {
      stints,
      distribution,
      totalLaps: plan.totalLaps as number,
      total: plan.total as number,
      stops: plan.stops as number,
      maxLaps: plan.maxLaps as number,
      avgFuel: plan.avgFuel as number,
      avgPace: plan.avgPace as number,
      drivingSeconds: plan.drivingSeconds as number,
      pitSeconds: plan.pitSeconds as number,
      startFuelLiters: plan.startFuelLiters as number,
      finishFuelLiters: plan.finishFuelLiters as number,
      reserveLaps: plan.reserveLaps as number,
      reserveRequiredLaps: plan.reserveRequiredLaps as number,
      reserveSatisfied: plan.reserveSatisfied === true,
      stopDetails,
      savingApplied: plan.savingApplied as boolean,
    };
  }
  const comparisons: Record<string, StrategyOrbitCalculationComparisonV1> = {};
  for (const [id, candidate] of Object.entries(rawComparisons)) {
    const comparison = strategyRecord(candidate, `orbitCalculation.comparisons.${id}`);
    strategyString(comparison.winnerId, `orbitCalculation.comparisons.${id}.winnerId`);
    strategyString(comparison.loserId, `orbitCalculation.comparisons.${id}.loserId`);
    for (const field of ["winnerLaps", "loserLaps", "diff", "savedStops", "stints", "driverCount"] as const) {
      strategyInteger(comparison[field], `orbitCalculation.comparisons.${id}.${field}`);
    }
    for (const field of ["savedS", "costS", "totalDeltaSeconds"] as const) {
      strategyNumber(comparison[field], `orbitCalculation.comparisons.${id}.${field}`);
    }
    if (typeof comparison.pays !== "boolean" || typeof comparison.sameStops !== "boolean") {
      throw new Error(`Invalid Strategy orbitCalculation.comparisons.${id}`);
    }
    if (!Array.isArray(comparison.doubles) || comparison.doubles.some((name) => typeof name !== "string")) {
      throw new Error(`Invalid Strategy orbitCalculation.comparisons.${id}.doubles`);
    }
    comparisons[id] = comparison as StrategyOrbitCalculationComparisonV1;
  }
  const weather = calculation.weather === undefined ? undefined : parseOrbitWeather(calculation.weather);
  return { plans, comparisons, ...(weather ? { weather } : {}) };
}

function parseOrbitWeather(value: unknown): StrategyOrbitWeatherResultV1 {
  const weather = strategyRecord(value, "orbitCalculation.weather");
  if (!Array.isArray(weather.plans)) throw new Error("Invalid Strategy orbitCalculation.weather.plans");
  const parseStints = (candidate: unknown, field: string): readonly StrategyOrbitWeatherStintV1[] => {
    if (!Array.isArray(candidate)) throw new Error(`Invalid Strategy ${field}`);
    return candidate.map((entry, index) => {
      const stint = strategyRecord(entry, `${field}.${index}`);
      strategyInteger(stint.index, `${field}.${index}.index`);
      strategyInteger(stint.laps, `${field}.${index}.laps`);
      if (stint.compound !== undefined) strategyString(stint.compound, `${field}.${index}.compound`);
      return stint as StrategyOrbitWeatherStintV1;
    });
  };
  const plans = weather.plans.map((candidate, index) => {
    const plan = strategyRecord(candidate, `orbitCalculation.weather.plans.${index}`);
    strategyString(plan.scenarioId, `orbitCalculation.weather.plans.${index}.scenarioId`);
    for (const name of ["weight", "totalSeconds"] as const) strategyNumber(plan[name], `orbitCalculation.weather.plans.${index}.${name}`);
    strategyInteger(plan.stops, `orbitCalculation.weather.plans.${index}.stops`);
    const stints = parseStints(plan.stints, `orbitCalculation.weather.plans.${index}.stints`);
    if (!Array.isArray(plan.timeline)) throw new Error(`Invalid Strategy orbitCalculation.weather.plans.${index}.timeline`);
    const timeline = plan.timeline.map((entry, conditionIndex) => {
      const condition = strategyRecord(entry, `orbitCalculation.weather.plans.${index}.timeline.${conditionIndex}`);
      strategyInteger(condition.lap, `orbitCalculation.weather.plans.${index}.timeline.${conditionIndex}.lap`);
      strategyNumber(condition.rainChance, `orbitCalculation.weather.plans.${index}.timeline.${conditionIndex}.rainChance`);
      strategyEnum(condition.bucket, `orbitCalculation.weather.plans.${index}.timeline.${conditionIndex}.bucket`, ["dry", "humid", "wet"]);
      return condition as StrategyOrbitWeatherConditionV1;
    });
    return {
      scenarioId: plan.scenarioId as string,
      weight: plan.weight as number,
      totalSeconds: plan.totalSeconds as number,
      stops: plan.stops as number,
      stints,
      timeline,
    };
  });
  const robust = strategyRecord(weather.robust, "orbitCalculation.weather.robust");
  strategyEnum(robust.method, "orbitCalculation.weather.robust.method", ["minimax_regret"]);
  strategyNumber(robust.maxRegretSeconds, "orbitCalculation.weather.robust.maxRegretSeconds");
  strategyNumber(robust.weightedExpectedLossSeconds, "orbitCalculation.weather.robust.weightedExpectedLossSeconds");
  return { plans, robust: { ...robust, stints: parseStints(robust.stints, "orbitCalculation.weather.robust.stints") } as StrategyOrbitWeatherResultV1["robust"] };
}

function parseStrategySourcedV2(value: unknown, field: string): unknown {
  const sourced = strategyRecord(value, field);
  if (!("value" in sourced)) throw new Error(`Invalid Strategy ${field}.value`);
  const evidence = strategyRecord(sourced.evidence, `${field}.evidence`);
  const provenance = strategyRecord(evidence.provenance, `${field}.evidence.provenance`);
  const confidence = strategyRecord(evidence.confidence, `${field}.evidence.confidence`);
  strategyEnum(provenance.kind, `${field}.evidence.provenance.kind`, ["unknown", "observed", "corrected", "manual", "derived", "estimated", "range", "reference", "legacy_synthetic_default"]);
  strategyEnum(confidence.level, `${field}.evidence.confidence.level`, ["unknown", "low", "medium", "high"]);
  if (provenance.sourceId !== undefined) strategyAnyString(provenance.sourceId, `${field}.evidence.provenance.sourceId`);
  if (provenance.observedAt !== undefined) strategyString(provenance.observedAt, `${field}.evidence.provenance.observedAt`);
  if (confidence.basis !== undefined) strategyAnyString(confidence.basis, `${field}.evidence.confidence.basis`);
  return sourced.value;
}

function parseStrategyTyreInventoryV2(value: unknown, field: string): void {
  const inventory = strategyRecord(value, field);
  if (!Array.isArray(inventory.sets)) throw new Error(`Invalid Strategy ${field}.sets`);
  for (const [index, candidate] of inventory.sets.entries()) {
    const set = strategyRecord(candidate, `${field}.sets.${index}`);
    strategyInteger(set.count, `${field}.sets.${index}.count`);
    strategyEnum(set.presence, `${field}.sets.${index}.presence`, ["valid", "missing", "invalid", "stale", "unsupported", "unknown"]);
    const provenance = strategyRecord(set.provenance, `${field}.sets.${index}.provenance`);
    strategyEnum(provenance.kind, `${field}.sets.${index}.provenance.kind`, ["unknown", "observed", "corrected", "manual", "derived", "estimated", "range", "reference", "legacy_synthetic_default"]);
  }
  if (inventory.byCompound !== undefined) strategyRecord(inventory.byCompound, `${field}.byCompound`);
}

function strategyRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Invalid Strategy ${field}`);
  }
  return value as Record<string, unknown>;
}

function strategyString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value === "") throw new Error(`Invalid Strategy ${field}`);
}

function strategyAnyString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string") throw new Error(`Invalid Strategy ${field}`);
}

function strategyNullableString(value: unknown, field: string): asserts value is string | null {
  if (value !== null && typeof value !== "string") throw new Error(`Invalid Strategy ${field}`);
}

function strategyNumber(value: unknown, field: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Invalid Strategy ${field}`);
}

function strategyEnum(value: unknown, field: string, allowed: readonly string[]): asserts value is string {
  if (typeof value !== "string" || !allowed.includes(value)) throw new Error(`Invalid Strategy ${field}`);
}

function strategyInteger(value: unknown, field: string): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new Error(`Invalid Strategy ${field}`);
}

/** A reference is only usable if it is complete: an incomplete one is rejected. */
function parseRevisionRef(value: unknown, field: string): RevisionRefV1 {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Invalid Strategy revision reference: ${field}`);
  }
  const entry = value as Record<string, unknown>;
  for (const key of ["planId", "variantId", "revisionId", "contentHash"]) {
    if (typeof entry[key] !== "string" || entry[key] === "") {
      throw new Error(`Invalid Strategy revision reference: ${field}.${key}`);
    }
  }
  return {
    planId: entry.planId as string,
    variantId: entry.variantId as string,
    revisionId: entry.revisionId as string,
    contentHash: entry.contentHash as string,
  };
}

function parsePlanSummaries(value: unknown): readonly StrategyPlanSummaryV1[] {
  if (!Array.isArray(value)) {
    throw new Error("Invalid Strategy plan list");
  }
  return value.map((raw, index) => {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      throw new Error(`Invalid Strategy plan summary ${index}`);
    }
    const entry = raw as Record<string, unknown>;
    for (const field of ["planId", "variantId", "name", "updatedAt"]) {
      if (typeof entry[field] !== "string" || entry[field] === "") {
        throw new Error(`Invalid Strategy plan summary ${index}: ${field}`);
      }
    }
    if (typeof entry.revisionCount !== "number" || !Number.isSafeInteger(entry.revisionCount)) {
      throw new Error(`Invalid Strategy plan summary ${index}: revisionCount`);
    }
    return {
      planId: entry.planId as string,
      variantId: entry.variantId as string,
      name: entry.name as string,
      mode: typeof entry.mode === "string" ? entry.mode : "",
      updatedAt: entry.updatedAt as string,
      hasDraft: entry.hasDraft === true,
      revisionCount: entry.revisionCount,
      ...(typeof entry.draftId === "string" ? { draftId: entry.draftId } : {}),
      ...(entry.latestRevision === undefined
        ? {}
        : { latestRevision: parseRevisionRef(entry.latestRevision, `plans.${index}.latestRevision`) }),
      ...(typeof entry.latestRevisionAt === "string"
        ? { latestRevisionAt: entry.latestRevisionAt }
        : {}),
    } satisfies StrategyPlanSummaryV1;
  });
}

/** Go encodes []byte as base64; a package that is not a string is not a package. */
function parsePackageBytes(value: unknown): string {
  if (typeof value !== "string" || value === "") {
    throw new Error("Invalid Strategy package bytes");
  }
  return value;
}

const importDispositions = new Set<StrategyImportDispositionV1>([
  "new",
  "unchanged",
  "adds_revisions",
  "replaces_draft",
  "conflict",
]);

/**
 * Parses what an import would do. An unrecognised disposition is refused rather
 * than shown as an unknown word: the interface must never present a change it
 * cannot explain.
 */
function parseImportPreview(value: unknown): StrategyImportPreviewV1 {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Invalid Strategy import preview");
  }
  const preview = value as Record<string, unknown>;
  if (typeof preview.checksum !== "string" || preview.checksum === "") {
    throw new Error("Invalid Strategy import preview: checksum");
  }
  if (!Array.isArray(preview.entries)) {
    throw new Error("Invalid Strategy import preview: entries");
  }
  return {
    packageVersion: typeof preview.packageVersion === "string" ? preview.packageVersion : "",
    contractVersion: typeof preview.contractVersion === "string" ? preview.contractVersion : "",
    provenance: parsePackageProvenance(preview.provenance),
    checksum: preview.checksum,
    entries: preview.entries.map((raw, index) => parseImportEntry(raw, index)),
    importable: preview.importable === true,
  };
}

function parsePackageProvenance(value: unknown): StrategyPackageProvenanceV1 {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Invalid Strategy package provenance");
  }
  const provenance = value as Record<string, unknown>;
  for (const field of ["application", "applicationVersion", "exportedAt"]) {
    if (typeof provenance[field] !== "string" || provenance[field] === "") {
      throw new Error(`Invalid Strategy package provenance: ${field}`);
    }
  }
  return {
    application: provenance.application as string,
    applicationVersion: provenance.applicationVersion as string,
    exportedAt: provenance.exportedAt as string,
    ...(typeof provenance.note === "string" ? { note: provenance.note } : {}),
  };
}

function parseImportEntry(value: unknown, index: number): StrategyImportEntryV1 {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Invalid Strategy import entry ${index}`);
  }
  const entry = value as Record<string, unknown>;
  for (const field of ["planId", "variantId"]) {
    if (typeof entry[field] !== "string" || entry[field] === "") {
      throw new Error(`Invalid Strategy import entry ${index}: ${field}`);
    }
  }
  if (
    typeof entry.disposition !== "string" ||
    !importDispositions.has(entry.disposition as StrategyImportDispositionV1)
  ) {
    throw new Error(`Invalid Strategy import entry ${index}: disposition`);
  }
  for (const field of ["revisionCount", "newRevisions"]) {
    if (typeof entry[field] !== "number" || !Number.isSafeInteger(entry[field])) {
      throw new Error(`Invalid Strategy import entry ${index}: ${field}`);
    }
  }
  return {
    planId: entry.planId as string,
    variantId: entry.variantId as string,
    name: typeof entry.name === "string" ? entry.name : "",
    mode: typeof entry.mode === "string" ? entry.mode : "",
    disposition: entry.disposition as StrategyImportDispositionV1,
    hasDraft: entry.hasDraft === true,
    revisionCount: entry.revisionCount as number,
    newRevisions: entry.newRevisions as number,
    conflictingRevisions: Array.isArray(entry.conflictingRevisions)
      ? entry.conflictingRevisions.filter((id): id is string => typeof id === "string")
      : [],
  };
}

function parseApplicationError(
  payload: Record<string, unknown>,
): StrategyApplicationError {
  if (
    typeof payload.code !== "string" ||
    !applicationErrorCodes.has(payload.code as StrategyApplicationErrorCode)
  ) {
    return new StrategyApplicationError(
      "invalid_command",
      "",
      "Invalid Strategy application error response",
    );
  }
  return new StrategyApplicationError(
    payload.code as StrategyApplicationErrorCode,
    typeof payload.field === "string" ? payload.field : "",
    typeof payload.message === "string" ? payload.message : payload.code,
  );
}

function readEventPayload(payload: unknown): Record<string, unknown> {
  const wrapped = payload as { data?: unknown };
  let value = wrapped?.data;
  if (Array.isArray(value)) value = value[0];
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const direct = payload as Record<string, unknown>;
    if (!("data" in direct)) return direct;
  }
  return {};
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}
