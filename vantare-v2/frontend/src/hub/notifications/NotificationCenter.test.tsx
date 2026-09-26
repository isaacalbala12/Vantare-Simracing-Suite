import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";

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

import { NotificationCenter } from "./NotificationCenter";
import type { CenterRecord, CenterSnapshot } from "./notification-center";

function centerRecord(overrides: Partial<CenterRecord> = {}): CenterRecord {
  return {
    v: 1,
    id: "n-1",
    source: "updater",
    severity: "info",
    occurredAt: Date.now(),
    dedupeKey: "updater:update:v1",
    titleKey: "notifications.record.updater.available.title",
    textKey: "notifications.record.updater.available.text",
    params: { tag: "v9.9.9" },
    unread: true,
    ...overrides,
  };
}

// El store es singleton de módulo: la revisión debe crecer entre tests o el
// siguiente publish se descarta como entrega vieja.
let rev = 0;
function publish(records: CenterRecord[]) {
  const unread = records.filter((r) => r.unread).length;
  const snapshot: CenterSnapshot = { v: 1, revision: ++rev, records, unread };
  act(() => mocks.handlers.get("notifications:center")?.({ data: snapshot }));
}

function renderCenter() {
  return render(
    <I18nProvider>
      <NotificationCenter />
    </I18nProvider>,
  );
}

afterEach(cleanup);

describe("NotificationCenter", () => {
  beforeEach(() => {
    mocks.handlers.clear();
    mocks.on.mockClear();
    mocks.emit.mockClear();
  });

  it("pide el snapshot al montar (cubre reconexión del webview)", () => {
    renderCenter();
    expect(mocks.emit).toHaveBeenCalledWith("notifications:center:get");
  });

  it("muestra el badge con el recuento de no leídos", () => {
    renderCenter();
    publish([centerRecord(), centerRecord({ id: "n-2", dedupeKey: "k2" })]);
    expect(screen.getByText("2")).toBeTruthy();
  });

  it("abre el panel, lista los avisos con su texto interpolado y marca leído al pulsar", () => {
    renderCenter();
    publish([centerRecord()]);

    fireEvent.click(screen.getByRole("button", { name: "Notificaciones" }));
    fireEvent.click(screen.getByText("Actualización disponible"));

    // Click en el registro no leído: read + nada más (no lleva acción).
    expect(mocks.emit).toHaveBeenCalledWith("notifications:center:read", { id: "n-1" });
    expect(mocks.emit).not.toHaveBeenCalledWith(
      "notifications:center:action",
      expect.anything(),
    );
    expect(screen.getByText(/v9\.9\.9/)).toBeTruthy();
  });

  it("los avisos con acción emiten action y el backend decide el destino", () => {
    renderCenter();
    publish([
      centerRecord({
        action: { kind: "navigate", target: "settings:updates" },
      }),
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Notificaciones" }));
    fireEvent.click(screen.getByText("Actualización disponible"));

    expect(mocks.emit).toHaveBeenCalledWith("notifications:center:action", { id: "n-1" });
    expect(mocks.emit).toHaveBeenCalledWith("notifications:center:read", { id: "n-1" });
  });

  it("las herramientas marcan todo leído y limpian el centro", () => {
    renderCenter();
    publish([centerRecord()]);

    fireEvent.click(screen.getByRole("button", { name: "Notificaciones" }));
    fireEvent.click(screen.getByRole("button", { name: "Marcar todo como leído" }));
    fireEvent.click(screen.getByRole("button", { name: "Limpiar" }));

    expect(mocks.emit).toHaveBeenCalledWith("notifications:center:read", { id: "all" });
    expect(mocks.emit).toHaveBeenCalledWith("notifications:center:clear");
  });

  it("muestra el estado vacío y Escape cierra el panel", () => {
    renderCenter();
    publish([]); // el store retiene lo publicado por tests anteriores
    fireEvent.click(screen.getByRole("button", { name: "Notificaciones" }));
    expect(screen.getByText("Sin notificaciones.")).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("orbit-notifications")).toBeNull();
  });
});
