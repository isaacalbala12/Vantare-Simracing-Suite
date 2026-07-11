import {
  createContext,
  useContext,
  useRef,
  useEffect,
  useCallback,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Events } from "@wailsio/runtime";
import { HubToast, type HubToastVariant } from "./HubToast";
import { notifyLaunchResult } from "./launch-notification";

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

const CLEANUP_MS = 3000;
const STALE_MS = 30000;
const WATCHDOG_INTERVAL_MS = 5000;

export function createChainStore() {
  const chains = new Map<string, ChainState>();
  const lastResults = new Map<string, LastResult>();
  const timeouts = new Map<string, ReturnType<typeof setTimeout>>();
  const subscribers = new Map<string, Set<() => void>>();
  let watchdogInterval: ReturnType<typeof setInterval> | null = null;

  function notifySubscribers(profileId: string) {
    subscribers.get(profileId)?.forEach((cb) => cb());
  }

  function scheduleCleanup(profileId: string) {
    const pending = timeouts.get(profileId);
    if (pending) clearTimeout(pending);
    const t = setTimeout(() => {
      chains.delete(profileId);
      timeouts.delete(profileId);
      notifySubscribers(profileId);
    }, CLEANUP_MS);
    timeouts.set(profileId, t);
  }

  function startWatchdog() {
    if (watchdogInterval) return;
    watchdogInterval = setInterval(() => {
      const now = Date.now();
      for (const [id, chain] of chains) {
        if (
          chain.overallStatus === "running" &&
          now - chain.lastEventAt > STALE_MS
        ) {
          chains.set(id, { ...chain, overallStatus: "error" });
          lastResults.set(id, "error");
          notifySubscribers(id);
          scheduleCleanup(id);
        }
      }
    }, WATCHDOG_INTERVAL_MS);
  }

  return {
    getChain(profileId: string): ChainState | undefined {
      return chains.get(profileId);
    },

    getLastResult(profileId: string): LastResult | undefined {
      return lastResults.get(profileId);
    },

    subscribe(profileId: string, cb: () => void): () => void {
      if (!subscribers.has(profileId)) {
        subscribers.set(profileId, new Set());
      }
      subscribers.get(profileId)!.add(cb);
      return () => {
        subscribers.get(profileId)?.delete(cb);
      };
    },

    handleStep(ev: ChainStepEvent) {
      const pending = timeouts.get(ev.profileId);
      if (pending) {
        clearTimeout(pending);
        timeouts.delete(ev.profileId);
      }
      const existing = chains.get(ev.profileId);
      // Si la cadena está en estado terminal y llega un launching,
      // es un relanzamiento dentro de la ventana de cleanup → empezar fresca.
      const isRelaunch =
        existing &&
        (existing.overallStatus === "done" ||
          existing.overallStatus === "error") &&
        (ev.status === "launching" || ev.status === "pending");
      const steps = existing && !isRelaunch ? [...existing.steps] : [];
      steps[ev.stepIndex] = applyStep(steps[ev.stepIndex], ev);
      const now = ev.startedAt ?? ev.finishedAt ?? Date.now();
      if (isRelaunch) {
        chains.set(ev.profileId, {
          profileId: ev.profileId,
          startedAt: now,
          lastEventAt: now,
          steps,
          currentStepIndex: ev.stepIndex,
          overallStatus: "running",
        });
      } else {
        chains.set(
          ev.profileId,
          existing && !isRelaunch
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
      }
      notifySubscribers(ev.profileId);
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
      notifySubscribers(profileId);
      scheduleCleanup(profileId);
    },

    handleError(profileId: string) {
      lastResults.set(profileId, "error");
      const existing = chains.get(profileId);
      if (existing) {
        chains.set(profileId, { ...existing, overallStatus: "error" });
        notifySubscribers(profileId);
        scheduleCleanup(profileId);
      } else {
        notifySubscribers(profileId);
      }
    },

    clearChain(profileId: string) {
      const pending = timeouts.get(profileId);
      if (pending) {
        clearTimeout(pending);
        timeouts.delete(profileId);
      }
      chains.delete(profileId);
      notifySubscribers(profileId);
    },

    startWatchdog,

    shutdown() {
      timeouts.forEach((t) => clearTimeout(t));
      timeouts.clear();
      if (watchdogInterval) {
        clearInterval(watchdogInterval);
        watchdogInterval = null;
      }
      subscribers.clear();
    },
  };
}

type ChainRunnerStore = ReturnType<typeof createChainStore>;

const ChainRunnerContext = createContext<ChainRunnerStore | null>(null);

export function ChainRunnerProvider({ children }: { children: ReactNode }) {
  const storeRef = useRef<ChainRunnerStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = createChainStore();
  }
  const store = storeRef.current;

  const [toastInfo, setToastInfo] = useState<{
    variant: HubToastVariant;
    message: string;
    profileId: string;
  } | null>(null);

  useEffect(() => {
    store.startWatchdog();

    const offStep = Events.On("launcher:chain:step", (event: unknown) => {
      store.handleStep((event as { data: ChainStepEvent }).data);
    });
    const offDone = Events.On("launcher:chain:done", (event: unknown) => {
      const data = (event as { data: { profileId: string; success: boolean } })
        .data;
      store.handleDone(data.profileId, data.success);

      // Show HubToast fallback with the result details
      const chain = store.getChain(data.profileId);
      const result = store.getLastResult(data.profileId);
      if (chain && result) {
        const total = chain.steps.length;
        const doneSteps = chain.steps.filter(
          (s) => s.status === "done",
        ).length;
        const failedSteps = chain.steps.filter(
          (s) => s.status === "failed",
        );
        const failedNames = failedSteps.map((s) => s.appId).join(", ");

        let message: string;
        if (result === "success") {
          message = `Perfil ${data.profileId} · ${doneSteps}/${total} apps lanzadas`;
        } else if (result === "partial") {
          message = `Perfil ${data.profileId} · ${doneSteps}/${total} apps listas, falló ${failedNames}`;
        } else {
          message = `Perfil ${data.profileId} · no se pudo iniciar`;
        }

        if (!notifyLaunchResult(data.profileId, result)) {
          setToastInfo({ variant: result, message, profileId: data.profileId });
        }
      }
    });
    const offError = Events.On("launcher:chain:error", (event: unknown) => {
      const data = (event as { data: { profileId: string } }).data;
      store.handleError(data.profileId);
    });

    return () => {
      offStep();
      offDone();
      offError();
      store.shutdown();
    };
  }, [store]);

  const handleRetry = useCallback((profileId: string) => {
    Events.Emit("launcher:profile:retry:failed", { id: profileId });
    setToastInfo(null);
  }, []);

  const handleCloseToast = useCallback(() => {
    setToastInfo(null);
  }, []);

  return (
    <>
      <ChainRunnerContext.Provider value={store}>
        {children}
      </ChainRunnerContext.Provider>
      {toastInfo && (
        <HubToast
          variant={toastInfo.variant}
          message={toastInfo.message}
          profileId={toastInfo.profileId}
          onRetry={handleRetry}
          onClose={handleCloseToast}
        />
      )}
    </>
  );
}

function useChainRunnerStore(): ChainRunnerStore {
  const store = useContext(ChainRunnerContext);
  if (!store) {
    throw new Error(
      "useChainRunnerStore must be used within ChainRunnerProvider",
    );
  }
  return store;
}

export function useChainState(profileId: string): ChainState | undefined {
  const store = useChainRunnerStore();
  const subscribe = useCallback(
    (cb: () => void) => store.subscribe(profileId, cb),
    [store, profileId],
  );
  const getSnapshot = useCallback(
    () => store.getChain(profileId),
    [store, profileId],
  );
  return useSyncExternalStore(subscribe, getSnapshot);
}

export function useLastResult(profileId: string): LastResult | undefined {
  const store = useChainRunnerStore();
  const subscribe = useCallback(
    (cb: () => void) => store.subscribe(profileId, cb),
    [store, profileId],
  );
  const getSnapshot = useCallback(
    () => store.getLastResult(profileId),
    [store, profileId],
  );
  return useSyncExternalStore(subscribe, getSnapshot);
}
