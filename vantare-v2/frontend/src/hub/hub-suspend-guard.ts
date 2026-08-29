export type HubSuspendBridge = {
  on(event: string, handler: (payload: unknown) => void): () => void;
  emit(event: string, payload: unknown): void;
};

type HubSuspendBlocker = { reason: string; token: symbol };

const blockers = new Map<string, HubSuspendBlocker>();
let releaseStudioBlocker: (() => void) | null = null;

export function registerHubSuspendBlocker(id: string, reason: string): () => void {
  const token = Symbol(id);
  blockers.set(id, { reason, token });
  return () => {
    if (blockers.get(id)?.token === token) blockers.delete(id);
  };
}

export function unregisterHubSuspendBlocker(id: string): void {
  blockers.delete(id);
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

export function installHubSuspendGuard(bridge: HubSuspendBridge): () => void {
  return bridge.on("hub:can-suspend", (payload) => {
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
    });
  });
}
