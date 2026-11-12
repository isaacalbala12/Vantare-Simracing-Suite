// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import settings from "../fixtures/settings-base.json";
import { General } from "../src/renderer/screens/settings/General";
import { ToastProvider } from "../src/renderer/ui/Layers";

const fake = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock("../src/renderer/app/SettingsState", () => ({
  useSettings: () => ({
    view: { ...settings, protected: false },
    pending: false,
    update: fake.update,
  }),
}));
vi.mock("../src/renderer/app/Host", () => ({ useHost: () => ({}) }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("enables the two emitted internal preferences and explains the limited Launcher outcome", () => {
  const cache = new QueryClient();
  render(
    <QueryClientProvider client={cache}>
      <ToastProvider>
        <General />
      </ToastProvider>
    </QueryClientProvider>,
  );
  for (const [label, field] of [
    ["Avisos de actualización", "updates"],
    ["Avisos del Launcher", "launcher"],
  ] as const) {
    const control = screen.getByRole("switch", { name: label });
    expect(control.getAttribute("aria-disabled")).not.toBe("true");
    expect(control.hasAttribute("disabled")).toBe(false);
    fireEvent.click(control);
    expect(fake.update).toHaveBeenCalledWith({
      field,
      value: !settings.general[field],
    });
  }
  expect(
    screen.getByText(/El aviso de aplicaciones listas aún no está disponible/),
  ).toBeTruthy();
  expect(screen.getByText(/Este interruptor gobierna todas las notificaciones de Windows del Hub/)).toBeTruthy();
  expect(screen.getByText(/los canales del Calendario se configuran en Calendario › Avisos/)).toBeTruthy();
  cache.clear();
});
