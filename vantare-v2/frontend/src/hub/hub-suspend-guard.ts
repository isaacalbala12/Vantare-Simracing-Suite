import { useEffect } from "react";

export type HubSuspendBridge = {
  on(event: string, handler: (payload: unknown) => void): () => void;
  emit(event: string, payload: unknown): void;
};

type HubSuspendBlocker = { reason: string; token: symbol };
type HubBlockerSnapshot = {
  generation: string;
  studioDirty: boolean;
  launcherDraft: boolean;
  oauthPending: boolean;
  other: string[];
  reasons: string[];
};

const blockers = new Map<string, HubSuspendBlocker>();
let releaseStudioBlocker: (() => void) | null = null;
let publishSnapshot: (() => void) | null = null;

function notifyBlockersChanged(): void {
  publishSnapshot?.();
}

export function registerHubSuspendBlocker(id: string, reason: string): () => void {
  const token = Symbol(id);
  blockers.set(id, { reason, token });
  notifyBlockersChanged();
  return () => {
    if (blockers.get(id)?.token === token) {
      blockers.delete(id);
      notifyBlockersChanged();
    }
  };
}

export function useHubSuspendBlocker(id: string, reason: string, active: boolean): void {
  useEffect(() => {
    if (!active) return;
    return registerHubSuspendBlocker(id, reason);
  }, [active, id, reason]);
}

export function unregisterHubSuspendBlocker(id: string): void {
  if (blockers.delete(id)) notifyBlockersChanged();
}

export function getHubSuspendBlockerReasons(): string[] {
  return [...blockers.values()].map(({ reason }) => reason);
}

export function setHubStudioDirty(dirty: boolean): void {
  if (dirty && !releaseStudioBlocker) {
    releaseStudioBlocker = registerHubSuspendBlocker(
      "overlay-studio-dirty",
      "Studio tiene cambios sin guardar",
    );
  } else if (!dirty && releaseStudioBlocker) {
    releaseStudioBlocker();
    releaseStudioBlocker = null;
  }
}

export function installHubSuspendGuard(bridge: HubSuspendBridge, generation: string): () => void {
  const snapshot = (): HubBlockerSnapshot => {
    const reasons = getHubSuspendBlockerReasons();
    return {
      generation,
      studioDirty: blockers.has("overlay-studio-dirty"),
      launcherDraft: blockers.has("launcher-profile-draft"),
      oauthPending: blockers.has("oauth-pending"),
      other: [...blockers.entries()]
        .filter(([id]) => !["overlay-studio-dirty", "launcher-profile-draft", "oauth-pending"].includes(id))
        .map(([, blocker]) => blocker.reason),
      reasons,
    };
  };
  const publish = () => bridge.emit("hub:blockers", snapshot());
  publishSnapshot = publish;
  publish();
  const onVisible = () => {
    if (document.visibilityState === "visible") publish();
  };
  document.addEventListener("visibilitychange", onVisible);
  const offProbe = bridge.on("hub:can-suspend", (payload) => {
    const receivedAtUnixMs = Date.now();
    const data = payload && typeof payload === "object" && "data" in payload
      ? (payload as { data: unknown }).data
      : payload;
    const requestId = data && typeof data === "object" && "requestId" in data
      ? (data as { requestId: unknown }).requestId
      : undefined;
    if (typeof requestId !== "string" || requestId.length === 0) return;
    const reasons = getHubSuspendBlockerReasons();
    bridge.emit("hub:can-suspend:result", {
      requestId,
      canSuspend: reasons.length === 0,
      reasons,
      emittedAtUnixMs: data && typeof data === "object" && "emittedAtUnixMs" in data
        ? (data as { emittedAtUnixMs: unknown }).emittedAtUnixMs
        : undefined,
      receivedAtUnixMs,
      respondedAtUnixMs: Date.now(),
    });
  });
  return () => {
    offProbe();
    document.removeEventListener("visibilitychange", onVisible);
    if (publishSnapshot === publish) publishSnapshot = null;
  };
}
