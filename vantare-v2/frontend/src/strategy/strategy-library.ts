import {
  STRATEGY_APPLICATION_PROTOCOL_V1,
  type StrategyApplicationClient,
  type StrategyPlanSummaryV1,
} from "./strategy-application-client";

/**
 * The read model behind "My plans".
 *
 * Listing goes through the application service, which owns the repository. This
 * module never touches the filesystem and never reimplements atomicity,
 * migration, backup or deletion: it asks for the library and shapes the answer
 * for a person to search.
 *
 * Plans are private. Nothing here sends anything anywhere.
 */

export type StrategyLibraryEntry = StrategyPlanSummaryV1;

export type StrategyLibrary = {
  readonly repositoryVersion: number;
  readonly plans: readonly StrategyLibraryEntry[];
  readonly recoveredFromBackup: boolean;
};

export type StrategyLibrarySort = "recent" | "name";

export type StrategyLibraryFilter = {
  /** Free text matched against the plan name and its identifiers. */
  readonly query?: string;
  /** Only plans with work open that has not been saved as a revision. */
  readonly onlyUnsaved?: boolean;
  /** Only plans that have at least one saved revision. */
  readonly onlySaved?: boolean;
};

export async function loadStrategyLibrary<TPayload>(
  client: StrategyApplicationClient<TPayload>,
  commandId: string,
): Promise<StrategyLibrary> {
  const result = await client.execute({
    protocolVersion: STRATEGY_APPLICATION_PROTOCOL_V1,
    commandId,
    operation: "list",
    // Listing reads; it has no version to guard against.
    expectedRepositoryVersion: 0,
  });
  return {
    repositoryVersion: result.repositoryVersion,
    plans: result.plans ?? [],
    recoveredFromBackup: result.recoveredFromBackup,
  };
}

/**
 * Narrows the library. Matching is accent- and case-insensitive so searching
 * "spa" finds "6h Spa" and searching "le mans" finds "Le Máns".
 */
export function filterPlans(
  plans: readonly StrategyLibraryEntry[],
  filter: StrategyLibraryFilter,
): readonly StrategyLibraryEntry[] {
  const needle = normalise(filter.query ?? "");
  return plans.filter((plan) => {
    if (filter.onlyUnsaved && !plan.hasDraft) return false;
    if (filter.onlySaved && plan.revisionCount === 0) return false;
    if (needle === "") return true;
    return normalise(`${plan.name} ${plan.planId} ${plan.variantId}`).includes(needle);
  });
}

/**
 * Orders the library without mutating it. Ties break on identity so the same
 * library always presents in the same order.
 */
export function sortPlans(
  plans: readonly StrategyLibraryEntry[],
  sort: StrategyLibrarySort,
): readonly StrategyLibraryEntry[] {
  return [...plans].sort((left, right) => {
    if (sort === "name") {
      const byName = normalise(left.name).localeCompare(normalise(right.name));
      if (byName !== 0) return byName;
    } else if (left.updatedAt !== right.updatedAt) {
      return left.updatedAt < right.updatedAt ? 1 : -1;
    }
    if (left.planId !== right.planId) return left.planId < right.planId ? -1 : 1;
    return left.variantId < right.variantId ? -1 : left.variantId > right.variantId ? 1 : 0;
  });
}

/** Describes a plan's state in one phrase, without inventing anything. */
export function describePlan(plan: StrategyLibraryEntry): string {
  const parts: string[] = [];
  parts.push(plan.revisionCount === 1 ? "1 revisión" : `${plan.revisionCount} revisiones`);
  if (plan.hasDraft) parts.push("con cambios abiertos");
  return parts.join(" · ");
}

function normalise(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase();
}
