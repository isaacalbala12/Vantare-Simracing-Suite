export type ChainStepStatus = "pending" | "launching" | "done" | "failed";
export type ChainStepState = {
  appId: string;
  status: ChainStepStatus;
  startedAt?: number;
  finishedAt?: number;
  message?: string;
  pid?: number;
};
export type ChainState = {
  profileId: string;
  startedAt: number;
  lastEventAt: number; // for watchdog
  steps: ChainStepState[];
  currentStepIndex: number;
  overallStatus: "running" | "done" | "error";
};
export type ChainStepEvent = {
  profileId: string;
  stepIndex: number;
  appId: string;
  status: ChainStepStatus;
  startedAt?: number;
  finishedAt?: number;
  message?: string;
  pid?: number;
};
export type LastResult = "success" | "partial" | "error";

const VALID_TRANSITIONS: Record<ChainStepStatus, ChainStepStatus[]> = {
  pending: ["launching", "done", "failed"],
  launching: ["done", "failed"],
  done: [],
  failed: [],
};

function applyStep(
  state: ChainStepState | undefined,
  ev: ChainStepEvent,
): ChainStepState {
  if (!state) state = { appId: ev.appId, status: "pending" };
  // Terminal states are idempotent.
  if (state.status === "done" || state.status === "failed") return state;
  // Check if the transition is allowed.
  if (!VALID_TRANSITIONS[state.status].includes(ev.status)) {
    // Allow out-of-order: pending → done/failed (tolerate missing launching).
    if (
      state.status === "pending" &&
      (ev.status === "done" || ev.status === "failed")
    ) {
      return {
        ...state,
        appId: ev.appId,
        status: ev.status,
        startedAt: ev.startedAt,
        finishedAt: ev.finishedAt,
        message: ev.message,
        pid: ev.pid,
      };
    }
    return state;
  }
  return {
    ...state,
    status: ev.status,
    startedAt: ev.startedAt ?? state.startedAt,
    finishedAt: ev.finishedAt,
    message: ev.message,
    pid: ev.pid ?? state.pid,
  };
}

export function createChainStore() {
  const chains = new Map<string, ChainState>();
  const lastResults = new Map<string, LastResult>();

  return {
    getChain(profileId: string): ChainState | undefined {
      return chains.get(profileId);
    },

    getLastResult(profileId: string): LastResult | undefined {
      return lastResults.get(profileId);
    },

    handleStep(ev: ChainStepEvent) {
      const existing = chains.get(ev.profileId);
      const steps = existing ? [...existing.steps] : [];
      steps[ev.stepIndex] = applyStep(steps[ev.stepIndex], ev);
      const now = ev.startedAt ?? ev.finishedAt ?? Date.now();
      chains.set(
        ev.profileId,
        existing
          ? {
              ...existing,
              steps,
              currentStepIndex: ev.stepIndex,
              lastEventAt: now,
            }
          : {
              profileId: ev.profileId,
              startedAt: now,
              lastEventAt: now,
              steps,
              currentStepIndex: ev.stepIndex,
              overallStatus: "running",
            },
      );
    },

    handleDone(profileId: string, success: boolean) {
      const existing = chains.get(profileId);
      if (!existing) return;
      chains.set(profileId, {
        ...existing,
        overallStatus: success ? "done" : "error",
      });
      if (success) lastResults.set(profileId, "success");
      else
        lastResults.set(
          profileId,
          existing.steps.some((s) => s.status === "done") ? "partial" : "error",
        );
    },

    handleError(profileId: string) {
      lastResults.set(profileId, "error");
    },

    clearChain(profileId: string) {
      chains.delete(profileId);
    },
  };
}
