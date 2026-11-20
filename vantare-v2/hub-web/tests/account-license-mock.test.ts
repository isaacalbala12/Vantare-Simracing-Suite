import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountView } from "../src/contract/generated/account";
import type {
  CoreStatus,
  HostToUi,
  Request,
} from "../src/contract/generated/contract";
import { isHostMessage } from "../src/contract/validation";
import { createMockHost } from "../src/mock/host";

/** Transitions of the simulated account/license flow (see account-license.ts). */
let id = 0;
function open(scene: string) {
  const events: HostToUi[] = [];
  const host = createMockHost(scene, (message) => events.push(message));
  const send = (request: Request) => {
    const reply = host({ kind: "request", id: ++id, request });
    expect(isHostMessage(reply)).toBe(true);
    return reply;
  };
  const view = (request: Request): AccountView => {
    const reply = send(request);
    if (reply?.kind !== "response") throw new Error(JSON.stringify(reply));
    return (reply.result as { value: AccountView }).value;
  };
  const failure = (request: Request) => {
    const reply = send(request);
    return reply?.kind === "failure" ? reply.error.kind : reply?.kind;
  };
  const get = () => view({ method: "account.get" });
  const access = () => {
    const reply = send({ method: "core.get" });
    if (reply?.kind !== "response") throw new Error("core.get");
    return (reply.result as { value: CoreStatus }).value.access;
  };
  return { send, view, failure, get, access, events };
}
const calendar = (value: AccountView) =>
  value.modules.find((module) => module.id === "calendar")?.status;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-20T10:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("unverified → verified → signed out", () => {
  it("promotes a tester through «Comprobar acceso» and keeps the menu rights in step", () => {
    const flow = open("cuenta-transicion");
    const before = flow.get();
    expect(before).toMatchObject({
      session: "signedIn",
      verified: false,
      blocked: false,
      plan: { kind: "unverified" },
    });
    expect(calendar(before)).toBe("unverified");
    const after = flow.view({ method: "account.check" });
    expect(after).toMatchObject({
      verified: true,
      blocked: false,
      plan: { kind: "verified" },
      notice: "Derechos verificados y guardados por el núcleo",
    });
    expect(calendar(after)).toBe("included");
    expect(after.modules.map((m) => m.status).slice(3)).toEqual([
      "soon",
      "soon",
    ]);
    expect(flow.access()).toMatchObject({ verified: true, tester: true });
  });

  it("leaves the mock coherent after signing out", () => {
    const flow = open("cuenta-transicion");
    flow.view({ method: "account.check" });
    flow.view({ method: "account.purchase", product: "proMonthly" });
    const out = flow.view({ method: "account.logout" });
    expect(out).toMatchObject({
      session: "signedOut",
      gate: "choose",
      name: "",
      verified: false,
      blocked: false,
      plan: { kind: "unverified" },
      deviceLimit: false,
      purchase: { waiting: false, message: null },
    });
    expect(out.modules.slice(0, 3).map((m) => m.status)).toEqual([
      "unverified",
      "unverified",
      "unverified",
    ]);
    expect(flow.access()).toMatchObject({ verified: false, tester: false });
    // A signed-out account can neither check nor act on the account.
    expect(flow.view({ method: "account.check" }).verified).toBe(false);
    expect(flow.failure({ method: "account.deviceReset" })).toBe("denied");
  });

  it("starts the tester scene verified with the Pro tester catalog", () => {
    const flow = open("cuenta-tester");
    const value = flow.get();
    expect(value).toMatchObject({ verified: true, plan: { kind: "verified" } });
    expect(calendar(value)).toBe("included");
    expect(flow.access()).toMatchObject({ verified: true, tester: true });
  });

  it("keeps a failing renewal unverified instead of promoting it", () => {
    const flow = open("cuenta-sin-verificar");
    const value = flow.view({ method: "account.check" });
    expect(value).toMatchObject({
      verified: false,
      blocked: false,
      plan: { kind: "unverified" },
      notice: "No se pudo verificar la política de acceso",
    });
  });
});

