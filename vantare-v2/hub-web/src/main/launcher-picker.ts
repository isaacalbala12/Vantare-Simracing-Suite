import type { HostToUi, UiToHost } from "../contract/generated/contract";
import { launcherPickLifetimeSeconds, launcherPickCooldownMs } from "../contract/generated/contract";
import { bounded, isUiMessage } from "../contract/validation";

/** The host must acknowledge a pending request before main opens a dialog. */
export function executablePicker(
  open: () => Promise<string | undefined>,
  sendHost: (message: UiToHost) => void,
  now: () => number = Date.now,
) {
  let internalSequence = 0x80000000;
  let nextDialog = 0;
  let pending:
    | {
        id: number;
        rendererId: number;
        phase: "ack" | "dialog" | "result";
        expires: number;
        reply: (message: HostToUi) => void;
        connected: () => boolean;
      }
    | undefined;
  function cancel() {
    const current = pending;
    pending = undefined;
    if (current) {
      nextDialog = now() + launcherPickCooldownMs;
      sendHost({ kind: "pickedExecutable", id: current.id, path: null });
    }
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
      if (path === undefined) nextDialog = now() + launcherPickCooldownMs;
      current.phase = "result";
      sendHost(message);
    } catch {
      if (pending !== current) return;
      cancel();
      if (current.connected())
        current.reply({
          kind: "failure",
          id: current.rendererId,
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
      if (pending || now() < nextDialog) {
        if (connected())
          reply({ kind: "failure", id, error: { kind: "busy" } });
        return;
      }
      const internalId = internalSequence++;
      if (internalSequence > 0xffffffff) internalSequence = 0x80000000;
      pending = {
        id: internalId,
        rendererId: id,
        reply,
        connected,
        phase: "ack",
        expires: now() + launcherPickLifetimeSeconds * 1000,
      };
      sendHost({
        kind: "request",
        id: internalId,
        request: { method: "launcher.app.pick", id: target },
      });
    },
    receive(message: HostToUi): boolean {
      const current = pending;
      if (!current || !("id" in message) || message.id !== current.id)
        return "id" in message && message.id >= 0x80000000;
      if (message.kind === "failure") {
        pending = undefined;
        if (current.connected()) current.reply({ ...message, id: current.rendererId });
        return true;
      }
      if (
        message.kind !== "response" ||
        message.result.method !== "launcher.app.pick"
      )
        return false;
      if (current.phase === "result") {
        pending = undefined;
        if (current.connected()) current.reply({ ...message, id: current.rendererId });
        return true;
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
