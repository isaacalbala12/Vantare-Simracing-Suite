export type HubSuspendBridge = {
  on(event: string, handler: (payload: unknown) => void): () => void;
  emit(event: string, payload: unknown): void;
};

let studioDirty = false;

export function setHubStudioDirty(dirty: boolean): void {
  studioDirty = dirty;
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
    bridge.emit("hub:can-suspend:result", { requestId, canSuspend: !studioDirty });
  });
}
