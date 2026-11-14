import type {
  CoreStatus,
  LauncherView,
  ResidentView,
} from "../contract/generated/contract";

export interface LauncherCompletion {
  instance: string;
  accountGeneration: string;
  run: string;
  profile: string;
  revision: string;
}

export function completionProfileName(
  item: LauncherCompletion,
  view?: LauncherView,
) {
  return view && !view.protected && view.revision === item.revision
    ? view.profiles.find((profile) => profile.id === item.profile)?.name
    : undefined;
}

export function notificationGeneration(
  core: CoreStatus | undefined,
): string | null {
  return core?.access.verified &&
    !core.access.blocked &&
    core.rights === "connected"
    ? core.accountGeneration
    : null;
}

/** One observed resident lifetime; no history replay or inferred success. */
export function launcherCompletionFeed(generation: () => string | null) {
  let scope: { instance: string; generation: string } | undefined;
  let cursor = 0n;
  let run: string | undefined;
  const reset = () => {
    scope = undefined;
    cursor = 0n;
    run = undefined;
  };
  return {
    reset,
    observe(view: ResidentView): LauncherCompletion[] {
      const execution = view.execution;
      const account = generation();
      if (!view.online || view.protected || !execution || !account) {
        reset();
        return [];
      }
      const current = {
        instance: execution.instance,
        generation: account,
      };
      const active =
        execution.active?.accountGeneration === current.generation
          ? execution.active.run
          : undefined;
      const last = BigInt(execution.events.at(-1)?.seq ?? "0");
      if (
        scope?.instance !== current.instance ||
        scope.generation !== current.generation ||
        last < cursor
      ) {
        scope = current;
        cursor = last;
        run = active;
        return [];
      }
      const fresh = execution.events.filter(
        (item) => BigInt(item.seq) > cursor,
      );
      if (
        BigInt(execution.firstRetainedSeq) > cursor + 1n ||
        fresh.some(
          (item, index) => BigInt(item.seq) !== cursor + BigInt(index) + 1n,
        )
      ) {
        // A gap cannot confirm an earlier run. Establish a new baseline only.
        cursor = last;
        run = undefined;
        return [];
      }
      const completed: LauncherCompletion[] = [];
      for (const item of fresh) {
        const event = item.kind;
        if (
          (event.kind === "received" || event.kind === "order-received") &&
          event.receipt.kind === "accepted"
        )
          run = event.receipt.run;
        if (event.kind === "started") run = event.run;
        if (event.kind !== "finished" || event.run !== run) continue;
        run = undefined;
        const result = execution.results;
        if (
          event.outcome.kind === "completed" &&
          result.kind === "known" &&
          result.value.run === event.run &&
          result.value.accountGeneration === current.generation &&
          result.value.mode === "profile" &&
          result.value.outcome?.kind === "completed"
        )
          completed.push({
            instance: current.instance,
            accountGeneration: current.generation,
            run: event.run,
            profile: result.value.profile,
            revision: result.value.revision,
          });
      }
      cursor = last;
      return completed;
    },
  };
}
