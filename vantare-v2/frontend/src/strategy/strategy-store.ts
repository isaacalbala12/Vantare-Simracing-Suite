import {
  parsePlanDraftV1,
  parseStrategyExecutionStateV1,
  type ActivePlanV1,
  type PlanDraftV1,
  type RevisionRefV1,
  type StrategyExecutionStateV1,
} from "./strategy-contract-v1";
import {
  STRATEGY_APPLICATION_PROTOCOL_V1,
  type StrategyApplicationClient,
  type StrategyApplicationCommandV1,
  type StrategyApplicationResultV1,
} from "./strategy-application-client";

type History<TPayload> = {
  saved: PlanDraftV1<TPayload>;
  present: PlanDraftV1<TPayload>;
  past: Array<PlanDraftV1<TPayload>>;
  future: Array<PlanDraftV1<TPayload>>;
};

export type StrategyStoreSnapshot<TPayload> = {
  readonly repositoryVersion: number;
  readonly draft?: PlanDraftV1<TPayload>;
  readonly savedDraft?: PlanDraftV1<TPayload>;
  readonly activePlan?: ActivePlanV1;
  readonly execution?: StrategyExecutionStateV1;
  readonly dirty: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly busy: boolean;
  readonly recoveredFromBackup: boolean;
};

export type StrategyStoreOptions = {
  id?: () => string;
  now?: () => string;
  historyLimit?: number;
};

export interface StrategyStore<TPayload> {
  getSnapshot(): StrategyStoreSnapshot<TPayload>;
  subscribe(listener: () => void): () => void;
  create(draft: PlanDraftV1<TPayload>): Promise<void>;
  open(draftId: string): Promise<void>;
  edit(
    change: (draft: PlanDraftV1<TPayload>) => PlanDraftV1<TPayload>,
  ): void;
  save(): Promise<void>;
  duplicate(input: {
    targetDraftId: string;
    targetPlanId: string;
    targetVariantId: string;
    name: string;
  }): Promise<void>;
  activate(revision: RevisionRefV1): Promise<void>;
  deactivate(): Promise<void>;
  restore(): Promise<void>;
  close(discard: boolean): Promise<boolean>;
  undo(): void;
  redo(): void;
  observeExecution(execution: StrategyExecutionStateV1): void;
}

const DEFAULT_HISTORY_LIMIT = 100;

