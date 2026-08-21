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
  readonly pays: boolean;
  readonly sameStops: boolean;
  readonly stints: number;
  readonly driverCount: number;
  readonly doubles: readonly string[];
};

export type StrategyOrbitCalculationResultV1 = {
  readonly plans: Readonly<Record<string, StrategyOrbitCalculatedPlanV1>>;
  readonly comparisons: Readonly<Record<string, StrategyOrbitCalculationComparisonV1>>;
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
  readonly legacyMigration?: StrategyLegacyMigrationPreviewV1;
  /** Exported package bytes, base64-encoded. Import returns none. */
  readonly package?: string;
  readonly preview?: StrategyImportPreviewV1;
  /** True only when an import actually wrote. Absent means nothing was written. */
  readonly imported?: boolean;
  readonly recoveredFromBackup: boolean;
  readonly closed: boolean;
};

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
    execute(command) {
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
          const timeout = globalThis.setTimeout(() => {
            fail(new Error("Timeout waiting for Strategy application response"));
          }, timeoutMs);

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
  parseStrategyTyreInventoryV2(event.tyreInventory, `${field}.tyreInventory`);
  return { ...event, drivers, strategies, availability } as StrategyEventV2;
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
    for (const field of ["total", "avgFuel", "avgPace"] as const) {
      strategyNumber(plan[field], `orbitCalculation.plans.${id}.${field}`);
    }
    for (const field of ["totalLaps", "stops", "maxLaps"] as const) {
      strategyInteger(plan[field], `orbitCalculation.plans.${id}.${field}`);
    }
    if (!Array.isArray(plan.stints) || !Array.isArray(plan.distribution)) {
      throw new Error(`Invalid Strategy orbitCalculation.plans.${id}`);
    }
    const stints = plan.stints.map((entry, index) => {
      const stint = strategyRecord(entry, `orbitCalculation.plans.${id}.stints.${index}`);
      strategyString(stint.d, `orbitCalculation.plans.${id}.stints.${index}.d`);
      for (const field of ["i", "laps", "lap0", "lap1", "pitWindowLap"] as const) {
        strategyInteger(stint[field], `orbitCalculation.plans.${id}.stints.${index}.${field}`);
      }
      for (const field of ["fuel", "pace", "start", "end", "pitWindowSeconds"] as const) {
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
    plans[id] = {
      stints,
      distribution,
      totalLaps: plan.totalLaps as number,
      total: plan.total as number,
      stops: plan.stops as number,
      maxLaps: plan.maxLaps as number,
      avgFuel: plan.avgFuel as number,
      avgPace: plan.avgPace as number,
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
    for (const field of ["savedS", "costS"] as const) {
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
  return { plans, comparisons };
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
