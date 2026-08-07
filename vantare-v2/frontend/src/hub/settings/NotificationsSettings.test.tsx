import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
const SYSTEM = "Avisarme también fuera de la app, con el sistema";

describe("NotificationsSettings", () => {
  beforeEach(() => {
    runtimeMock.handlers.clear();
    runtimeMock.emit.mockClear();
    vi.unstubAllGlobals();
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
      notifications: { launcherMuted: true, systemEnabled: true },
    });

    fireEvent.click(screen.getByRole("checkbox", { name: UPDATES }));

    expect(lastSave().notifications).toEqual({
      updatesMuted: true,
      launcherMuted: true,
      systemEnabled: true,
    });
  });

  it("says so instead of offering a switch the platform does not have", () => {
    vi.stubGlobal("Notification", undefined);
    render(<Harness />);
    dispatch("settings", { cpuSampling: true, hotkeys: {} });

    expect(screen.queryByRole("checkbox", { name: SYSTEM })).toBeNull();
    expect(screen.getByText("Este equipo no admite notificaciones del sistema.")).toBeDefined();
  });

  // Vantare never asked for permission, so the desktop-notification path could
  // never fire. Turning the switch on is what asks.
  it("asks the system for permission when the switch is turned on", async () => {
    const requestPermission = vi.fn().mockResolvedValue("granted");
    vi.stubGlobal("Notification", { permission: "default", requestPermission });

    render(<Harness />);
    dispatch("settings", { cpuSampling: true, hotkeys: {} });
    fireEvent.click(screen.getByRole("checkbox", { name: SYSTEM }));

    await waitFor(() => expect(requestPermission).toHaveBeenCalled());
    await waitFor(() => expect(lastSave().notifications).toEqual({ systemEnabled: true }));
  });

  // A switch that reads "on" while the system refuses to deliver is worse than
  // no switch at all.
  it("does not store the choice when permission is refused", async () => {
    const requestPermission = vi.fn().mockResolvedValue("denied");
    vi.stubGlobal("Notification", { permission: "default", requestPermission });

    render(<Harness />);
    dispatch("settings", { cpuSampling: true, hotkeys: {} });
    fireEvent.click(screen.getByRole("checkbox", { name: SYSTEM }));

    await waitFor(() => expect(lastSave().notifications).toEqual({ systemEnabled: false }));
    expect((screen.getByRole("checkbox", { name: SYSTEM }) as HTMLInputElement).checked).toBe(false);
  });

  it("explains an already-blocked permission rather than looping on it", () => {
    const requestPermission = vi.fn();
    vi.stubGlobal("Notification", { permission: "denied", requestPermission });

    render(<Harness />);
    dispatch("settings", { cpuSampling: true, hotkeys: {} });

    const toggle = screen.getByRole("checkbox", { name: SYSTEM }) as HTMLInputElement;
    expect(toggle.disabled).toBe(true);
    expect(requestPermission).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        "Windows tiene bloqueadas las notificaciones de Vantare. Se desbloquean desde los ajustes del sistema.",
      ),
    ).toBeDefined();
  });

  // The stored preference cannot outrank the operating system: permission
  // revoked outside the app has to show as off.
  it("shows off when permission was revoked outside the app", () => {
    vi.stubGlobal("Notification", { permission: "default", requestPermission: vi.fn() });

    render(<Harness />);
    dispatch("settings", {
      cpuSampling: true,
      hotkeys: {},
      notifications: { systemEnabled: true },
    });

    expect((screen.getByRole("checkbox", { name: SYSTEM }) as HTMLInputElement).checked).toBe(false);
  });
});
