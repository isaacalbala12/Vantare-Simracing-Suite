import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (event: unknown) => void>();
  return {
    handlers,
    on: vi.fn((name: string, handler: (event: unknown) => void) => {
      handlers.set(name, handler);
      return vi.fn(() => handlers.delete(name));
    }),
    emit: vi.fn(),
  };
});

vi.mock("@wailsio/runtime", () => ({
  Events: { On: mocks.on, Emit: mocks.emit },
}));

import {
  activateCenterRecord,
  clearCenter,
  getCenterSnapshot,
  markCenterRead,
  requestCenter,
  subscribeCenter,
  subscribeCenterNavigate,
  type CenterSnapshot,
} from "./notification-center";

const record = {
  v: 1,
  id: "n-1",
  source: "updater",
  severity: "info",
  occurredAt: 1,
  dedupeKey: "updater:update:v1",
  titleKey: "notifications.record.updater.available.title",
  unread: true,
} as const;

function snap(revision: number, unread: number): CenterSnapshot {
  return { v: 1, revision, records: [{ ...record }], unread };
}

describe("notification center store", () => {
  let active: (() => void)[] = [];
  const sub = (listener: () => void) => {
    const off = subscribeCenter(listener);
    active.push(off);
    return off;
  };

  beforeEach(() => {
    active.forEach((off) => off());
    active = [];
    mocks.handlers.clear();
    mocks.on.mockClear();
    mocks.emit.mockClear();
  });

  it("instala una única suscripción Wails y reparte el snapshot", () => {
    const a = vi.fn();
    const b = vi.fn();
    sub(a);
    sub(b);

    expect(mocks.on).toHaveBeenCalledTimes(1);
    mocks.handlers.get("notifications:center")?.({ data: snap(1, 1) });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(getCenterSnapshot().unread).toBe(1);
  });

  it("descarta snapshots con revision vieja (entrega fuera de orden)", () => {
    sub(vi.fn());
    mocks.handlers.get("notifications:center")?.({ data: snap(5, 3) });
    mocks.handlers.get("notifications:center")?.({ data: snap(2, 9) });
    expect(getCenterSnapshot().revision).toBe(5);
    expect(getCenterSnapshot().unread).toBe(3);
  });

  it("ignora entregas sin forma de snapshot", () => {
    const listener = vi.fn();
    sub(listener);
    mocks.handlers.get("notifications:center")?.({ data: { revision: 1 } });
    mocks.handlers.get("notifications:center")?.({ data: "junk" });
    expect(listener).not.toHaveBeenCalled();
  });

  it("requestCenter emite get solo con suscriptores vivos", () => {
    // Sin nadie que reciba la respuesta, pedir dejaría una suscripción Wails
    // huérfana: ni se emite ni se instala el listener.
    requestCenter();
    expect(mocks.emit).not.toHaveBeenCalled();
    expect(mocks.handlers.has("notifications:center")).toBe(false);

    // Con un suscriptor (el componente ya montado) la petición sale.
    const off = sub(vi.fn());
    requestCenter();
    expect(mocks.emit).toHaveBeenCalledWith("notifications:center:get");
    off();
  });

  it("emite las mutaciones con el payload del contrato", () => {
    markCenterRead("n-1");
    clearCenter();
    activateCenterRecord("n-1");
    expect(mocks.emit).toHaveBeenCalledWith("notifications:center:read", { id: "n-1" });
    expect(mocks.emit).toHaveBeenCalledWith("notifications:center:clear");
    expect(mocks.emit).toHaveBeenCalledWith("notifications:center:action", { id: "n-1" });
  });

  it("el canal navigate solo reparte targets válidos", () => {
    const listener = vi.fn();
    const off = subscribeCenterNavigate(listener);
    active.push(off);

    mocks.handlers.get("notifications:center:navigate")?.({ data: { target: "launcher" } });
    mocks.handlers.get("notifications:center:navigate")?.({ data: { target: "" } });
    mocks.handlers.get("notifications:center:navigate")?.({ data: {} });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith("launcher");
  });
});