export function createStrategyStore<TPayload>(
  client: StrategyApplicationClient<TPayload>,
  options: StrategyStoreOptions = {},
): StrategyStore<TPayload> {
  const id = options.id ?? defaultID;
  const now = options.now ?? (() => new Date().toISOString());
  const historyLimit = options.historyLimit ?? DEFAULT_HISTORY_LIMIT;
  if (!Number.isSafeInteger(historyLimit) || historyLimit < 1) {
    throw new Error("Strategy history limit must be a positive integer");
  }

  let history: History<TPayload> | undefined;
  let repositoryVersion = 0;
  let activePlan: ActivePlanV1 | undefined;
  let execution: StrategyExecutionStateV1 | undefined;
  let recoveredFromBackup = false;
  let busy = false;
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const listener of listeners) listener();
  };

  const execute = async (
    command: StrategyApplicationCommandV1<TPayload>,
  ): Promise<StrategyApplicationResultV1<TPayload>> => {
    if (busy) throw new Error("Strategy application operation already in progress");
    busy = true;
    notify();
    try {
      return await client.execute(command);
    } finally {
      busy = false;
      notify();
    }
  };

  const loadResult = (result: StrategyApplicationResultV1<TPayload>): void => {
    if (!result.draft || !result.savedDraft) {
      throw new Error("Strategy application result did not include a draft");
    }
    const saved = cloneDraft(result.savedDraft);
    const present = cloneDraft(result.draft);
    history = { saved, present, past: [], future: [] };
    repositoryVersion = result.repositoryVersion;
    recoveredFromBackup = result.recoveredFromBackup;
    if (result.activePlan) activePlan = structuredClone(result.activePlan);
    notify();
  };

  const header = <T extends StrategyApplicationCommandV1<TPayload>["operation"]>(
    operation: T,
  ) => ({
    protocolVersion: STRATEGY_APPLICATION_PROTOCOL_V1,
    commandId: id(),
    operation,
    expectedRepositoryVersion: repositoryVersion,
  });

  const store: StrategyStore<TPayload> = {
    getSnapshot() {
      const snapshot: StrategyStoreSnapshot<TPayload> = {
        repositoryVersion,
        ...(history
          ? {
              draft: cloneDraft(history.present),
              savedDraft: cloneDraft(history.saved),
            }
          : {}),
        ...(activePlan ? { activePlan: structuredClone(activePlan) } : {}),
        ...(execution ? { execution: structuredClone(execution) } : {}),
        dirty: history ? !structuralEqual(history.present, history.saved) : false,
        canUndo: (history?.past.length ?? 0) > 0,
        canRedo: (history?.future.length ?? 0) > 0,
        busy,
        recoveredFromBackup,
      };
      return deepFreeze(snapshot);
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async create(draft) {
      const result = await execute({
        ...header("create"),
        draft: cloneDraft(draft),
      });
      loadResult(result);
    },

    async open(draftId) {
      const result = await execute({ ...header("open"), draftId });
      loadResult(result);
    },

    edit(change) {
      if (!history) throw new Error("No Strategy draft is open");
      const candidate = cloneDraft(
        parsePlanDraftV1<TPayload>(change(cloneDraft(history.present))),
      );
      if (structuralEqual(candidate, history.present)) return;
      history.past.push(cloneDraft(history.present));
      if (history.past.length > historyLimit) history.past.shift();
      history.present = candidate;
      history.future = [];
      notify();
    },

    async save() {
      if (!history) throw new Error("No Strategy draft is open");
      if (structuralEqual(history.present, history.saved)) return;
      const commandId = id();
      const result = await execute({
        protocolVersion: STRATEGY_APPLICATION_PROTOCOL_V1,
        commandId,
        operation: "save_revision",
        expectedRepositoryVersion: repositoryVersion,
        draft: cloneDraft(history.present),
        revisionId: `${commandId}:revision`,
        createdAt: now(),
      });
      if (!result.draft || !result.savedDraft) {
        throw new Error("Strategy save result did not include a draft");
      }
      history.present = cloneDraft(result.draft);
      history.saved = cloneDraft(result.savedDraft);
      repositoryVersion = result.repositoryVersion;
      recoveredFromBackup = result.recoveredFromBackup;
      notify();
    },

    async duplicate(input) {
      if (!history) throw new Error("No Strategy draft is open");
      const result = await execute({
        ...header("duplicate"),
        sourceDraft: cloneDraft(history.present),
        ...input,
        updatedAt: now(),
      });
      loadResult(result);
    },

    async activate(revision) {
      const result = await execute({
        ...header("activate"),
        revision: structuredClone(revision),
        activationId: `${id()}:activation`,
        activatedAt: now(),
        ...(activePlan ? { current: structuredClone(activePlan) } : {}),
      });
      if (!result.activePlan) {
        throw new Error("Strategy activation result did not include an active plan");
      }
      activePlan = structuredClone(result.activePlan);
      repositoryVersion = result.repositoryVersion;
      notify();
    },

    async deactivate() {
      const current = activePlan ? structuredClone(activePlan) : undefined;
      const result = await execute({
        ...header("deactivate"),
        ...(current ? { current } : {}),
        expectedActivationId: current?.activationId ?? "none",
      });
      activePlan = result.activePlan
        ? structuredClone(result.activePlan)
        : undefined;
      repositoryVersion = result.repositoryVersion;
      notify();
    },

    async restore() {
      if (!history) throw new Error("No Strategy draft is open");
      const result = await execute({
        ...header("restore"),
        draftId: history.present.draftId,
      });
      loadResult(result);
    },

    async close(discard) {
      if (!history) return true;
      const dirty = !structuralEqual(history.present, history.saved);
      if (dirty && !discard) {
        throw new Error("Strategy draft has unsaved changes");
      }
      const result = await execute({
        ...header("close"),
        draft: cloneDraft(history.present),
        savedDraft: cloneDraft(history.saved),
        discard,
      });
      if (!result.closed) return false;
      history = undefined;
      recoveredFromBackup = false;
      notify();
      return true;
    },

    undo() {
      if (!history || history.past.length === 0) return;
      history.future.unshift(cloneDraft(history.present));
      history.present = history.past.pop() as PlanDraftV1<TPayload>;
      notify();
    },

    redo() {
      if (!history || history.future.length === 0) return;
      history.past.push(cloneDraft(history.present));
      if (history.past.length > historyLimit) history.past.shift();
      history.present = history.future.shift() as PlanDraftV1<TPayload>;
      notify();
    },

    observeExecution(nextExecution) {
      execution = structuredClone(
        parseStrategyExecutionStateV1(nextExecution),
      );
      notify();
    },
  };

  return store;
}

function cloneDraft<TPayload>(
  draft: PlanDraftV1<TPayload>,
): PlanDraftV1<TPayload> {
  return structuredClone(parsePlanDraftV1<TPayload>(draft));
}

function structuralEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== typeof right || left === null || right === null) {
    return false;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }
    return left.every((value, index) => structuralEqual(value, right[index]));
  }
  if (typeof left !== "object" || typeof right !== "object") return false;
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  if (!leftKeys.every((key, index) => key === rightKeys[index])) return false;
  return leftKeys.every((key) => structuralEqual(leftRecord[key], rightRecord[key]));
}

function defaultID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `strategy-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