describe("blocked account causes (hub-host navigation.rs:29-38)", () => {
  const transient = [
    ["cuenta-bloqueada-no-disponible", "No se pudo verificar la política"],
    ["cuenta-bloqueada-caducada", "La credencial ha caducado"],
    ["cuenta-bloqueada-recuperar", "Necesitas conexión"],
  ] as const;
  const permanent = [
    ["cuenta-bloqueada-reloj", "El reloj está detrás"],
    ["cuenta-bloqueada-revocada", "Acceso bloqueado"],
    ["cuenta-bloqueada-actualizar", "Actualiza la app"],
  ] as const;
  it.each([...transient, ...permanent])("%s starts blocked", (scene, text) => {
    const flow = open(scene);
    const value = flow.get();
    expect(value).toMatchObject({ verified: false, blocked: true });
    expect(value.plan).toMatchObject({ kind: "denied" });
    expect(value.plan.kind === "denied" && value.plan.text).toContain(text);
    expect(calendar(value)).toBe("unverified");
    expect(flow.access()).toMatchObject({ verified: false, blocked: true });
  });
  it.each(transient)("%s recovers with a renewal", (scene) => {
    const flow = open(scene);
    const value = flow.view({ method: "account.check" });
    expect(value).toMatchObject({ verified: true, blocked: false });
    expect(flow.access()).toMatchObject({ verified: true, blocked: false });
  });
  it.each(permanent)("%s stays blocked after a renewal", (scene, text) => {
    const flow = open(scene);
    const value = flow.view({ method: "account.check" });
    expect(value).toMatchObject({ verified: false, blocked: true });
    expect(value.notice).toContain(text);
  });
});

describe("device, photo and portal", () => {
  it("frees the device, limits the next reset to once per 24 h and recovers on renewal", () => {
    const flow = open("cuenta-tester");
    const freed = flow.view({ method: "account.deviceReset" });
    expect(freed).toMatchObject({
      verified: false,
      plan: { kind: "unverified" },
      deviceLimit: false,
      notice: "Dispositivo liberado; solicite una credencial nueva",
    });
    vi.advanceTimersByTime(23 * 3_600_000);
    const limited = flow.view({ method: "account.deviceReset" });
    expect(limited).toMatchObject({
      deviceLimit: true,
      notice: "límite de dispositivos",
    });
    vi.advanceTimersByTime(2 * 3_600_000);
    expect(flow.view({ method: "account.deviceReset" }).deviceLimit).toBe(
      false,
    );
    const back = flow.view({ method: "account.check" });
    expect(back).toMatchObject({ verified: true, deviceLimit: false });
  });
  it("clears the device limit once a renewal succeeds", () => {
    const flow = open("cuenta-tester");
    flow.view({ method: "account.deviceReset" });
    expect(flow.view({ method: "account.deviceReset" }).deviceLimit).toBe(true);
    expect(flow.view({ method: "account.check" }).deviceLimit).toBe(false);
  });
  it("opens the portal at most once per 5 s and only with a session", () => {
    const flow = open("cuenta-tester");
    expect(
      flow.view({ method: "account.portal", page: "profile" }),
    ).toMatchObject({ session: "signedIn" });
    expect(flow.failure({ method: "account.portal", page: "profile" })).toBe(
      "busy",
    );
    vi.advanceTimersByTime(5000);
    expect(
      flow.view({ method: "account.portal", page: "profile" }).session,
    ).toBe("signedIn");
    const out = open("acceso-base");
    expect(out.failure({ method: "account.portal", page: "profile" })).toBe(
      "denied",
    );
  });
  it("refreshes the profile only with a session", () => {
    const flow = open("cuenta-tester");
    expect(flow.view({ method: "account.photoRefresh" }).name).not.toBe("");
    expect(
      open("acceso-base").failure({ method: "account.photoRefresh" }),
    ).toBe("denied");
  });
});

