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
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import type {
  HomeView,
  HostToUi,
  Request,
} from "../src/contract/generated/contract";
import corpus from "../src/contract/generated/corpus/home.json";
import * as host from "../src/renderer/app/Host";
import { SectionChromeProvider } from "../src/renderer/app/SectionChrome";
import { UiProvider, useUi } from "../src/renderer/app/UiState";
import type { Client } from "../src/renderer/bridge/client";
import Home from "../src/renderer/screens/home/entry";
import { NotificationsProvider } from "../src/renderer/screens/notifications/NotificationsState";

function RouteProbe() {
  const section = useUi((s) => s.section);
  const navigate = useUi((s) => s.navigate);
  return (
    <>
      <button type="button" onClick={() => navigate("home")}>
        Situar en Inicio
      </button>
      <output aria-label="Sección actual">{section}</output>
    </>
  );
}
const sample = corpus.host[0]?.result;
if (!sample) throw new Error("fixture");
beforeAll(() =>
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  ),
);
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("uses the exact read launcher revision and cancels the Home subscription on exit", async () => {
  const value = structuredClone(sample.value) as HomeView;
  value.revision = "a".repeat(64);
  value.profiles = [
    {
      id: "profile-a",
      name: "Perfil A",
      favorite: true,
      steps: 2,
      lastLaunchedAt: null,
    },
  ];
  value.favorite = "profile-a";
  const listeners = new Set<(message: HostToUi) => void>();
  const unsub = vi.fn();
  let accepted = true;
  const request = vi.fn(async (r: Request) =>
    r.method === "home.get"
      ? { method: r.method, value: structuredClone(value) }
      : r.method === "pilot.load"
        ? { method: r.method, value: { fields: { publicName: "Isaac" } } }
        : { method: r.method, accepted },
  );
  const client = {
    request,
    subscribe: vi.fn(() => unsub),
    listen: (listener: (m: HostToUi) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  } as unknown as Client;
  vi.spyOn(host, "useHost").mockReturnValue({ client });
  const query = new QueryClient();
  query.setQueryData(host.coreKey, {
    ...host.offline,
    access: { ...host.offline.access, verified: true, blocked: false },
  });
  const ui = render(
    <QueryClientProvider client={query}>
      <UiProvider>
        <NotificationsProvider>
          <SectionChromeProvider>
            <Home />
            <RouteProbe />
          </SectionChromeProvider>
        </NotificationsProvider>
      </UiProvider>
    </QueryClientProvider>,
  );
  await userEvent.click(
    await screen.findByRole("button", { name: "Lanzar perfil seleccionado" }),
  );
  expect(request).toHaveBeenCalledWith({
    method: "launcher.launch",
    profile: "profile-a",
    baseRevision: "a".repeat(64),
  });
  value.revision = "b".repeat(64);
  await act(async () => {
    for (const receive of listeners)
      receive({
        kind: "event",
        event: { topic: "home", value: structuredClone(value) },
      });
  });
  await userEvent.click(
    screen.getByRole("button", { name: "Lanzar perfil seleccionado" }),
  );
  expect(request).toHaveBeenLastCalledWith({ method: "home.get" });
  expect(request).toHaveBeenCalledWith({
    method: "launcher.launch",
    profile: "profile-a",
    baseRevision: "b".repeat(64),
  });
  accepted = false;
  await userEvent.click(
    screen.getByRole("button", { name: "Lanzar perfil seleccionado" }),
  );
  const failed =
    "No se pudo lanzar el perfil. Revisa el acceso y el estado de Launcher.";
  expect(await screen.findByText(failed)).toBeTruthy();
  accepted = true;
  await userEvent.click(
    screen.getByRole("button", { name: "Lanzar perfil seleccionado" }),
  );
  await waitFor(() => expect(screen.queryByText(failed)).toBeNull());
  await act(async () => {
    query.setQueryData(host.coreKey, {
      ...host.offline,
      access: { ...host.offline.access, verified: false, blocked: false },
    });
  });
  await userEvent.click(
    screen.getByRole("button", { name: "Situar en Inicio" }),
  );
  expect(screen.getByLabelText("Sección actual").textContent).toBe("home");
  await userEvent.click(screen.getByRole("button", { name: "Abrir Studio" }));
  expect(screen.getByLabelText("Sección actual").textContent).toBe("home");
  ui.unmount();
  expect(unsub).toHaveBeenCalledOnce();
  expect(listeners.size).toBe(0);
});

function harness(request: ReturnType<typeof vi.fn>, query = new QueryClient()) {
  const client = {
    request,
    subscribe: () => () => {},
    listen: () => () => {},
  } as unknown as Client;
  vi.spyOn(host, "useHost").mockReturnValue({ client });
  query.setQueryData(host.coreKey, {
    ...host.offline,
    access: { ...host.offline.access, verified: true, blocked: false },
  });
  render(
    <QueryClientProvider client={query}>
      <UiProvider>
        <NotificationsProvider>
          <SectionChromeProvider>
            <Home />
            <RouteProbe />
          </SectionChromeProvider>
        </NotificationsProvider>
      </UiProvider>
    </QueryClientProvider>,
  );
  return query;
}
it("serializes two launch clicks while the first reply is pending", async () => {
  const value = structuredClone(sample.value) as HomeView;
  value.profiles = [
    { id: "a", name: "A", steps: 1, favorite: true, lastLaunchedAt: null },
  ];
  value.favorite = "a";
  let finish!: (value: unknown) => void;
  const request = vi.fn((r: Request) =>
    r.method === "home.get"
      ? Promise.resolve({ method: r.method, value })
      : r.method === "launcher.launch"
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : Promise.resolve({ method: r.method }),
  );
  harness(request);
  const button = await screen.findByRole("button", {
    name: "Lanzar perfil seleccionado",
  });
  await waitFor(() =>
    expect((button as HTMLButtonElement).disabled).toBe(false),
  );
  act(() => {
    fireEvent.click(button);
    fireEvent.click(button);
  });
  expect(
    request.mock.calls.filter(([r]) => r.method === "launcher.launch"),
  ).toHaveLength(1);
  await act(async () => finish({ method: "launcher.launch", accepted: true }));
});
for (const scenario of ["previous", "during", "protected"] as const) {
  it(`preserves a ${scenario} profile draft when creating the first profile`, async () => {
    const value = structuredClone(sample.value) as HomeView;
    value.profiles = [];
    value.favorite = null;
    value.protected = scenario === "protected";
    const query = new QueryClient();
    const existing = { draft: { name: "Borrador vigente" } };
    if (scenario === "previous")
      query.setQueryData(["launcher", "profileDraft"], existing);
    let finish!: (reply: unknown) => void;
    const request = vi.fn((r: Request) =>
      r.method === "home.get"
        ? Promise.resolve({ method: r.method, value })
        : r.method === "launcher.profile.get"
          ? new Promise((resolve) => {
              finish = resolve;
            })
          : Promise.resolve({ method: r.method }),
    );
    harness(request, query);
    const button = await screen.findByRole("button", {
      name: "Crear mi primer perfil",
    });
    if (scenario === "protected") {
      expect((button as HTMLButtonElement).disabled).toBe(true);
      expect(
        request.mock.calls.some(([r]) => r.method === "launcher.profile.get"),
      ).toBe(false);
      return;
    }
    await userEvent.click(button);
    if (scenario === "during") {
      query.setQueryData(["launcher", "profileDraft"], existing);
      await act(async () =>
        finish({
          method: "launcher.profile.get",
          value: { revision: "a".repeat(64), draft: { steps: [] } },
        }),
      );
    } else {
      expect(
        request.mock.calls.some(([r]) => r.method === "launcher.profile.get"),
      ).toBe(false);
    }
    expect(query.getQueryData(["launcher", "profileDraft"])).toBe(existing);
    await waitFor(() =>
      expect(screen.getByLabelText("Sección actual").textContent).toBe(
        "launcher",
      ),
    );
  });
}
