import {
  createStrategyApplicationClient,
  createWailsStrategyApplicationTransport,
  StrategyApplicationError,
  type StrategyApplicationClient,
} from "./strategy-application-client";
import { canonicalStrategyTimestamp, type PlanDraftV1 } from "./strategy-contract-v1";
import {
  createDefaultStrategyEditorDocument,
  type StrategyEditorDocument,
} from "./strategy-editor";
import { createStrategyStore, type StrategyStore } from "./strategy-store";

export const STRATEGY_EDITOR_DRAFT_ID = "strategy-default-draft";

export type StrategyEditorRuntime = {
  readonly store: StrategyStore<StrategyEditorDocument>;
  readonly client: StrategyApplicationClient<StrategyEditorDocument>;
  dispose(): void;
};

export function createStrategyEditorDraft(
  now = canonicalStrategyTimestamp(),
): PlanDraftV1<StrategyEditorDocument> {
  return {
    contractVersion: "strategy.v1",
    draftId: STRATEGY_EDITOR_DRAFT_ID,
    planId: "strategy-default-plan",
    variantId: "strategy-default-variant",
    name: "6h Spa · Hypercar",
    mode: "manual",
    capabilities: ["manual_inputs"],
    provenance: { kind: "manual", sourceId: "strategy-editor" },
    confidence: { level: "high", basis: "manual editor" },
    updatedAt: now,
    payload: createDefaultStrategyEditorDocument(),
  };
}

export function createWailsStrategyEditorRuntime(): StrategyEditorRuntime {
  const client = createStrategyApplicationClient<StrategyEditorDocument>(
    createWailsStrategyApplicationTransport(),
  );
  return createStrategyEditorRuntime(client);
}

export function createStrategyEditorRuntime(
  client: StrategyApplicationClient<StrategyEditorDocument>,
): StrategyEditorRuntime {
  return {
    store: createStrategyStore(client),
    // Exposed so the library read model can query through the same service the
    // editor writes through, rather than opening a second door to the data.
    client,
    dispose: () => client.dispose(),
  };
}

export async function openOrCreateStrategyEditor(
  store: StrategyStore<StrategyEditorDocument>,
  now = canonicalStrategyTimestamp(),
): Promise<void> {
  try {
    await store.open(STRATEGY_EDITOR_DRAFT_ID);
  } catch (error) {
    if (!(error instanceof StrategyApplicationError) || error.code !== "draft_not_found") {
      throw error;
    }
    await store.create(createStrategyEditorDraft(now));
  }
}