describe("purchase wait", () => {
  it("confirms the purchase into a verified account in the completing scene", () => {
    const flow = open("cuenta-compra-completada");
    const waiting = flow.view({
      method: "account.purchase",
      product: "founders",
    });
    expect(waiting.purchase.waiting).toBe(true);
    expect(waiting.verified).toBe(false);
    expect(
      flow.failure({ method: "account.purchase", product: "proMonthly" }),
    ).toBe("busy");
    vi.advanceTimersByTime(1500);
    const last = flow.events.at(-1);
    const done =
      last?.kind === "event" && last.event.topic === "account"
        ? last.event.value
        : undefined;
    expect(done).toMatchObject({
      verified: true,
      plan: { kind: "founders" },
      purchase: {
        waiting: false,
        message: "Derechos verificados y guardados por el núcleo",
      },
    });
    expect(flow.access()).toMatchObject({ verified: true });
  });
  it("gives a Pro product a plain verified plan", () => {
    const flow = open("cuenta-compra-completada");
    flow.view({ method: "account.purchase", product: "proAnnual" });
    vi.advanceTimersByTime(1500);
    expect(flow.get().plan).toEqual({ kind: "verified" });
  });
  it("expires the wait with the host message and no rights in the expiring scene", () => {
    const flow = open("cuenta-compra-expira");
    flow.view({ method: "account.purchase", product: "proMonthly" });
    vi.advanceTimersByTime(1500);
    expect(flow.get()).toMatchObject({
      verified: false,
      purchase: {
        waiting: false,
        message:
          "No se han confirmado los derechos. Usa Comprobar acceso para reintentarlo.",
      },
    });
  });
  it("waits the real 600 s in other scenes and a stop cancels the expiry", () => {
    const flow = open("cuenta-sesion");
    flow.view({ method: "account.purchase", product: "proMonthly" });
    vi.advanceTimersByTime(599_000);
    expect(flow.get().purchase.waiting).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(flow.get().purchase.waiting).toBe(false);
    flow.view({ method: "account.purchase", product: "proMonthly" });
    const stopped = flow.view({ method: "account.purchaseStop" });
    expect(stopped.purchase.waiting).toBe(false);
    const events = flow.events.length;
    vi.advanceTimersByTime(600_000);
    expect(flow.events.length).toBe(events);
  });
});

describe("sign-in completes coherently", () => {
  it("returns from the browser verified and lets a cancel stop it", () => {
    const flow = open("acceso-navegador-completa");
    expect(flow.view({ method: "account.begin" }).gate).toBe("waitingBrowser");
    vi.advanceTimersByTime(1500);
    expect(flow.get()).toMatchObject({
      gate: "none",
      session: "signedIn",
      verified: true,
    });
    const cancelled = open("acceso-navegador-completa");
    cancelled.view({ method: "account.begin" });
    cancelled.view({ method: "account.cancel" });
    vi.advanceTimersByTime(5000);
    expect(cancelled.get()).toMatchObject({
      session: "signedOut",
      verified: false,
    });
  });
  it("finishes the mail login verified in its scene", () => {
    const flow = open("acceso-correo-verificado");
    flow.view({
      method: "account.email",
      action: { action: "open", mode: "signInCode" },
    });
    flow.view({
      method: "account.email",
      action: {
        action: "begin",
        mode: "signInCode",
        email: "qa@example.invalid",
        password: "",
      },
    });
    flow.view({
      method: "account.email",
      action: { action: "verify", code: "123456" },
    });
    expect(
      flow.view({ method: "account.email", action: { action: "finish" } }),
    ).toMatchObject({
      gate: "none",
      session: "signedIn",
      verified: true,
      name: "Piloto QA",
    });
  });
  it("keeps the legacy mail scene unverified until a check", () => {
    const flow = open("acceso-correo-completo");
    flow.view({
      method: "account.email",
      action: { action: "open", mode: "signInCode" },
    });
    flow.view({
      method: "account.email",
      action: {
        action: "begin",
        mode: "signInCode",
        email: "qa@example.invalid",
        password: "",
      },
    });
    flow.view({
      method: "account.email",
      action: { action: "verify", code: "123456" },
    });
    const signed = flow.view({
      method: "account.email",
      action: { action: "finish" },
    });
    expect(signed).toMatchObject({ session: "signedIn", verified: false });
    expect(flow.view({ method: "account.check" }).verified).toBe(true);
  });
});
