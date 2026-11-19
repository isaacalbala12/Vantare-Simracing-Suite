import type { HostToUi, UiToHost } from "../contract/generated/contract";
import {
  type StrategyExportTarget,
  type StrategyFileMode,
  strategyPickCooldownMs,
  strategyPickLifetimeSeconds,
} from "../contract/generated/strategy";
import { bounded, isUiMessage } from "../contract/validation";
import { internalIds } from "./launcher-picker";

/**
 * «Abrir otro archivo…», «Guardar como…» and «Guardar como hoja de cálculo…».
 * The host records a ticket and acknowledges before main opens a dialog; the path
 * goes from main to the host and never to the renderer, which only receives the
 * final answer (the view, or the NAME of the exported file) or an error.
 */
export function strategyFilePicker(
  // `export` is the dialog that saves the plan as a CSV; the host suggests its name
  open: (
    mode: StrategyFileMode | "export",
    suggestedName?: string,
  ) => Promise<string | undefined>,
  sendHost: (message: UiToHost) => void,
  now: () => number = Date.now,
  ids = internalIds(),
) {
  let nextDialog = 0;
  let pending:
    | {
        id: number;
        rendererId: number;
        // the method of the request and of every answer to it
        method: "strategy.pickFile" | "strategy.exportFile";
        mode: StrategyFileMode | "export";
        // the name the host suggested for an export, once it acknowledged
        suggestedName?: string;
        phase: "ack" | "dialog" | "result";
        expires: number;
        reply: (message: HostToUi) => void;
        connected: () => boolean;
      }
    | undefined;
  // Voids the ticket. With `answer`, the renderer that waits is told why too: an
  // expired ticket, or an acknowledgement the dialog cannot be opened for.
  function cancel(answer?: "expired" | "io") {
    const current = pending;
    pending = undefined;
    if (current) {
      nextDialog = now() + strategyPickCooldownMs;
      sendHost({ kind: "pickedStrategyFile", id: current.id, path: null });
      if (answer && current.connected())
        current.reply({
          kind: "failure",
          id: current.rendererId,
          error: { kind: answer === "io" ? "io" : "strategyPickExpired" },
        });
    }
  }
  async function show(current: NonNullable<typeof pending>) {
    try {
      const path =
        current.mode === "export"
          ? await open("export", current.suggestedName)
          : await open(current.mode);
      if (pending !== current) return;
      if (!current.connected() || now() >= current.expires) {
        cancel("expired");
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
  function begin(
    id: number,
    method: "strategy.pickFile" | "strategy.exportFile",
    mode: StrategyFileMode | "export",
    request: Extract<UiToHost, { kind: "request" }>["request"],
    reply: (message: HostToUi) => void,
    connected: () => boolean,
  ) {
    if (!connected()) return;
    if (pending && now() >= pending.expires) cancel("expired");
    if (pending || now() < nextDialog) {
      reply({ kind: "failure", id, error: { kind: "busy" } });
      return;
    }
    pending = {
      id: ids.next(),
      rendererId: id,
      method,
      mode,
      reply,
      connected,
      phase: "ack",
      expires: now() + strategyPickLifetimeSeconds * 1000,
    };
    sendHost({ kind: "request", id: pending.id, request });
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
      begin(
        id,
        "strategy.pickFile",
        mode,
        { method: "strategy.pickFile", mode, revision },
        reply,
        connected,
      );
    },
    /** «Guardar como hoja de cálculo…»: the CSV of the plan `target` names. */
    requestExport(
      id: number,
      revision: string,
      target: StrategyExportTarget,
      reply: (message: HostToUi) => void,
      connected: () => boolean,
    ) {
      begin(
        id,
        "strategy.exportFile",
        "export",
        { method: "strategy.exportFile", revision, target },
        reply,
        connected,
      );
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
        message.result.method !== current.method
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
        cancel("expired");
        return true;
      }
      if (current.method === "strategy.exportFile") {
        // the acknowledgement of an export carries the name to suggest
        const value =
          message.result.method === "strategy.exportFile"
            ? message.result.value
            : undefined;
        if (value?.kind !== "ticket") {
          cancel("io");
          return true;
        }
        current.suggestedName = value.suggestedName;
      }
      current.phase = "dialog";
      void show(current);
      return true;
    },
  };
}
