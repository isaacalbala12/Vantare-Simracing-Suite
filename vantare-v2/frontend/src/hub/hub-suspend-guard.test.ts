import { afterEach, describe, expect, it, vi } from "vitest";
import {
  installHubSuspendGuard,
  registerHubSuspendBlocker,
  setHubStudioDirty,
} from "./hub-suspend-guard";

afterEach(() => {
  setHubStudioDirty(false);
  vi.useRealTimers();
});

describe("hub suspend guard", () => {
  it("allows a clean hub and blocks a dirty Studio", () => {
    let handler: ((payload: unknown) => void) | undefined;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-30T00:00:00Z"));
    const emitted: Array<{ event: string; payload: unknown }> = [];
    const dispose = installHubSuspendGuard({
      on: (_event, next) => { handler = next; return () => { handler = undefined; }; },
      emit: (event, payload) => emitted.push({ event, payload }),
    }, "generation-1");

    handler?.({ data: { requestId: "clean" } });
    setHubStudioDirty(true);
    handler?.({ data: { requestId: "dirty" } });

    expect(emitted.filter(({ event }) => event === "hub:can-suspend:result").map(({ payload }) => payload)).toEqual([
      expect.objectContaining({ requestId: "clean", canSuspend: true, reasons: [] }),
      expect.objectContaining({
        requestId: "dirty",
        canSuspend: false,
        reasons: ["Studio tiene cambios sin guardar"],
      }),
    ]);
    dispose();
  });

  it("mantiene todos los bloqueadores y elimina solo el registro propietario", () => {
    const releaseDraft = registerHubSuspendBlocker("draft", "Borrador sin guardar");
    const releaseOAuth = registerHubSuspendBlocker("oauth", "OAuth pendiente");
    const emitted: Array<{ event: string; payload: unknown }> = [];
    let handler: ((payload: unknown) => void) | undefined;
    const dispose = installHubSuspendGuard({
      on: (_event, next) => { handler = next; return () => undefined; },
      emit: (event, payload) => emitted.push({ event, payload }),
    }, "generation-2");

    handler?.({ data: { requestId: "blocked" } });
    releaseDraft();
    handler?.({ data: { requestId: "still-blocked" } });

    expect(emitted.filter(({ event }) => event === "hub:can-suspend:result").map(({ payload }) => payload)).toEqual([
      expect.objectContaining({
        requestId: "blocked",
        canSuspend: false,
        reasons: ["Borrador sin guardar", "OAuth pendiente"],
      }),
      expect.objectContaining({
        requestId: "still-blocked",
        canSuspend: false,
        reasons: ["OAuth pendiente"],
      }),
    ]);
    releaseOAuth();
    dispose();
  });

  it("publica el estado inicial, cada cambio y la generación de la ventana", () => {
    const emitted: Array<{ event: string; payload: unknown }> = [];
    const dispose = installHubSuspendGuard({
      on: () => () => undefined,
      emit: (event, payload) => emitted.push({ event, payload }),
    }, "generation-pushed");

    const releaseDraft = registerHubSuspendBlocker(
      "launcher-profile-draft",
      "El editor tiene un borrador",
    );
    const releaseOAuth = registerHubSuspendBlocker("oauth-pending", "OAuth pendiente");
    document.dispatchEvent(new Event("visibilitychange"));
    releaseDraft();

    const snapshots = emitted
      .filter(({ event }) => event === "hub:blockers")
      .map(({ payload }) => payload);
    expect(snapshots[0]).toEqual({
      generation: "generation-pushed",
      studioDirty: false,
      launcherDraft: false,
      oauthPending: false,
      other: [],
      reasons: [],
    });
    expect(snapshots).toContainEqual(expect.objectContaining({
      generation: "generation-pushed",
      launcherDraft: true,
      oauthPending: true,
    }));
    expect(snapshots.at(-1)).toEqual(expect.objectContaining({
      launcherDraft: false,
      oauthPending: true,
    }));

    releaseOAuth();
    dispose();
  });
});
