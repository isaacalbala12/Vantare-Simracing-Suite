import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import { NotificationsSettings } from "./NotificationsSettings";
import { useAppSettings } from "./useAppSettings";

type Handler = (event: { data: unknown }) => void;

const runtimeMock = vi.hoisted(() => ({
  handlers: new Map<string, Handler[]>(),
  emit: vi.fn(),
}));

vi.mock("@wailsio/runtime", () => ({
  Events: {
    On: (name: string, handler: Handler) => {
      runtimeMock.handlers.set(name, [...(runtimeMock.handlers.get(name) ?? []), handler]);
      return () => runtimeMock.handlers.delete(name);
    },
    Emit: runtimeMock.emit,
  },
}));

function dispatch(name: string, data: unknown) {
  act(() => {
    for (const handler of runtimeMock.handlers.get(name) ?? []) {
      handler({ data });
    }
  });
}

function Harness() {
  return (
    <I18nProvider>
      <NotificationsSettings app={useAppSettings()} />
    </I18nProvider>
  );
}

function lastSave(): Record<string, unknown> {
  const saves = runtimeMock.emit.mock.calls.filter((call) => call[0] === "settings:save");
  return saves[saves.length - 1][1] as Record<string, unknown>;
}

const UPDATES = "Avisarme cuando haya una versión nueva";
const LAUNCHER = "Avisarme cuando termine de abrir un perfil del Launcher";
const SYSTEM = "Avisarme con una notificación de Windows cuando la app esté minimizada";

describe("NotificationsSettings", () => {
  beforeEach(() => {
    runtimeMock.handlers.clear();
    runtimeMock.emit.mockClear();
  });

  afterEach(cleanup);

  // Stored as opt-outs, so a settings file with no notifications object at all
  // has to come up with the in-app alerts on.
  it("shows in-app alerts as on when nothing has been stored", () => {
    render(<Harness />);
    dispatch("settings", { cpuSampling: true, hotkeys: {} });

    expect((screen.getByRole("checkbox", { name: UPDATES }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("checkbox", { name: LAUNCHER }) as HTMLInputElement).checked).toBe(
      true,
    );
  });

  it("writes the mute when the user turns an alert off", () => {
    render(<Harness />);
    dispatch("settings", { cpuSampling: true, hotkeys: {} });

    fireEvent.click(screen.getByRole("checkbox", { name: UPDATES }));

    expect(lastSave().notifications).toEqual({ updatesMuted: true });
  });

  // Each switch writes only its own key, so turning one off cannot quietly
  // reset the others.
  it("keeps the other choices when one is changed", () => {
    render(<Harness />);
    dispatch("settings", {
      cpuSampling: true,
      hotkeys: {},
      notifications: { launcherMuted: true },
    });

    fireEvent.click(screen.getByRole("checkbox", { name: UPDATES }));

    expect(lastSave().notifications).toEqual({
      updatesMuted: true,
      launcherMuted: true,
    });
  });

  // The desktop switch is answered by Go, which reaches Windows through the
  // Wails notifications service. Nothing is offered when the platform cannot
  // deliver.
  it("says so instead of offering a switch the platform cannot honour", () => {
    render(<Harness />);
    dispatch("settings", { cpuSampling: true, hotkeys: {} });
    dispatch("notifications:status", { supported: false, authorized: false });

    expect(screen.queryByRole("checkbox", { name: SYSTEM })).toBeNull();
    expect(screen.getByText("Esta plataforma no admite notificaciones de escritorio.")).toBeDefined();
  });

  it("asks the platform for permission when the switch is turned on", () => {
    render(<Harness />);
    dispatch("settings", { cpuSampling: true, hotkeys: {} });
    dispatch("notifications:status", { supported: true, authorized: false });

    fireEvent.click(screen.getByRole("checkbox", { name: SYSTEM }));

    expect(runtimeMock.emit).toHaveBeenCalledWith("notifications:authorize");
  });

  // The platform outranks the stored preference: a permission revoked from
  // Windows has to show as off, whatever the settings file remembers.
  it("shows off when the platform does not allow it, however it was stored", () => {
    render(<Harness />);
    dispatch("settings", {
      cpuSampling: true,
      hotkeys: {},
      notifications: { systemEnabled: true },
    });
    dispatch("notifications:status", { supported: true, authorized: false });

    expect((screen.getByRole("checkbox", { name: SYSTEM }) as HTMLInputElement).checked).toBe(false);
  });

  it("shows on once the platform has allowed it", () => {
    render(<Harness />);
    dispatch("settings", {
      cpuSampling: true,
      hotkeys: {},
      notifications: { systemEnabled: true },
    });
    dispatch("notifications:status", { supported: true, authorized: true });

    expect((screen.getByRole("checkbox", { name: SYSTEM }) as HTMLInputElement).checked).toBe(true);
  });

  // Windows drops toasts silently for reasons of its own, so the user needs a
  // way to tell a broken setup from one that had nothing to announce.
  it("reports what happened to a test notification", () => {
    render(<Harness />);
    dispatch("settings", { cpuSampling: true, hotkeys: {} });
    dispatch("notifications:status", { supported: true, authorized: true });

    fireEvent.click(screen.getByTestId("notifications-test"));
    expect(runtimeMock.emit).toHaveBeenCalledWith("notifications:test");

    dispatch("notifications:test:result", { ok: false, message: "toast rejected" });
    expect(screen.getByRole("alert").textContent).toContain("toast rejected");

    dispatch("notifications:test:result", { ok: true });
    expect(screen.getByRole("status").textContent).toContain("Enviada");
  });
});
