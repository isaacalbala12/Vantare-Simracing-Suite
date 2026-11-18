import type { HostToUi, UiToHost } from "../contract/generated/contract";
import {
  type StrategyFileMode,
  strategyPickCooldownMs,
  strategyPickLifetimeSeconds,
} from "../contract/generated/strategy";
import { bounded, isUiMessage } from "../contract/validation";
import { internalIds } from "./launcher-picker";

/**
 * «Abrir otro archivo…» and «Guardar como…». The host records a ticket and
 * acknowledges before main opens a dialog; the path goes from main to the host
 * and never to the renderer, which only receives the final view or an error.
 */
export function strategyFilePicker(
  open: (mode: StrategyFileMode) => Promise<string | undefined>,
  sendHost: (message: UiToHost) => void,
  now: () => number = Date.now,
  ids = internalIds(),
) {
  let nextDialog = 0;
  let pending:
    | {
        id: number;
        rendererId: number;
        mode: StrategyFileMode;
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
      nextDialog = now() + strategyPickCooldownMs;
      sendHost({ kind: "pickedStrategyFile", id: current.id, path: null });
    }
  }
  async function show(current: NonNullable<typeof pending>) {
    try {
      const path = await open(current.mode);
      if (pending !== current) return;
      if (!current.connected() || now() >= current.expires) {
        cancel();
        return;
      }
      const message = {
        kind: "pickedStrategyFile",
        id: current.id,
        path: path ?? null,
      };
      if (!isUiMessage(message) || !bounded(message))
        throw new Error("Invalid dialog result");
      if (path === undefined) nextDialog = now() + strategyPickCooldownMs;
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
      mode: StrategyFileMode,
      revision: string,
      reply: (message: HostToUi) => void,
      connected: () => boolean,
    ) {
      if (!connected()) return;
      if (pending && now() >= pending.expires) cancel();
      if (pending || now() < nextDialog) {
        reply({ kind: "failure", id, error: { kind: "busy" } });
        return;
      }
      pending = {
        id: ids.next(),
        rendererId: id,
        mode,
        reply,
        connected,
        phase: "ack",
        expires: now() + strategyPickLifetimeSeconds * 1000,
      };
      sendHost({
        kind: "request",
        id: pending.id,
        request: { method: "strategy.pickFile", mode, revision },
      });
    },
    /** `true` only for a message of the pending pick; others are not taken. */
    receive(message: HostToUi): boolean {
      const current = pending;
      if (!current || !("id" in message) || message.id !== current.id)
        return false;
      if (message.kind === "failure") {
        pending = undefined;
        if (current.connected())
          current.reply({ ...message, id: current.rendererId });
        return true;
      }
      if (
        message.kind !== "response" ||
        message.result.method !== "strategy.pickFile"
      )
        return false;
      if (current.phase === "result") {
        pending = undefined;
        if (current.connected())
          current.reply({ ...message, id: current.rendererId });
        return true;
      }
      if (current.phase !== "ack") return true;
      if (!current.connected() || now() >= current.expires) {
        cancel();
        return true;
      }
      current.phase = "dialog";
      void show(current);
      return true;
    },
  };
}
