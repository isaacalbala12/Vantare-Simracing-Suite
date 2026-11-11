import type { HostToUi, UiToHost } from "../contract/generated/contract";
import { launcherPickLifetimeSeconds } from "../contract/generated/contract";
import { bounded, isUiMessage } from "../contract/validation";

/** The host must acknowledge a pending request before main opens a dialog. */
export function executablePicker(
  open: () => Promise<string | undefined>,
  sendHost: (message: UiToHost) => void,
  now: () => number = Date.now,
) {
  let pending:
    | {
        id: number;
        phase: "ack" | "dialog" | "result";
        expires: number;
        reply: (message: HostToUi) => void;
        connected: () => boolean;
      }
    | undefined;
  function cancel() {
    const current = pending;
    pending = undefined;
    if (current)
      sendHost({ kind: "pickedExecutable", id: current.id, path: null });
  }
  async function show(current: NonNullable<typeof pending>) {
    try {
      const path = await open();
      if (pending !== current) return;
      if (!current.connected() || now() >= current.expires) {
        cancel();
        return;
      }
      const message = {
        kind: "pickedExecutable",
        id: current.id,
        path: path ?? null,
      };
      if (!isUiMessage(message) || !bounded(message))
        throw new Error("Invalid dialog result");
      current.phase = "result";
      sendHost(message);
    } catch {
      if (pending !== current) return;
      cancel();
      if (current.connected())
        current.reply({
          kind: "failure",
          id: current.id,
          error: { kind: "io" },
        });
    }
  }
  return {
    cancel,
    request(
      id: number,
      target: string | null,
      reply: (message: HostToUi) => void,
      connected: () => boolean,
    ) {
      if (!connected()) return;
      if (pending && now() >= pending.expires) cancel();
      if (pending) {
        if (connected())
          reply({ kind: "failure", id, error: { kind: "busy" } });
        return;
      }
      pending = {
        id,
        reply,
        connected,
        phase: "ack",
        expires: now() + launcherPickLifetimeSeconds * 1000,
      };
      sendHost({
        kind: "request",
        id,
        request: { method: "launcher.app.pick", id: target },
      });
    },
    receive(message: HostToUi): boolean {
      const current = pending;
      if (!current || !("id" in message) || message.id !== current.id)
        return false;
      if (message.kind === "failure") {
        pending = undefined;
        return false;
      }
      if (
        message.kind !== "response" ||
        message.result.method !== "launcher.app.pick"
      )
        return false;
      if (current.phase === "result") {
        pending = undefined;
        return false;
      }
      if (current.phase !== "ack") return true;
      if (
        message.result.value !== null ||
        !current.connected() ||
        now() >= current.expires
      ) {
        cancel();
        return true;
      }
      current.phase = "dialog";
      void show(current);
      return true;
    },
  };
}
