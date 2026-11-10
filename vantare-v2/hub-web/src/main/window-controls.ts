import type { BrowserWindow } from "electron";
import type { HostToUi, UiToHost } from "../contract/generated/contract";

type WindowTarget = Pick<
  BrowserWindow,
  "isDestroyed" | "minimize" | "isMaximized" | "maximize" | "unmaximize"
> & {
  on(event: "maximize" | "unmaximize", listener: () => void): unknown;
  removeListener(
    event: "maximize" | "unmaximize",
    listener: () => void,
  ): unknown;
};

/** Only the main process can act on its own window. Close stays with the host guard. */
export function bindWindowControls(
  window: WindowTarget,
  post: (message: HostToUi) => void,
) {
  let subscribed = false;
  let disposed = false;
  const publish = () => {
    if (!disposed && subscribed && !window.isDestroyed())
      post({
        kind: "event",
        event: { topic: "windowState", maximized: window.isMaximized() },
      });
  };
  window.on("maximize", publish);
  window.on("unmaximize", publish);
  return {
    dispatch(message: UiToHost): boolean {
      if (disposed) return false;
      if (
        (message.kind === "subscribe" || message.kind === "unsubscribe") &&
        message.topic === "windowState"
      ) {
        subscribed = message.kind === "subscribe";
        publish();
        return true;
      }
      if (
        message.kind !== "request" ||
        (message.request.method !== "window.minimize" &&
          message.request.method !== "window.toggleMaximize")
      )
        return false;
      const method = message.request.method;
      try {
        const accepted = !window.isDestroyed();
        if (accepted) {
          if (method === "window.minimize") window.minimize();
          else if (window.isMaximized()) window.unmaximize();
          else window.maximize();
        }
        post({
          kind: "response",
          id: message.id,
          result: { method, accepted },
        });
      } catch {
        post({ kind: "failure", id: message.id, error: { kind: "io" } });
      }
      return true;
    },
    dispose() {
      disposed = true;
      window.removeListener("maximize", publish);
      window.removeListener("unmaximize", publish);
    },
  };
}
