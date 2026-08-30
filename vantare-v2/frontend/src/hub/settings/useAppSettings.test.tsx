import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Events } from "@wailsio/runtime";
import { useAppSettings } from "./useAppSettings";

function Harness() {
  const settings = useAppSettings();
  return (
    <>
      <button onClick={() => settings.setPerformance({ mode: "level", level: 4 })}>save</button>
      <output data-testid="status">{settings.settingsStatus ?? "idle"}</output>
      <output data-testid="level">{settings.appSettings.performance.level}</output>
    </>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useAppSettings correlated saves", () => {
  it("waits for the matching confirmed settings response", () => {
    const handlers = new Map<string, (event: { data: unknown }) => void>();
    vi.spyOn(Events, "On").mockImplementation(((name: string, handler: (event: { data: unknown }) => void) => {
      handlers.set(name, handler);
      return () => handlers.delete(name);
    }) as typeof Events.On);
    const emit = vi.spyOn(Events, "Emit");
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "save" }));
    const saveCall = emit.mock.calls.find(([name]) => name === "settings:save");
    const payload = saveCall?.[1] as { requestId?: string; settings?: { performance: { level: number } } } | undefined;
    expect(payload?.requestId).toBeTruthy();
    expect(payload?.settings?.performance.level).toBe(4);
    expect(screen.getByTestId("status").textContent).toBe("saving");

    act(() => {
      handlers.get("settings-saved")?.({
        data: { requestId: "foreign", settings: { performance: { mode: "level", level: 2 }, hotkeys: {} } },
      });
    });
    expect(screen.getByTestId("status").textContent).toBe("saving");

    act(() => {
      handlers.get("settings-saved")?.({
        data: { requestId: payload?.requestId, settings: { performance: { mode: "level", level: 4 }, hotkeys: {} } },
      });
    });
    expect(screen.getByTestId("status").textContent).toBe("saved");
    expect(screen.getByTestId("level").textContent).toBe("4");
  });
});
