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
  update: vi.fn(),
  reload: vi.fn(),
  settings: undefined as
    | undefined
    | { view?: unknown; pending?: boolean; error?: string },
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
vi.mock("../src/renderer/app/SettingsState", async () => {
  const { default: settings } = await import("../fixtures/settings-base.json");
  const view = {
    ...settings,
    appearance: { ...settings.appearance, reducedMotion: true },
  };
  return {
    useSettings: () => ({
      view,
      pending: false,
      ...fake.settings,
      update: fake.update,
      reload: fake.reload,
      retry: fake.reload,
    }),
  };
});
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
  fake.reload.mockReset();
  fake.settings = undefined;
  fake.update.mockReset();
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
function mount(extended = false) {
  const leave = vi.fn();
  const query = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const view = render(
    <QueryClientProvider client={query}>
      <OnboardingIntroPreview onLeave={leave} extended={extended} />
    </QueryClientProvider>,
  );
  return {
    leave,
    query,
    ...view,
    account(value: {
      signedIn: boolean;
      checking: boolean;
      blocked: boolean;
      failed?: boolean;
    }) {
      view.rerender(
        <QueryClientProvider client={query}>
          <OnboardingIntroPreview
            extended={extended}
            account={value}
            onLeave={leave}
          />
        </QueryClientProvider>,
      );
    },
  };
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

it("continues through account status, native levels and the reused appearance controls without login", async () => {
  fake.request.mockResolvedValue(initial());
  const { leave } = mount(true);
  const start = await screen.findByRole("button", { name: "Empezar" });
  await waitFor(() => expect(start.hasAttribute("disabled")).toBe(false));
  fireEvent.click(start);
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  expect(
    screen.queryByRole("button", { name: "Continuar con Discord" }),
  ).toBeNull();
  expect(document.querySelector(".v-ob-account > p")?.textContent).toContain(
    "Puedes continuar sin cuenta",
  );
  fireEvent.click(screen.getByRole("button", { name: "Ahora no" }));
  fireEvent.click(screen.getByRole("radio", { name: "Ahorro" }));
  expect(screen.getByRole("heading", { name: "Ahorro" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  fireEvent.click(screen.getByRole("button", { name: "Claro" }));
  expect(fake.update).toHaveBeenCalledWith({ field: "scheme", value: "light" });
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  expect(leave).toHaveBeenCalledWith(6);
  expect(
    fake.request.mock.calls.every(
      ([request]) => request.method === "onboarding.get",
    ),
  ).toBe(true);
});

it("updates the assistant voice when Account changes while the step stays open", async () => {
  fake.request.mockResolvedValue(initial());
  const view = mount(true);
  const start = await screen.findByRole("button", { name: "Empezar" });
  await waitFor(() => expect(start.hasAttribute("disabled")).toBe(false));
  fireEvent.click(start);
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  view.account({ signedIn: true, checking: false, blocked: false });
  expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe(
    "Sesión iniciada. Tu configuración se guarda en este PC.",
  );
  view.account({ signedIn: true, checking: true, blocked: true });
  expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe(
    "Acceso bloqueado",
  );
  view.account({
    signedIn: false,
    checking: false,
    blocked: false,
    failed: true,
  });
  expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe(
    "No se pudo cargar la cuenta.",
  );
});

async function accountPage() {
  const view = mount(true);
  const start = await screen.findByRole("button", { name: "Empezar" });
  await waitFor(() => expect(start.hasAttribute("disabled")).toBe(false));
  fireEvent.click(start);
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  return view;
}
it("keeps Appearance blocked on a missing settings view and offers a reload", async () => {
  fake.settings = { view: undefined };
  fake.request.mockResolvedValue(initial());
  const { leave } = await accountPage();
  fireEvent.click(screen.getByRole("button", { name: "Ahora no" }));
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  const next = screen.getByRole("button", { name: "Continuar" });
  expect(next.hasAttribute("disabled")).toBe(true);
  fireEvent.click(next);
  expect(leave).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Volver a intentar" }));
  expect(fake.reload).toHaveBeenCalledOnce();
});
it.each([true, false])(
  "handles the prices acknowledgement accepted=%s",
  async (accepted) => {
    fake.request.mockImplementation(async (request) =>
      request.method === "onboarding.get"
        ? initial()
        : { method: "onboarding.prices", accepted },
    );
    await accountPage();
    fireEvent.click(screen.getByRole("button", { name: "Elegir Pro" }));
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Elegir Pro" })
          .hasAttribute("disabled"),
      ).toBe(false),
    );
    expect(
      !!screen.queryByText(
        "No se han podido abrir los precios. Vuelve a intentarlo.",
      ),
    ).toBe(!accepted);
  },
);
it("serializes prices clicks, disables all plan actions and resets errors when leaving", async () => {
  let reject!: (error: Error) => void;
  fake.request.mockImplementation((request) =>
    request.method === "onboarding.get"
      ? Promise.resolve(initial())
      : new Promise((_, fail) => {
          reject = fail;
        }),
  );
  await accountPage();
  const pro = screen.getByRole("button", { name: "Elegir Pro" });
  act(() => {
    pro.click();
    pro.click();
  });
  expect(
    fake.request.mock.calls.filter(([r]) => r.method === "onboarding.prices"),
  ).toHaveLength(1);
  for (const name of ["Elegir Pro", "Elegir Pro Plus", /LAUNCH EDITION/])
    expect(screen.getByRole("button", { name }).hasAttribute("disabled")).toBe(
      true,
    );
  await act(async () => reject(new Error("offline")));
  expect(screen.getByRole("alert").textContent).toContain(
    "No se han podido abrir los precios",
  );
  fireEvent.click(screen.getByRole("button", { name: "Ahora no" }));
  fireEvent.click(screen.getByRole("button", { name: "← Atrás" }));
  expect(screen.queryByRole("alert")).toBeNull();
});
it("ignores a late prices error after leaving and reentering Account", async () => {
  let finish!: (reply: unknown) => void;
  fake.request.mockImplementation((request) =>
    request.method === "onboarding.get"
      ? Promise.resolve(initial())
      : new Promise((resolve) => {
          finish = resolve;
        }),
  );
  const view = await accountPage();
  fireEvent.click(screen.getByRole("button", { name: "Elegir Pro" }));
  fireEvent.click(screen.getByRole("button", { name: "Ahora no" }));
  fireEvent.click(screen.getByRole("button", { name: "← Atrás" }));
  await act(async () =>
    finish({ method: "onboarding.prices", accepted: false }),
  );
  expect(screen.queryByRole("alert")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Elegir Pro" }));
  view.unmount();
  await act(async () =>
    finish({ method: "onboarding.prices", accepted: false }),
  );
  expect(
    fake.request.mock.calls.filter(([r]) => r.method === "onboarding.prices"),
  ).toHaveLength(2);
});
