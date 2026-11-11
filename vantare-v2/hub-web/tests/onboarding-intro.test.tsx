// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { HostToUi } from "../src/contract/generated/contract";
import { createMockHost } from "../src/mock/host";
import { OnboardingIntroPreview } from "../src/renderer/screens/onboarding/IntroPreview";

const fake = vi.hoisted(() => ({
  request: vi.fn(),
  listeners: new Set<(message: HostToUi) => void>(),
  unsubscribe: vi.fn(),
}));
vi.mock("../src/renderer/app/Host", () => ({
  useHost: () => ({
    client: {
      request: fake.request,
      listen: (listener: (message: HostToUi) => void) => {
        fake.listeners.add(listener);
        return () => fake.listeners.delete(listener);
      },
      subscribe: () => fake.unsubscribe,
    },
  }),
}));
vi.mock("../src/renderer/app/SettingsState", () => ({
  useSettings: () => ({ view: { appearance: { reducedMotion: true } } }),
}));
vi.mock("../src/renderer/app/WindowControls", () => ({
  WindowControls: () => null,
}));
function initial() {
  const loaded = createMockHost("onboarding-sin-diseno")({
    kind: "request",
    id: 1,
    request: { method: "onboarding.get" },
  });
  if (loaded?.kind !== "response" || loaded.result.method !== "onboarding.get")
    throw new Error("view");
  return loaded.result;
}
beforeEach(() => {
  fake.request.mockReset();
  fake.unsubscribe.mockClear();
  fake.listeners.clear();
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function mount() {
  const leave = vi.fn();
  const query = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const view = render(
    <QueryClientProvider client={query}>
      <OnboardingIntroPreview onLeave={leave} />
    </QueryClientProvider>,
  );
  return { leave, query, ...view };
}
it("preserves the user's simulator choice during discovery and removes its subscription", async () => {
  const reply = initial();
  fake.request.mockResolvedValue(reply);
  const view = mount();
  const start = await screen.findByRole("button", {
    name: "Empezar",
  });
  await waitFor(() => expect(start.hasAttribute("disabled")).toBe(false));
  fireEvent.click(start);
  const lmu = screen.getByRole("button", {
    name: "Le Mans Ultimate",
  });
  fireEvent.click(lmu);
  expect(lmu.getAttribute("aria-pressed")).toBe("false");
  fake.request.mockResolvedValue({
    ...reply,
    value: { ...reply.value, simulators: [false, true] },
  });
  await act(async () => {
    for (const listener of fake.listeners)
      listener({
        kind: "event",
        event: {
          topic: "launcher",
          value: {
            revision: "b".repeat(64),
            scanning: false,
            protected: false,
            exists: false,
            resident: false,
            running: false,
            lmuTrigger: null,
            profiles: [],
            apps: [],
          },
        },
      });
  });
  await waitFor(() => expect(fake.request).toHaveBeenCalledTimes(2));
  expect(lmu.getAttribute("aria-pressed")).toBe("false");
  expect(
    screen
      .getByRole("button", { name: "Assetto Corsa Competizione" })
      .getAttribute("aria-pressed"),
  ).toBe("false");
  expect(
    screen.getByRole("button", { name: "Continuar" }).hasAttribute("disabled"),
  ).toBe(true);
  view.unmount();
  expect(fake.listeners.size).toBe(0);
  expect(fake.unsubscribe).toHaveBeenCalled();
});
it("retries a failed read and explains that an unavailable layout will not receive the kit", async () => {
  fake.request
    .mockRejectedValueOnce(new Error("unavailable"))
    .mockResolvedValue(initial());
  const { leave } = mount();
  fireEvent.click(
    await screen.findByRole("button", { name: "Volver a intentar" }),
  );
  const start = screen.getByRole("button", { name: "Empezar" });
  await waitFor(() => expect(start.hasAttribute("disabled")).toBe(false));
  fireEvent.click(start);
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  expect(screen.getByRole("status").textContent).toContain(
    "El kit y el nivel no se aplicarán",
  );
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  expect(leave).toHaveBeenCalledWith(3);
  expect(
    fake.request.mock.calls.every(
      ([request]) => request.method === "onboarding.get",
    ),
  ).toBe(true);
});
