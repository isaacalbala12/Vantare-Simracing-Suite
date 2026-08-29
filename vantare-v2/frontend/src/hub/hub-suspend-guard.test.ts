import { afterEach, describe, expect, it } from "vitest";
import {
  installHubSuspendGuard,
  registerHubSuspendBlocker,
  setHubStudioDirty,
} from "./hub-suspend-guard";

afterEach(() => setHubStudioDirty(false));

describe("hub suspend guard", () => {
  it("allows a clean hub and blocks a dirty Studio", () => {
    let handler: ((payload: unknown) => void) | undefined;
    const emitted: unknown[] = [];
    const dispose = installHubSuspendGuard({
      on: (_event, next) => { handler = next; return () => { handler = undefined; }; },
      emit: (_event, payload) => emitted.push(payload),
    });

    handler?.({ data: { requestId: "clean" } });
    setHubStudioDirty(true);
    handler?.({ data: { requestId: "dirty" } });

    expect(emitted).toEqual([
      { requestId: "clean", canSuspend: true, reasons: [] },
      {
        requestId: "dirty",
        canSuspend: false,
        reasons: ["Studio tiene cambios sin guardar"],
      },
    ]);
    dispose();
  });

  it("mantiene todos los bloqueadores y elimina solo el registro propietario", () => {
    const releaseDraft = registerHubSuspendBlocker("draft", "Borrador sin guardar");
    const releaseOAuth = registerHubSuspendBlocker("oauth", "OAuth pendiente");
    const emitted: unknown[] = [];
    let handler: ((payload: unknown) => void) | undefined;
    const dispose = installHubSuspendGuard({
      on: (_event, next) => { handler = next; return () => undefined; },
      emit: (_event, payload) => emitted.push(payload),
    });

    handler?.({ data: { requestId: "blocked" } });
    releaseDraft();
    handler?.({ data: { requestId: "still-blocked" } });

    expect(emitted).toEqual([
      {
        requestId: "blocked",
        canSuspend: false,
        reasons: ["Borrador sin guardar", "OAuth pendiente"],
      },
      {
        requestId: "still-blocked",
        canSuspend: false,
        reasons: ["OAuth pendiente"],
      },
    ]);
    releaseOAuth();
    dispose();
  });
});
