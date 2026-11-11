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
import settingsFixture from "../fixtures/settings-base.json";
import type { HostToUi, Request } from "../src/contract/generated/contract";
import { createMockHost } from "../src/mock/host";
import { HostFailure } from "../src/renderer/bridge/client";
import { OnboardingIntroPreview } from "../src/renderer/screens/onboarding/IntroPreview";

const fake = vi.hoisted(() => ({
  request: vi.fn(),
  update: vi.fn(),
  listeners: new Set<(message: HostToUi) => void>(),
  unsubscribe: vi.fn(),
}));
vi.mock("../src/renderer/app/Host", () => ({
  settingsKey: ["settings"],
  useHost: () => ({
    client: {
      request: fake.request,
      addCloseGuard: () => () => {},
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
  return { useSettings: () => ({ view, pending: false, update: fake.update }) };
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
function mount(extended = false, full = false) {
  const complete = vi.fn();
  const leave = vi.fn();
  const query = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  query.setQueryData(["settings"], settingsFixture);
  const view = render(
    <QueryClientProvider client={query}>
      <OnboardingIntroPreview
        onLeave={leave}
        extended={extended}
        full={full}
        onComplete={complete}
      />
    </QueryClientProvider>,
  );
  return { leave, complete, query, ...view };
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
  expect(screen.getByRole("status").textContent).toContain(
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

function respond(scene: string) {
  const host = createMockHost(scene);
  let id = 0;
  fake.request.mockImplementation(async (request: Request) => {
    const reply = host({ kind: "request", id: ++id, request });
    if (reply?.kind === "failure") throw new HostFailure(reply.error);
    if (reply?.kind !== "response") throw new Error("response missing");
    return reply.result;
  });
}
it("preserves choices through consent and finishes an absent layout once on double click", async () => {
  respond("onboarding-sin-diseno");
  const { complete } = mount(true, true);
  const start = await screen.findByRole("button", { name: "Empezar" });
  await waitFor(() => expect(start.hasAttribute("disabled")).toBe(false));
  fireEvent.click(start);
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  fireEvent.click(screen.getByRole("button", { name: "Ligas" }));
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  fireEvent.click(screen.getByRole("button", { name: "Ahora no" }));
  fireEvent.click(screen.getByRole("radio", { name: "Ahorro" }));
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  const finish = await screen.findByRole("button", { name: "Terminar" });
  await waitFor(() => expect(finish.hasAttribute("disabled")).toBe(false));
  expect(screen.queryByRole("button", { name: "Saltar" })).toBeNull();
  fireEvent.click(finish);
  const prepare = await screen.findByRole("button", {
    name: "Preparar desde Inicio",
  });
  expect(
    screen.queryByRole("button", { name: "Editar en Overlays Studio" }),
  ).toBeNull();
  expect(screen.getByText("6 widgets · 2 Pro")).toBeTruthy();
  await waitFor(() => expect(prepare.hasAttribute("disabled")).toBe(false));
  fireEvent.click(prepare);
  fireEvent.click(prepare);
  await waitFor(() =>
    expect(fake.request.mock.calls.map(([r]) => r.method)).toContain(
      "onboarding.finish",
    ),
  );
  expect(screen.queryByRole("alert")?.textContent).toBeUndefined();
  await waitFor(() => expect(complete).toHaveBeenCalledWith(false, true));
  const calls = fake.request.mock.calls.map(([request]) => request as Request);
  const writes = calls.filter(
    (request) => request.method === "onboarding.finish",
  );
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({
    level: "economy",
    layoutRevision: null,
    kit: [
      "standings",
      "relative",
      "delta",
      "pedals",
      "racing-flags",
      "head-to-head",
    ],
  });
  expect(
    calls.filter((request) => request.method === "privacy.update"),
  ).toHaveLength(2);
});

it("enters privately only after a failed durable save and an accepted host response", async () => {
  respond("onboarding-error-privacidad");
  const { complete } = mount(true, true);
  const start = await screen.findByRole("button", { name: "Empezar" });
  await waitFor(() => expect(start.hasAttribute("disabled")).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "Saltar" }));
  const finish = await screen.findByRole("button", { name: "Terminar" });
  await waitFor(() => expect(finish.hasAttribute("disabled")).toBe(false));
  expect(
    screen.queryByRole("button", { name: "Entrar sin guardar" }),
  ).toBeNull();
  fireEvent.click(finish);
  const privateButton = await screen.findByRole("button", {
    name: "Entrar sin guardar",
  });
  expect(complete).not.toHaveBeenCalled();
  fireEvent.click(privateButton);
  await waitFor(() => expect(complete).toHaveBeenCalledWith(true, true));
  expect(
    fake.request.mock.calls.filter(
      ([request]) => request.method === "onboarding.skipPrivate",
    ),
  ).toHaveLength(1);
  expect(
    fake.request.mock.calls.some(
      ([request]) => request.method === "onboarding.finish",
    ),
  ).toBe(false);
});

it("requires a nonempty kit after skipping from an empty style selection", async () => {
  respond("onboarding-sin-diseno");
  mount(true, true);
  const start = await screen.findByRole("button", { name: "Empezar" });
  await waitFor(() => expect(start.hasAttribute("disabled")).toBe(false));
  fireEvent.click(start);
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  fireEvent.click(screen.getByRole("button", { name: "Carreras online" }));
  fireEvent.click(screen.getByRole("button", { name: "Saltar" }));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "Selecciona al menos un estilo.",
  );
  expect(
    screen.getByRole("button", { name: "Terminar" }).hasAttribute("disabled"),
  ).toBe(true);
  expect(
    fake.request.mock.calls.some(
      ([request]) => request.method === "privacy.update",
    ),
  ).toBe(false);
});

it("continues from a protected privacy file without deciding, private escape or persisting completion", async () => {
  respond("onboarding-privacidad-protegida");
  const { complete } = mount(true, true);
  const start = await screen.findByRole("button", { name: "Empezar" });
  await waitFor(() => expect(start.hasAttribute("disabled")).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "Saltar" }));
  const proceed = await screen.findByRole("button", {
    name: "Continuar sin enviar datos",
  });
  expect(
    screen.getByText(/El archivo de privacidad está protegido/),
  ).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Terminar" }).hasAttribute("disabled"),
  ).toBe(true);
  expect(
    screen.getByText(
      "Tus permisos están protegidos. Puedes continuar sin enviar datos.",
    ),
  ).toBeTruthy();
  expect(screen.queryByText(/Puedes activarlos si quieres/)).toBeNull();
  expect(screen.queryAllByRole("switch")).toHaveLength(0);
  expect(
    screen.queryByRole("button", { name: "Entrar sin guardar" }),
  ).toBeNull();
  fireEvent.click(proceed);
  await waitFor(() => expect(complete).toHaveBeenCalledWith(false, true));
  expect(
    fake.request.mock.calls.filter(([request]) =>
      [
        "privacy.update",
        "onboarding.skipPrivate",
        "onboarding.finish",
      ].includes(request.method),
    ),
  ).toHaveLength(0);
});

it("rechecks protected privacy before leaving and keeps the wizard when the file becomes readable", async () => {
  respond("onboarding-privacidad-protegida");
  const { complete } = mount(true, true);
  const start = await screen.findByRole("button", { name: "Empezar" });
  await waitFor(() => expect(start.hasAttribute("disabled")).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "Saltar" }));
  const proceed = await screen.findByRole("button", {
    name: "Continuar sin enviar datos",
  });
  const readable = createMockHost("onboarding-sin-diseno")({
    kind: "request",
    id: 1,
    request: { method: "privacy.get" },
  });
  if (readable?.kind !== "response" || readable.result.method !== "privacy.get")
    throw new Error("privacy view missing");
  expect(readable.result.value.protected).toBe(false);
  fake.request.mockResolvedValueOnce(readable.result);
  fireEvent.click(proceed);
  await screen.findByRole("alert");
  expect(complete).not.toHaveBeenCalled();
  expect(
    screen.queryByRole("button", { name: "Continuar sin enviar datos" }),
  ).toBeNull();
  expect(screen.getAllByRole("switch")).toHaveLength(3);
  expect(
    fake.request.mock.calls.filter(([request]) =>
      [
        "privacy.update",
        "onboarding.skipPrivate",
        "onboarding.finish",
      ].includes(request.method),
    ),
  ).toHaveLength(0);
});
