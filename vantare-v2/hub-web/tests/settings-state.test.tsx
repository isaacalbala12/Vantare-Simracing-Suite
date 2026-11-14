// @vitest-environment jsdom
import { CSPProvider } from "@base-ui/react/csp-provider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReactNode, useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CoreStatus,
  LauncherView,
} from "../src/contract/generated/contract";
import { AccountProvider } from "../src/renderer/app/AccountState";
import { coreKey, HostProvider, useHost } from "../src/renderer/app/Host";
import { PilotProvider } from "../src/renderer/app/PilotState";
import {
  SectionRailSlot,
  SectionTabsSlot,
} from "../src/renderer/app/SectionChrome";
import {
  SettingsProvider,
  useSettings,
} from "../src/renderer/app/SettingsState";
import { Shell } from "../src/renderer/app/Shell";
import { UiProvider, useUi } from "../src/renderer/app/UiState";
import { WindowControls } from "../src/renderer/app/WindowControls";
import { Client, HostFailure } from "../src/renderer/bridge/client";
import { appearanceText } from "../src/renderer/i18n/appearance.es";
import { t } from "../src/renderer/i18n/es";
import { privacyText } from "../src/renderer/i18n/privacy.es";
import { Account } from "../src/renderer/screens/settings/Account";
import { Appearance } from "../src/renderer/screens/settings/Appearance";
import { AppearanceRail } from "../src/renderer/screens/settings/AppearanceRail";
import { Diagnostics } from "../src/renderer/screens/settings/Diagnostics";
import { DiagnosticsRail } from "../src/renderer/screens/settings/DiagnosticsRail";
import { General } from "../src/renderer/screens/settings/General";
import { GeneralRail } from "../src/renderer/screens/settings/GeneralRail";
import { Performance } from "../src/renderer/screens/settings/Performance";
import { Privacy } from "../src/renderer/screens/settings/Privacy";
import { Settings } from "../src/renderer/screens/settings/Settings";
import { Shortcuts } from "../src/renderer/screens/settings/Shortcuts";
import { Updates } from "../src/renderer/screens/settings/Updates";
import {
  ToastProvider,
  ToastViewport,
  TooltipProvider,
} from "../src/renderer/ui/Layers";
import { ShellLayout } from "../src/renderer/ui/ShellLayout";

type Guard = Parameters<Client["setCloseGuard"]>[0];
const caches: QueryClient[] = [];
const connections = new Set<Client>();
beforeEach(() => {
  // Native-size window: jsdom's 1024px default cannot reach 100/110/125%.
  vi.stubGlobal("innerWidth", 1920);
  vi.stubGlobal("innerHeight", 1080);
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
});
afterEach(async () => {
  // Settle close-triggered mutation errors while their toast provider still
  // exists, so no notification timer can be created after provider disposal.
  await act(async () => {
    for (const client of connections) client.close();
  });
  await waitFor(() => {
    for (const cache of caches) expect(cache.isMutating()).toBe(0);
  });
  connections.clear();
  cleanup();
  for (const cache of caches) cache.clear();
  caches.length = 0;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
  document.documentElement.removeAttribute("style");
});
function mount(scene = "ajustes-base", content?: ReactNode) {
  window.history.replaceState(null, "", `/?escena=${scene}`);
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  caches.push(cache);
  let guard: Guard | undefined;
  const setGuard = Client.prototype.setCloseGuard;
  vi.spyOn(Client.prototype, "setCloseGuard").mockImplementation(function (
    this: Client,
    value,
  ) {
    guard = value;
    connections.add(this);
    setGuard.call(this, value);
  });
  const hook = renderHook(useSettings, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={cache}>
        <HostProvider>
          <UiProvider>
            <CSPProvider disableStyleElements>
              <TooltipProvider delay={0}>
                <ToastProvider>
                  <AccountProvider>
                    <PilotProvider>
                      <SettingsProvider>
                        {content}
                        {children}
                      </SettingsProvider>
                    </PilotProvider>
                  </AccountProvider>
                  <ToastViewport closeLabel="Cerrar aviso" />
                </ToastProvider>
              </TooltipProvider>
            </CSPProvider>
          </UiProvider>
        </HostProvider>
      </QueryClientProvider>
    ),
  });
  return {
    ...hook,
    guard: (reason: Parameters<Guard>[0]) => {
      if (!guard) throw new Error("Guard not installed");
      return guard(reason);
    },
  };
}
function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
function hold(
  method: "settings.update" | "launcher.favorite" | "launcher.launch",
) {
  const gate = deferred();
  const request = Client.prototype.request;
  const spy = vi
    .spyOn(Client.prototype, "request")
    .mockImplementation(async function (this: Client, value) {
      if (value.method === method) await gate.promise;
      return request.call(this, value);
    });
  return {
    ...gate,
    calls: () =>
      spy.mock.calls.filter(([value]) => value.method === method).length,
  };
}
async function loaded(hook: ReturnType<typeof mount>) {
  await waitFor(() => expect(hook.result.current.view).toBeDefined());
}
async function conflict(hook: ReturnType<typeof mount>) {
  await loaded(hook);
  act(() => hook.result.current.update({ field: "minimized", value: true }));
  await waitFor(() =>
    expect(hook.result.current.error?.detail.kind).toBe("conflict"),
  );
}
function Outside() {
  const navigate = useUi((state) => state.navigate);
  return (
    <button type="button" onClick={() => navigate("home")}>
      Fuera de Ajustes
    </button>
  );
}

describe("SettingsState through createMockHost and a real MessageChannel", () => {
  it("continues zooming on held-key repeats after each write completes", async () => {
    const request = vi.spyOn(Client.prototype, "request");
    const hook = mount("ajustes-con-diseno", <Shell />);
    await loaded(hook);
    fireEvent.keyDown(window, { key: "+", ctrlKey: true });
    await waitFor(() => {
      expect(hook.result.current.view?.zoom).toBe(110);
      expect(hook.result.current.pending).toBe(false);
    });
    fireEvent.keyDown(window, { key: "+", ctrlKey: true, repeat: true });
    await waitFor(() => {
      expect(hook.result.current.view?.zoom).toBe(125);
      expect(hook.result.current.pending).toBe(false);
    });
    fireEvent.keyDown(window, { key: "+", ctrlKey: true, repeat: true });
    expect(
      request.mock.calls.filter(
        ([value]) => value.method === "settings.update",
      ),
    ).toHaveLength(2);
    fireEvent.keyDown(window, { key: "0", ctrlKey: true, repeat: true });
    await waitFor(() => expect(hook.result.current.view?.zoom).toBe(100));
  });
  it("zooms from an editable dialog without moving focus or bypassing the pending write guard", async () => {
    const pending = hold("settings.update");
    const hook = mount("ajustes-con-diseno", <Shell />);
    await loaded(hook);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const dialog = await screen.findByRole("dialog");
    const input = within(dialog).getByRole("combobox");
    input.focus();
    try {
      fireEvent.keyDown(input, { key: "+", code: "NumpadAdd", ctrlKey: true });
      fireEvent.keyDown(input, { key: "+", code: "NumpadAdd", ctrlKey: true });
      await waitFor(() => expect(pending.calls()).toBe(1));
      expect(document.activeElement).toBe(input);
      fireEvent.keyDown(input, { key: "l", ctrlKey: true });
      expect(
        vi
          .mocked(Client.prototype.request)
          .mock.calls.some(
            ([request]) =>
              request.method === "launcher.favorite" ||
              request.method === "launcher.launch",
          ),
      ).toBe(false);
    } finally {
      await act(async () => pending.release());
    }
    await waitFor(() => expect(hook.result.current.view?.zoom).toBe(110));
    expect(document.activeElement).toBe(input);
  });
  it("keeps a failed zoom write guarded while its editable dialog stays open", async () => {
    const request = vi.spyOn(Client.prototype, "request");
    const hook = mount("ajustes-error", <Shell />);
    await loaded(hook);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const dialog = await screen.findByRole("dialog");
    const input = within(dialog).getByRole("combobox");
    input.focus();
    fireEvent.keyDown(input, { key: "+", ctrlKey: true });
    await waitFor(() =>
      expect(hook.result.current.error?.detail.kind).toBe("io"),
    );
    fireEvent.keyDown(input, { key: "-", ctrlKey: true });
    expect(
      request.mock.calls.filter(
        ([request]) => request.method === "settings.update",
      ),
    ).toHaveLength(1);
    expect(dialog.isConnected).toBe(true);
    expect(document.activeElement).toBe(input);
  });
  it("changes only effective zoom on resize and restores the saved request without a write", async () => {
    const request = vi.spyOn(Client.prototype, "request");
    const hook = mount("ajustes-base", <General />);
    await loaded(hook);
    const saved = hook.result.current.view?.zoom;
    act(() => {
      vi.stubGlobal("innerWidth", 1000);
      vi.stubGlobal("innerHeight", 600);
      fireEvent(window, new Event("resize"));
    });
    expect(document.documentElement.style.zoom).toBe("0.9");
    expect(hook.result.current.view?.zoom).toBe(saved);
    act(() => {
      vi.stubGlobal("innerWidth", 1920);
      vi.stubGlobal("innerHeight", 1080);
      fireEvent(window, new Event("resize"));
    });
    expect(document.documentElement.style.zoom).toBe(
      String((saved ?? 100) / 100),
    );
    expect(
      request.mock.calls.filter(
        ([value]) => value.method === "settings.update",
      ),
    ).toHaveLength(0);
  });
  it("rechecks the revision of a painted sidebar button before sending", async () => {
    const request = vi.spyOn(Client.prototype, "request");
    const hook = mount("launcher-ready", <Shell />);
    await loaded(hook);
    const button = (
      await screen.findAllByRole("button", { name: /^Lanzar perfil/ })
    )[0];
    await waitFor(() =>
      expect(caches.at(-1)?.getQueryState(["launcher"])?.fetchStatus).toBe(
        "idle",
      ),
    );
    const cache = caches.at(-1),
      view = structuredClone(cache?.getQueryData<LauncherView>(["launcher"]));
    if (!cache || !view) throw new Error("Missing snapshot");
    view.revision = "f".repeat(64);
    act(() => {
      cache.setQueryData(["launcher"], view);
      fireEvent.click(button);
    });
    expect(
      request.mock.calls.filter(
        ([value]) => value.method === "launcher.launch",
      ),
    ).toHaveLength(0);
    await waitFor(() =>
      expect(document.querySelector(".v-toast")).toBeTruthy(),
    );
  });
  it("accepts the host's conflicting snapshot without retrying a sidebar launch", async () => {
    const hook = mount("launcher-ready", <Shell />);
    await loaded(hook);
    const button = (
      await screen.findAllByRole("button", { name: /^Lanzar perfil/ })
    )[0];
    await waitFor(() =>
      expect(caches.at(-1)?.getQueryState(["launcher"])?.fetchStatus).toBe(
        "idle",
      ),
    );
    const cache = caches.at(-1),
      current = structuredClone(
        cache?.getQueryData<LauncherView>(["launcher"]),
      );
    if (!cache || !current) throw new Error("Missing snapshot");
    current.revision = "e".repeat(64);
    const original = Client.prototype.request;
    const request = vi
      .spyOn(Client.prototype, "request")
      .mockImplementation(async function (this: Client, value) {
        if (value.method === "launcher.launch")
          throw new HostFailure({ kind: "launcherConflict", current });
        if (value.method === "launcher.get")
          return { method: "launcher.get", value: current };
        return original.call(this, value);
      });
    fireEvent.click(button);
    await waitFor(() =>
      expect(cache.getQueryData<LauncherView>(["launcher"])?.revision).toBe(
        current.revision,
      ),
    );
    expect(
      request.mock.calls.filter(
        ([value]) => value.method === "launcher.launch",
      ),
    ).toHaveLength(1);
    expect(document.querySelector(".v-toast")).toBeTruthy();
  });
  it("launches a sidebar profile with its read revision, with one pending guard shared by Ctrl L", async () => {
    const pending = hold("launcher.launch");
    const request = vi.spyOn(Client.prototype, "request");
    const hook = mount("launcher-ready", <Shell />);
    await loaded(hook);
    const button = (
      await screen.findAllByRole("button", { name: /^Lanzar perfil/ })
    )[0];
    await waitFor(() =>
      expect(caches.at(-1)?.getQueryState(["launcher"])?.fetchStatus).toBe(
        "idle",
      ),
    );
    const view = caches.at(-1)?.getQueryData<LauncherView>(["launcher"]);
    if (!view) throw new Error("Missing launcher snapshot");
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.keyDown(window, { key: "l", ctrlKey: true });
    await waitFor(() => expect(pending.calls()).toBe(1));
    expect(
      request.mock.calls.filter(
        ([value]) => value.method === "launcher.favorite",
      ),
    ).toHaveLength(0);
    expect(
      request.mock.calls.find(
        ([value]) => value.method === "launcher.launch",
      )?.[0],
    ).toEqual({
      method: "launcher.launch",
      profile: view.profiles[0].id,
      baseRevision: view.revision,
    });
    await act(async () => pending.release());
  });
  it.each(["live", "unverified", "blocked", "running", "gate"])(
    "does not send sidebar launches with %s",
    async (reason) => {
      const request = vi.spyOn(Client.prototype, "request");
      const hook = mount("launcher-ready", <Shell />);
      await loaded(hook);
      const button = (
        await screen.findAllByRole("button", { name: /^Lanzar perfil/ })
      )[0];
      await waitFor(() =>
        expect(caches.at(-1)?.getQueryState(["launcher"])?.fetchStatus).toBe(
          "idle",
        ),
      );
      const cache = caches.at(-1),
        core = structuredClone(cache?.getQueryData<CoreStatus>(coreKey)),
        view = structuredClone(cache?.getQueryData<LauncherView>(["launcher"]));
      if (!cache || !core || !view) throw new Error("Missing snapshots");
      if (reason === "live") core.live = true;
      if (reason === "unverified") core.access.verified = false;
      if (reason === "blocked") core.access.blocked = true;
      if (reason === "running") view.running = true;
      const gate = document.createElement("dialog");
      if (reason === "gate") {
        gate.open = true;
        document.body.append(gate);
      }
      try {
        act(() => {
          cache.setQueryData(coreKey, core);
          cache.setQueryData(["launcher"], view);
          fireEvent.click(button);
        });
        expect(
          request.mock.calls.filter(
            ([value]) => value.method === "launcher.launch",
          ),
        ).toHaveLength(0);
        await waitFor(() =>
          expect(document.querySelector(".v-toast")).toBeTruthy(),
        );
      } finally {
        gate.remove();
      }
    },
  );
  it("keeps the rail list and count updated after leaving Launcher without duplicate wire watches", async () => {
    const wire = vi.spyOn(MessagePort.prototype, "postMessage");
    const hook = mount("launcher-ready", <Shell />);
    await loaded(hook);
    await screen.findAllByRole("button", { name: /^Lanzar perfil/ });
    const count = (kind: string) =>
      wire.mock.calls.filter(
        ([message]) => message.kind === kind && message.topic === "launcher",
      ).length;
    expect(count("subscribe")).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "Launcher" }));
    await screen.findAllByRole("button", { name: /Nuevo perfil/ });
    fireEvent.click(screen.getByRole("button", { name: "Ajustes" }));
    await screen.findByRole("heading", { name: "General" });
    expect(count("subscribe")).toBe(1);
    expect(count("unsubscribe")).toBe(0);
    const client = [...connections][0],
      view = caches.at(-1)?.getQueryData<LauncherView>(["launcher"]);
    if (!client || !view) throw new Error("Missing connection/snapshot");
    await act(async () => {
      await client.request({
        method: "launcher.profile.duplicate",
        id: view.profiles[0].id,
        baseRevision: view.revision,
      });
    });
    await waitFor(() =>
      expect(document.querySelectorAll(".v-sidebar-profile")).toHaveLength(
        view.profiles.length + 1,
      ),
    );
    expect(document.querySelector(".v-nav-count")?.textContent).toBe(
      String(view.profiles.length + 1),
    );
  });
  it.each([
    "noSteps",
    "noResident",
    "scanning",
    "loading",
    "readFailed",
    "unlaunchable",
  ])("does not send a rail launch and explains %s", async (reason) => {
    const request = vi.spyOn(Client.prototype, "request");
    const hook = mount("launcher-ready", <Shell />);
    await loaded(hook);
    const button = (
      await screen.findAllByRole("button", { name: /^Lanzar perfil/ })
    )[0];
    const cache = caches.at(-1);
    if (!cache) throw new Error("Missing cache");
    await waitFor(() =>
      expect(cache.getQueryState(["launcher"])?.fetchStatus).toBe("idle"),
    );
    const view = structuredClone(
      cache.getQueryData<LauncherView>(["launcher"]),
    );
    if (!view) throw new Error("Missing snapshot");
    if (reason === "noSteps") view.profiles[0].apps = [];
    if (reason === "noResident") view.resident = false;
    if (reason === "scanning") view.scanning = true;
    if (reason === "unlaunchable") view.profiles[0].launchable = false;
    act(() => {
      cache.setQueryData(["launcher"], view);
      const query = cache
        .getQueryCache()
        .find({ queryKey: ["launcher"], exact: true });
      if (!query) throw new Error("Missing query");
      if (reason === "loading") query.setState({ fetchStatus: "fetching" });
      if (reason === "readFailed")
        query.setState({
          status: "error",
          error: new Error("QA read failure"),
        });
      fireEvent.click(button);
    });
    expect(
      request.mock.calls.filter(
        ([value]) => value.method === "launcher.launch",
      ),
    ).toHaveLength(0);
    const labels = {
      noSteps: "Este perfil no tiene pasos de lanzamiento",
      noResident: "El Launcher no está disponible",
      scanning: "Buscando aplicaciones del perfil…",
      loading: "Leyendo los perfiles del Launcher…",
      readFailed:
        "No se pudieron leer los perfiles. Cierra y vuelve a abrir la paleta para reintentar.",
      unlaunchable: "Este perfil tiene aplicaciones pendientes de configurar",
    };
    await waitFor(() =>
      expect(document.querySelector(".v-toast")?.textContent).toContain(
        labels[reason as keyof typeof labels],
      ),
    );
  });
  it("does not change the selected profile when the host declines a rail launch", async () => {
    const original = Client.prototype.request;
    vi.spyOn(Client.prototype, "request").mockImplementation(function (
      this: Client,
      value,
    ) {
      if (value.method === "launcher.launch")
        return Promise.resolve({ method: "launcher.launch", accepted: false });
      return original.call(this, value);
    });
    const hook = mount("launcher-ready", <Shell />);
    await loaded(hook);
    const button = (
      await screen.findAllByRole("button", { name: /^Lanzar perfil/ })
    )[0];
    const cache = caches.at(-1);
    if (!cache) throw new Error("Missing cache");
    await waitFor(() =>
      expect(cache.getQueryState(["launcher"])?.fetchStatus).toBe("idle"),
    );
    cache.setQueryData(["launcher", "selection"], "keep-selection");
    fireEvent.click(button);
    await waitFor(() =>
      expect(document.querySelector(".v-toast")?.textContent).toContain(
        "No se pudo lanzar el perfil",
      ),
    );
    expect(cache.getQueryData(["launcher", "selection"])).toBe(
      "keep-selection",
    );
  });
  it.each(["rail", "screen"])(
    "shares a pending launch lease when %s is clicked first",
    async (first) => {
      const gate = hold("launcher.launch");
      const hook = mount("launcher-ready", <Shell />);
      await loaded(hook);
      await screen.findAllByRole("button", { name: /^Lanzar perfil/ });
      fireEvent.click(screen.getByRole("button", { name: "Launcher" }));
      await waitFor(() =>
        expect(document.querySelector(".v-launcher-launch")).toBeTruthy(),
      );
      const launch =
        document.querySelector<HTMLButtonElement>(".v-launcher-launch");
      if (!launch) throw new Error("Missing Launcher launch button");
      const rail = screen.getAllByRole("button", { name: /^Lanzar perfil/ })[0];
      await waitFor(() =>
        expect(caches.at(-1)?.getQueryState(["launcher"])?.fetchStatus).toBe(
          "idle",
        ),
      );
      try {
        act(() => {
          fireEvent.click(first === "rail" ? rail : launch);
          fireEvent.click(first === "rail" ? launch : rail);
        });
        await waitFor(() => expect(gate.calls()).toBe(1));
      } finally {
        await act(async () => gate.release());
      }
    },
  );
  it("explains a failed favorite request using its own action text", async () => {
    const original = Client.prototype.request;
    vi.spyOn(Client.prototype, "request").mockImplementation(function (
      this: Client,
      value,
    ) {
      if (value.method === "launcher.favorite")
        return Promise.reject(new HostFailure({ kind: "io" }));
      return original.call(this, value);
    });
    const hook = mount("launcher-ready", <Shell />);
    await loaded(hook);
    fireEvent.keyDown(window, { key: "l", ctrlKey: true });
    await waitFor(() =>
      expect(document.querySelector(".v-toast")?.textContent).toContain(
        t("shell.favoriteFailed"),
      ),
    );
  });
  it("retries only the losing intent and preserves the winner", async () => {
    const hook = mount("ajustes-conflicto");
    await conflict(hook);
    expect(hook.result.current.view?.general.updates).toBe(false);
    expect(await hook.guard("window")).toBe(false);
    await act(async () => hook.result.current.retry());
    await waitFor(() =>
      expect(hook.result.current.view?.general.minimized).toBe(true),
    );
    expect(hook.result.current.view?.general.updates).toBe(false);
    expect(hook.result.current.error).toBeUndefined();
    expect(await hook.guard("window")).toBe(true);
  });
  it("discards a failed intent without writing it", async () => {
    const hook = mount("ajustes-conflicto");
    await conflict(hook);
    await act(async () => hook.result.current.discard());
    await waitFor(() => expect(hook.result.current.error).toBeUndefined());
    expect(hook.result.current.view?.general.minimized).toBe(false);
    expect(hook.result.current.view?.general.updates).toBe(false);
    expect(await hook.guard("window")).toBe(true);
  });
  it("allows Live to close and forgets a failed intent", async () => {
    const hook = mount("ajustes-conflicto");
    await conflict(hook);
    expect(await hook.guard("window")).toBe(false);
    let allowed: boolean | undefined;
    await act(async () => {
      allowed = await hook.guard("live");
    });
    expect(allowed).toBe(true);
    expect(hook.result.current.error).toBeUndefined();
    expect(hook.result.current.view?.general.minimized).toBe(false);
    expect(await hook.guard("window")).toBe(true);
  });
  it.each(["ajustes-error", "ajustes-protegidos"])(
    "announces %s without overwriting the confirmed value",
    async (scene) => {
      const hook = mount(scene);
      await loaded(hook);
      act(() =>
        hook.result.current.update({ field: "minimized", value: true }),
      );
      await waitFor(() =>
        expect(hook.result.current.error?.detail.kind).toBe(
          scene === "ajustes-error" ? "io" : "protected",
        ),
      );
      expect(hook.result.current.view?.general.minimized).toBe(false);
      expect(await hook.guard("window")).toBe(false);
      expect(
        (
          await screen.findAllByText(
            scene === "ajustes-error"
              ? t("settings.failed")
              : t("settings.protected"),
          )
        ).length,
      ).toBeGreaterThan(0);
    },
  );
  it("does not send another update while a request is busy", async () => {
    const pending = hold("settings.update");
    const hook = mount();
    await loaded(hook);
    act(() => {
      hook.result.current.update({ field: "minimized", value: true });
      hook.result.current.update({ field: "palette", value: "rose" });
    });
    await waitFor(() => expect(hook.result.current.pending).toBe(true));
    await waitFor(() => expect(pending.calls()).toBe(1));
    await act(async () => pending.release());
    await waitFor(() =>
      expect(hook.result.current.view?.general.minimized).toBe(true),
    );
    expect(hook.result.current.view?.appearance.palette).toBe("vantare");
  });
  it("keeps an error and recovery actions visible outside Settings", async () => {
    const hook = mount(
      "ajustes-error",
      <>
        <Outside />
        <Shell />
      </>,
    );
    await loaded(hook);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Fuera de Ajustes" }));
    fireEvent.keyDown(window, { key: "=", ctrlKey: true });
    await waitFor(() =>
      expect(hook.result.current.error?.detail.kind).toBe("io"),
    );
    expect(
      screen.getByRole("button", { name: t("settings.retry") }),
    ).toBeDefined();
    expect(
      screen.getByRole("button", { name: t("settings.discard") }),
    ).toBeDefined();
    expect(screen.getAllByText(t("settings.failed")).length).toBeGreaterThan(1);
    await user.click(
      screen.getByRole("button", { name: t("settings.discard") }),
    );
    await waitFor(() => expect(hook.result.current.error).toBeUndefined());
  });
  it("does not relaunch a favorite on repeated keydown or while pending", async () => {
    const pending = hold("launcher.favorite");
    const hook = mount("launcher-ready", <Shell />);
    await loaded(hook);
    fireEvent.keyDown(window, { key: "l", ctrlKey: true, repeat: true });
    expect(pending.calls()).toBe(0);
    fireEvent.keyDown(window, { key: "l", ctrlKey: true });
    fireEvent.keyDown(window, { key: "l", ctrlKey: true });
    await waitFor(() => expect(pending.calls()).toBe(1));
    await act(async () => pending.release());
  });
  it("does not dispatch the favorite shortcut without verified access", async () => {
    const pending = hold("launcher.favorite");
    const hook = mount("ajustes-base", <Shell />);
    await loaded(hook);
    fireEvent.keyDown(window, { key: "l", ctrlKey: true });
    expect(pending.calls()).toBe(0);
  });
  it("never launches with extended modifiers or AltGr, with a positive Ctrl L control", async () => {
    const pending = hold("launcher.favorite");
    const hook = mount("launcher-ready", <Shell />);
    await loaded(hook);
    fireEvent.keyDown(window, { key: "l", ctrlKey: true, altKey: true });
    fireEvent.keyDown(window, { key: "l", ctrlKey: true, shiftKey: true });
    const altGr = new KeyboardEvent("keydown", {
      key: "@",
      ctrlKey: true,
      altKey: true,
      cancelable: true,
    });
    window.dispatchEvent(altGr);
    expect(altGr.defaultPrevented).toBe(false);
    expect(pending.calls()).toBe(0);
    fireEvent.keyDown(window, { key: "l", ctrlKey: true });
    await waitFor(() => expect(pending.calls()).toBe(1));
    await act(async () => pending.release());
  });
  it("does not toggle the sidebar or palette again when a key is held", async () => {
    const hook = mount("launcher-ready", <Shell />);
    await loaded(hook);
    const sidebar = () => document.querySelector(".v-sidebar")?.className;
    const before = sidebar();
    fireEvent.keyDown(window, { key: "b", ctrlKey: true });
    const after = sidebar();
    expect(after).not.toBe(before);
    fireEvent.keyDown(window, { key: "b", ctrlKey: true, repeat: true });
    expect(sidebar()).toBe(after);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    await waitFor(() =>
      expect(document.querySelector("[data-command-palette]")).toBeTruthy(),
    );
    fireEvent.keyDown(window, { key: "k", ctrlKey: true, repeat: true });
    expect(document.querySelector("[data-command-palette]")).toBeTruthy();
  });
});

describe("saving keeps keyboard controls focusable", () => {
  it("keeps radio focus through two arrows and ignores changes while pending", async () => {
    const pending = hold("settings.update");
    const hook = mount("ajustes-base", <Appearance />);
    await loaded(hook);
    const group = screen.getByRole("radiogroup", {
      name: t("appearance.scheme"),
    });
    const radio = screen.getByRole("radio", {
      name: t("appearance.dark"),
    });
    radio.focus();
    await userEvent.setup().keyboard("{ArrowLeft}{ArrowLeft}");
    expect(group.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(document.body);
    await waitFor(() => expect(pending.calls()).toBe(1));
    await act(async () => pending.release());
    await waitFor(() => expect(hook.result.current.pending).toBe(false));
  });
  it("keeps segmented focus through two arrows while saving", async () => {
    const pending = hold("settings.update");
    const hook = mount("ajustes-base", <General />);
    await loaded(hook);
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: t("general.compact") }),
    );
    await waitFor(() => expect(hook.result.current.pending).toBe(true));
    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(
      screen
        .getByRole("group", { name: t("general.density") })
        .contains(document.activeElement),
    ).toBe(true);
    await waitFor(() => expect(pending.calls()).toBe(1));
    await act(async () => pending.release());
  });
  it("keeps the interface font segmented control focusable through two arrows", async () => {
    const pending = hold("settings.update");
    const hook = mount("ajustes-base", <Appearance />);
    await loaded(hook);
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: t("appearance.segoe") }),
    );
    await waitFor(() => expect(hook.result.current.pending).toBe(true));
    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(
      screen
        .getByRole("group", { name: t("appearance.font") })
        .contains(document.activeElement),
    ).toBe(true);
    await waitFor(() => expect(pending.calls()).toBe(1));
    await act(async () => pending.release());
  });
  it("keeps the select focusable while its selection is saving", async () => {
    const pending = hold("settings.update");
    const hook = mount("ajustes-base", <Appearance />);
    await loaded(hook);
    const user = userEvent.setup();
    const select = screen.getByRole("combobox", {
      name: t("appearance.monoFont"),
    });
    await user.click(select);
    await user.click(
      await screen.findByRole("option", { name: t("appearance.consolas") }),
    );
    await waitFor(() => expect(hook.result.current.pending).toBe(true));
    expect(select.hasAttribute("disabled")).toBe(false);
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(document.activeElement).not.toBe(document.body);
    await waitFor(() => expect(pending.calls()).toBe(1));
    await act(async () => pending.release());
  });
});

describe("visual QA avatar projection", () => {
  it("loads the demo name without requiring a visit to Account", async () => {
    const request = vi.spyOn(Client.prototype, "request");
    const hook = mount("visual-dark:ajustes-con-diseno", <Shell />);
    await loaded(hook);
    expect((await screen.findByLabelText("Isaac Albalá")).textContent).toBe(
      "IA",
    );
    expect(screen.getByRole("heading", { name: /^General$/ })).toBeTruthy();
    expect(
      request.mock.calls.some(([request]) => request.method === "pilot.load"),
    ).toBe(false);
  });
});

describe("Appearance context preview", () => {
  it("reads the saved profile without launching or writing anything", async () => {
    const request = vi.spyOn(Client.prototype, "request");
    const hook = mount("ajustes-base", <AppearanceRail />);
    await loaded(hook);
    await screen.findByText("Creador de Contenido");
    expect(screen.getByText(appearanceText.apps(3))).toBeTruthy();
    expect(
      request.mock.calls.filter(([value]) => value.method === "launcher.get"),
    ).toHaveLength(1);
    expect(
      request.mock.calls.some(([value]) =>
        [
          "launcher.launch",
          "launcher.favorite",
          "profile.save",
          "settings.update",
        ].includes(value.method),
      ),
    ).toBe(false);
  });
  it("does not project profile details from a protected Launcher", async () => {
    const hook = mount("launcher-protected", <AppearanceRail />);
    await loaded(hook);
    await screen.findByText(appearanceText.noProfile);
    expect(screen.queryByText("Creador de Contenido")).toBeNull();
  });
});

describe("Rendimiento y atajos over the simulated host", () => {
  it("saves the global level, keeps focus through pending arrows and reads it back", async () => {
    const gate = hold("settings.update");
    const hook = mount("ajustes-con-diseno", <Performance />);
    await loaded(hook);
    const radio = screen.getByRole("radio", { name: t("track.balanced") });
    radio.focus();
    await userEvent.setup().keyboard("{ArrowRight}{ArrowRight}");
    expect(gate.calls()).toBe(1);
    expect(document.activeElement).not.toBe(document.body);
    await act(async () => gate.release());
    await waitFor(() =>
      expect(hook.result.current.view?.track.level).toBe("economy"),
    );
  });
  it("saves hide off track independently of other preferences", async () => {
    const hook = mount("ajustes-con-diseno", <General />);
    await loaded(hook);
    await userEvent
      .setup()
      .click(screen.getByRole("switch", { name: t("track.hide") }));
    await waitFor(() =>
      expect(hook.result.current.view?.track.hideOffTrack).toBe(true),
    );
    expect(hook.result.current.view?.general.density).toBe("balanced");
  });
  it("reads profile shortcuts without launching or registering them", async () => {
    const request = vi.spyOn(Client.prototype, "request");
    const hook = mount("ajustes-base", <Shortcuts />);
    await loaded(hook);
    await screen.findByText("Ctrl Alt F8");
    expect(
      screen.getByRole("heading", { name: "01 Globales con el juego" }),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "02 En el Hub" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "03 En Studio" })).toBeNull();
    for (const action of [
      "save",
      "undo",
      "redo",
      "duplicate",
      "delete",
      "move",
    ] as const)
      expect(screen.queryByText(t(`shortcuts.${action}`))).toBeNull();
    expect(screen.getByText("Buscar en Vantare")).toBeTruthy();
    for (const label of ["Ctrl +", "Ctrl −", "Ctrl 0", "Ctrl Mayús N"])
      expect(screen.getByText(label)).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: t("settings.reload") }),
    ).toBeNull();
    expect(screen.queryByText(t("general.zoom"))).toBeNull();
    expect(
      request.mock.calls.some(([value]) => value.method === "shortcuts.get"),
    ).toBe(true);
    expect(
      request.mock.calls.some(
        ([value]) => value.method === "launcher.favorite",
      ),
    ).toBe(false);
  });
});

describe("shortcut reference state", () => {
  it("shows the native empty profile row only in visual QA", async () => {
    const hook = mount("visual-dark:ajustes-con-diseno", <Shortcuts />);
    await loaded(hook);
    await screen.findByText("Atajos de perfiles");
    expect(screen.getByText(t("shortcuts.empty"))).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: t("shortcuts.edit") }),
    ).toHaveLength(1);
    expect(screen.queryByText("Ctrl Alt F8")).toBeNull();
  });
});

describe("layout availability and shortcut read failures", () => {
  it("waits for the core's initial layout without sending a write", async () => {
    const request = vi.spyOn(Client.prototype, "request");
    const hook = mount("ajustes-base", <Performance />);
    await loaded(hook);
    await screen.findByText(t("track.waiting"));
    const option = screen.getByRole("radio", { name: t("track.economy") });
    expect(option.getAttribute("aria-disabled")).toBe("true");
    await userEvent.setup().click(option);
    expect(
      request.mock.calls.filter(
        ([value]) => value.method === "settings.update",
      ),
    ).toHaveLength(0);
  });
  it("does not edit a protected layout", async () => {
    const hook = mount("ajustes-layout-protegido", <Performance />);
    await loaded(hook);
    await screen.findByText(t("track.protected"));
    expect(
      screen
        .getByRole("radio", { name: t("track.economy") })
        .getAttribute("aria-disabled"),
    ).toBe("true");
  });
  it("shows shortcut failures with an explicit reload action", async () => {
    const hook = mount("atajos-error", <Shortcuts />);
    await loaded(hook);
    await screen.findByText(t("shortcuts.protected"));
    expect(
      screen.getAllByRole("button", { name: t("settings.reload") }).length,
    ).toBeGreaterThan(0);
  });
  it("keeps level keyboard focus even with the core offline", async () => {
    const hook = mount("ajustes-con-diseno", <Performance />);
    await loaded(hook);
    const radio = screen.getByRole("radio", { name: t("track.balanced") });
    radio.focus();
    await userEvent.setup().keyboard("{ArrowRight}");
    expect(document.activeElement).not.toBe(document.body);
    await waitFor(() =>
      expect(hook.result.current.view?.track.level).toBe("economy"),
    );
  });
});

describe("Actualizaciones over the simulated host", () => {
  it("reads staged information and sends one restart request", async () => {
    const request = vi.spyOn(Client.prototype, "request");
    const hook = mount("actualizacion-lista", <Updates />);
    await loaded(hook);
    const button = await screen.findByRole("button", {
      name: t("updates.restart"),
    });
    await userEvent.setup().click(button);
    await waitFor(() =>
      expect(
        request.mock.calls.filter(
          ([value]) => value.method === "updates.restart",
        ),
      ).toHaveLength(1),
    );
  });
  it("announces a vetoed restart inline without covering the page", async () => {
    let veto: Parameters<Client["onCloseVeto"]>[0] | undefined;
    vi.spyOn(Client.prototype, "onCloseVeto").mockImplementation((listener) => {
      veto = listener;
      return () => {};
    });
    const hook = mount("actualizacion-lista", <Updates />);
    await loaded(hook);
    await screen.findByRole("button", { name: t("updates.restart") });
    act(() => veto?.("restart"));
    expect(screen.getByText(t("updates.restartVeto"))).toBeTruthy();
    expect(
      screen.getByRole("region", { name: t("updates.installed") }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: t("updates.restart") }),
    ).toBeTruthy();
  });
  it("shows a read error and keeps reload available", async () => {
    const hook = mount("actualizacion-error", <Updates />);
    await loaded(hook);
    await screen.findByText(t("updates.invalid"));
    expect(
      screen.getByRole("button", { name: t("settings.reload") }),
    ).toBeDefined();
    expect(
      screen.queryByRole("button", { name: t("updates.restart") }),
    ).toBeNull();
  });
  it("does not offer installation in a development checkout", async () => {
    const hook = mount("ajustes-base", <Updates />);
    await loaded(hook);
    await screen.findByText(t("updates.development"));
    expect(
      screen.queryByRole("button", { name: t("updates.restart") }),
    ).toBeNull();
  });
  it("vetoes restart if a settings save failed but permits Live", async () => {
    const hook = mount("ajustes-error");
    await loaded(hook);
    act(() => hook.result.current.update({ field: "minimized", value: true }));
    await waitFor(() => expect(hook.result.current.error).toBeDefined());
    expect(await hook.guard("restart")).toBe(false);
    expect(await hook.guard("live")).toBe(true);
  });
});

describe("Privacidad and Diagnóstico over the simulated host", () => {
  it("keeps choices reachable during a transient cleanup lock", async () => {
    mount("privacidad-limpieza-ocupada", <Privacy />);
    await screen.findByText(t("privacy.cleanupBusy"));
    const choice = screen.getByRole("switch", { name: t("privacy.crashes") });
    expect(choice.hasAttribute("disabled")).toBe(false);
    await userEvent.setup().click(choice);
    await waitFor(() =>
      expect(choice.getAttribute("aria-checked")).toBe("true"),
    );
    expect(screen.queryByText(t("privacy.cleanupBusy"))).toBeNull();
  });
  it("acknowledges a durable choice with cleanup pending without conflict or unsaved guard", async () => {
    const hook = mount("privacidad-limpieza-error", <Privacy />);
    const choice = await screen.findByRole("switch", {
      name: t("privacy.crashes"),
    });
    await userEvent.setup().click(choice);
    await screen.findAllByText(t("privacy.cleanup"));
    expect(choice.getAttribute("aria-checked")).toBe("true");
    expect(screen.queryByText(t("privacy.conflict"))).toBeNull();
    expect(await hook.guard("window")).toBe(true);
  });
  it("saves an explicit local choice without enabling the other permission", async () => {
    const hook = mount("privacidad-mail", <Privacy />);
    await loaded(hook);
    const user = userEvent.setup();
    const crashes = await screen.findByRole("switch", {
      name: t("privacy.crashes"),
    });
    await user.click(crashes);
    await waitFor(() =>
      expect(crashes.getAttribute("aria-checked")).toBe("true"),
    );
    expect(
      screen
        .getByRole("switch", { name: t("privacy.usage") })
        .getAttribute("aria-checked"),
    ).toBe("false");
    const mail = await screen.findByRole("button", {
      name: privacyText.enable,
    });
    await waitFor(() =>
      expect(mail.getAttribute("aria-disabled")).not.toBe("true"),
    );
    await user.click(mail);
    await screen.findByRole("button", { name: privacyText.disable });
  });
  it("loads the visual settings session email choice and keeps its actions keyboard usable", async () => {
    const request = vi.spyOn(Client.prototype, "request");
    const hook = mount("visual-dark:ajustes-con-diseno", <Privacy />);
    await loaded(hook);
    await screen.findByText(privacyText.optional);
    expect(screen.queryByText(privacyText.signIn)).toBeNull();
    const enable = screen.getByRole("button", { name: privacyText.enable });
    const refresh = screen.getByRole("button", { name: privacyText.refresh });
    const policy = screen.getByRole("button", { name: t("privacy.policy") });
    for (const button of [enable, refresh, policy]) {
      expect(button.getAttribute("aria-disabled")).not.toBe("true");
      expect(button.hasAttribute("disabled")).toBe(false);
    }
    const user = userEvent.setup();
    enable.focus();
    await user.keyboard("{Enter}");
    await screen.findByRole("button", { name: privacyText.disable });
    await user.click(refresh);
    await waitFor(() =>
      expect(refresh.getAttribute("aria-disabled")).not.toBe("true"),
    );
    expect(
      request.mock.calls.filter(([value]) => value.method === "mail.get")
        .length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      request.mock.calls
        .filter(([value]) => value.method === "mail.set")
        .map(([value]) => value),
    ).toEqual([{ method: "mail.set", consent: true, source: "settings" }]);
    for (const label of ["privacy.crashes", "privacy.usage"] as const)
      expect(
        screen
          .getByRole("switch", { name: t(label) })
          .getAttribute("aria-checked"),
      ).toBe("false");
    policy.focus();
    expect(document.activeElement).toBe(policy);
  });
  it("keeps the unknown email choice in other visual scenes", async () => {
    const hook = mount("visual-dark:privacidad-uso", <Privacy />);
    await loaded(hook);
    await screen.findByText(privacyText.signIn);
    expect(screen.queryByText(privacyText.optional)).toBeNull();
  });
  it("retries only the failed privacy field after a conflict", async () => {
    const hook = mount("privacidad-conflicto", <Privacy />);
    await loaded(hook);
    const user = userEvent.setup();
    const crashes = await screen.findByRole("switch", {
      name: t("privacy.crashes"),
    });
    await user.click(crashes);
    await screen.findByText(t("privacy.conflict"));
    expect(
      screen
        .getByRole("switch", { name: t("privacy.usage") })
        .getAttribute("aria-checked"),
    ).toBe("true");
    await user.click(screen.getByRole("button", { name: t("settings.retry") }));
    await waitFor(() =>
      expect(crashes.getAttribute("aria-checked")).toBe("true"),
    );
    expect(
      screen
        .getByRole("switch", { name: t("privacy.usage") })
        .getAttribute("aria-checked"),
    ).toBe("true");
  });
  it("protects an unreadable privacy document and reports Busy without changing consent", async () => {
    const hook = mount("privacidad-ocupada", <Privacy />);
    await loaded(hook);
    const crashes = await screen.findByRole("switch", {
      name: t("privacy.crashes"),
    });
    await userEvent.setup().click(crashes);
    await screen.findAllByText(t("privacy.failed"));
    expect(crashes.getAttribute("aria-checked")).toBe("false");
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: t("settings.discard") }));
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: t("settings.retry") }),
      ).toBeNull(),
    );
  });
  it("retries the same email choice after failure and keeps the error visible", async () => {
    const request = vi.spyOn(Client.prototype, "request");
    const hook = mount("privacidad-mail-error", <Privacy />);
    await loaded(hook);
    const enable = await screen.findByRole("button", {
      name: privacyText.enable,
    });
    await waitFor(() =>
      expect(enable.getAttribute("aria-disabled")).not.toBe("true"),
    );
    await userEvent.setup().click(enable);
    await screen.findByText(t("privacy.mailFailed"));
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: privacyText.retry }));
    await waitFor(() =>
      expect(
        request.mock.calls.filter(([value]) => value.method === "mail.set"),
      ).toHaveLength(2),
    );
    for (const [value] of request.mock.calls.filter(
      ([value]) => value.method === "mail.set",
    ))
      expect(value).toEqual({
        method: "mail.set",
        consent: true,
        source: "settings",
      });
  });
  it("shows a refused privacy policy action inline", async () => {
    const hook = mount("ajustes-base", <Privacy />);
    await loaded(hook);
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: t("privacy.policy") }));
    await screen.findByText(t("privacy.policyFailed"));
  });
  it("does not infer email permission while services are unavailable", async () => {
    const request = vi.spyOn(Client.prototype, "request");
    const hook = mount("ajustes-base", <Privacy />);
    await loaded(hook);
    await screen.findByText(t("privacy.mailUnavailable"));
    const control = screen.getByRole("button", { name: privacyText.enable });
    expect(control.getAttribute("aria-disabled")).toBe("true");
    await userEvent.setup().click(control);
    expect(control.textContent).toBe(privacyText.enable);
    expect(
      request.mock.calls.filter(([value]) => value.method === "mail.set"),
    ).toHaveLength(0);
  });
  it("keeps a protected privacy document read only", async () => {
    const request = vi.spyOn(Client.prototype, "request");
    const hook = mount("privacidad-protegida", <Privacy />);
    await loaded(hook);
    await screen.findByText(t("settings.protected"));
    const control = screen.getByRole("switch", { name: t("privacy.crashes") });
    expect(control.getAttribute("aria-disabled")).toBe("true");
    await userEvent.setup().click(control);
    expect(
      request.mock.calls.filter(([value]) => value.method === "privacy.update"),
    ).toHaveLength(0);
  });
  it("prepares an allow-listed report then requests copy", async () => {
    const request = vi.spyOn(Client.prototype, "request");
    const hook = mount(
      "diagnostico-observado",
      <>
        <Diagnostics />
        <DiagnosticsRail />
      </>,
    );
    await loaded(hook);
    const user = userEvent.setup();
    const prepare = await screen.findByRole("button", {
      name: t("diagnostics.prepare"),
    });
    expect(
      screen.queryByRole("button", { name: t("diagnostics.copy") }),
    ).toBeNull();
    await user.click(prepare);
    await screen.findByRole("textbox", { name: t("diagnostics.preview") });
    await user.click(
      screen.getByRole("button", { name: t("diagnostics.copy") }),
    );
    await screen.findByText(t("diagnostics.copied"));
    expect(
      request.mock.calls.filter(
        ([value]) => value.method === "diagnostics.copy",
      ),
    ).toHaveLength(1);
  });
});

describe("window controls over the simulated bridge", () => {
  it("reflects maximize/restore and closes through the existing client guard", async () => {
    const close = vi.spyOn(Client.prototype, "closeWindow");
    const hook = mount("ajustes-base", <WindowControls />);
    await loaded(hook);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Maximizar" }));
    await user.click(await screen.findByRole("button", { name: "Restaurar" }));
    await screen.findByRole("button", { name: "Maximizar" });
    await user.click(screen.getByRole("button", { name: "Cerrar ventana" }));
    expect(close).toHaveBeenCalledOnce();
  });
});

describe("General context rail", () => {
  it("prepares and copies through the host, and opens Updates", async () => {
    const request = vi.spyOn(Client.prototype, "request");
    const onUpdates = vi.fn();
    const hook = mount(
      "diagnostico-observado",
      <GeneralRail onUpdates={onUpdates} />,
    );
    await loaded(hook);
    const copy = await screen.findByRole("button", {
      name: t("diagnostics.copy"),
    });
    expect(copy.hasAttribute("disabled")).toBe(true);
    const user = userEvent.setup();
    const prepare = await screen.findByRole("button", {
      name: t("diagnostics.prepare"),
    });
    await waitFor(() => expect(prepare.hasAttribute("disabled")).toBe(false));
    await user.click(prepare);
    await waitFor(() => expect(copy.hasAttribute("disabled")).toBe(false));
    await user.click(copy);
    await screen.findByText(t("diagnostics.copied"));
    expect(
      request.mock.calls.filter(
        ([value]) => value.method === "diagnostics.prepare",
      ),
    ).toHaveLength(1);
    expect(
      request.mock.calls.filter(
        ([value]) => value.method === "diagnostics.copy",
      ),
    ).toHaveLength(1);
    await user.click(
      screen.getByRole("button", { name: t("settings.updates") }),
    );
    expect(onUpdates).toHaveBeenCalledOnce();
  });
});

describe("pilot editor over the simulated host", () => {
  it("saves with the loaded revision, reloads the ACK and discards later edits", async () => {
    const request = vi.spyOn(Client.prototype, "request");
    mount("cuenta-base", <Account />);
    const name = await screen.findByRole("textbox", { name: t("pilot.name") });
    await waitFor(() =>
      expect((name as HTMLInputElement).value).toBe("Piloto QA"),
    );
    fireEvent.change(name, { target: { value: "Ana QA" } });
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: t("pilot.save") }));
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: t("pilot.save") })
          .hasAttribute("disabled"),
      ).toBe(true),
    );
    expect(
      request.mock.calls.some(
        ([r]) =>
          r.method === "pilot.save" &&
          r.baseRevision === "1" &&
          r.fields.publicName === "Ana QA",
      ),
    ).toBe(true);
    fireEvent.change(name, { target: { value: "Borrador" } });
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: t("pilot.discard") }));
    expect((name as HTMLInputElement).value).toBe("Ana QA");
  });
  it.each(["cuenta-error", "cuenta-ocupada", "cuenta-conflicto"])(
    "preserves the draft after %s and reloads only explicitly",
    async (scene) => {
      mount(scene, <Account />);
      const name = await screen.findByRole("textbox", {
        name: t("pilot.name"),
      });
      fireEvent.change(name, { target: { value: "Borrador QA" } });
      await userEvent
        .setup()
        .click(screen.getByRole("button", { name: t("pilot.save") }));
      await screen.findAllByText(t("pilot.failed"));
      expect((name as HTMLInputElement).value).toBe("Borrador QA");
      await userEvent
        .setup()
        .click(screen.getByRole("button", { name: t("pilot.reload") }));
      await waitFor(() =>
        expect((name as HTMLInputElement).value).toBe("Piloto QA"),
      );
      if (scene === "cuenta-conflicto")
        expect(
          (
            screen.getByRole("textbox", {
              name: t("pilot.team"),
            }) as HTMLInputElement
          ).value,
        ).toBe("Cambio concurrente QA");
    },
  );
  it("retries a stale pilot revision preserving both the draft and concurrent fields", async () => {
    mount("cuenta-conflicto", <Account />);
    const name = await screen.findByRole("textbox", { name: t("pilot.name") });
    fireEvent.change(name, { target: { value: "Mi borrador" } });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: t("pilot.save") }));
    await user.click(
      await screen.findByRole("button", { name: t("pilot.retry") }),
    );
    await screen.findByText(t("pilot.saved"));
    expect((name as HTMLInputElement).value).toBe("Mi borrador");
    expect(
      (
        screen.getByRole("textbox", {
          name: t("pilot.team"),
        }) as HTMLInputElement
      ).value,
    ).toBe("Cambio concurrente QA");
  });
  it.each([
    ["coche", "account"],
    ["garaje", "general"],
    ["HARNESS", "appearance"],
    [" ca\u0301lida ", "appearance"],
    ["cadencia", "performance"],
    [" rollback ", "updates"],
    ["rehacer", "shortcuts"],
    ["posthog", "privacy"],
    ["telemetry", "diagnostics"],
  ] as const)("finds the GPUI synonym %s in %s", async (query, tab) => {
    mount(
      "cuenta-base",
      <ShellLayout header={<SectionTabsSlot />} sidebar={null} rail={null}>
        <Settings />
      </ShellLayout>,
    );
    const search = await screen.findByRole("searchbox", {
      name: t("settings.search"),
    });
    search.focus();
    fireEvent.change(search, { target: { value: query } });
    await waitFor(() => {
      expect(
        screen
          .getByRole("tab", { name: t(`settings.${tab}`) })
          .getAttribute("aria-selected"),
      ).toBe("true");
    });
    expect(document.activeElement).toBe(search);
    expect((search as HTMLInputElement).value).toBe(query);
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: t("settings.clearSearch") }));
    expect(screen.getAllByRole("tab")).toHaveLength(8);
  });
  it("retains draft when changing tabs and searches without accents", async () => {
    mount(
      "cuenta-base",
      <ShellLayout
        header={<SectionTabsSlot />}
        sidebar={null}
        rail={<SectionRailSlot fallback={null} />}
      >
        <Settings />
      </ShellLayout>,
    );
    await screen.findByRole("tab", {
      name: t("settings.account"),
    });
    await userEvent
      .setup()
      .click(screen.getByRole("tab", { name: t("settings.account") }));
    const name = await screen.findByRole("textbox", { name: t("pilot.name") });
    fireEvent.change(name, { target: { value: "Pendiente QA" } });
    await userEvent
      .setup()
      .click(screen.getByRole("tab", { name: t("settings.general") }));
    fireEvent.change(
      screen.getByRole("searchbox", { name: t("settings.search") }),
      { target: { value: "pais" } },
    );
    const restored = await screen.findByRole("textbox", {
      name: t("pilot.name"),
    });
    expect((restored as HTMLInputElement).value).toBe("Pendiente QA");
    fireEvent.change(
      screen.getByRole("searchbox", { name: t("settings.search") }),
      { target: { value: "zzzzzz" } },
    );
    await screen.findByText(t("settings.noResults"));
    await screen.findByText(t("pilot.unsaved"));
    expect(screen.getByText(`${t("settings.results")}: 0`)).toBeTruthy();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: t("settings.clearSearch") }));
    expect(screen.getAllByRole("tab")).toHaveLength(8);
  });
  it("keeps a reachable reload action when the core is disconnected", async () => {
    mount("cuenta-desconectada", <Account />);
    await screen.findByText(t("pilot.unavailable"));
    const reload = screen.getByRole("button", { name: t("settings.reload") });
    reload.focus();
    expect(document.activeElement).toBe(reload);
  });
  it("vetoes ordinary close for a dirty draft but lets Live discard it", async () => {
    const guards: Guard[] = [];
    const add = Client.prototype.addCloseGuard;
    vi.spyOn(Client.prototype, "addCloseGuard").mockImplementation(function (
      this: Client,
      guard,
    ) {
      guards.push(guard);
      return add.call(this, guard);
    });
    mount("cuenta-base", <Account />);
    const name = await screen.findByRole("textbox", { name: t("pilot.name") });
    fireEvent.change(name, { target: { value: "Pendiente" } });
    expect(await guards[0]("window")).toBe(false);
    let allowed = false;
    await act(async () => {
      allowed = await guards[0]("live");
    });
    expect(allowed).toBe(true);
  });
});

function RestartVeto({ guard }: { guard: () => boolean }) {
  const { client } = useHost();
  useEffect(() => client?.addCloseGuard(guard), [client, guard]);
  return null;
}
describe("restart feedback", () => {
  it("shows a vetoed restart instead of discarding another screen edit", async () => {
    const guard = vi.fn(() => false);
    const sent = vi.spyOn(Client.prototype, "send");
    mount(
      "actualizacion-lista",
      <>
        <RestartVeto guard={guard} />
        <Updates />
      </>,
    );
    const restart = await screen.findByRole("button", {
      name: t("updates.restart"),
    });
    await userEvent.setup().click(restart);
    await screen.findByText(t("updates.restartVeto"));
    await waitFor(() =>
      expect(
        sent.mock.calls.some(
          ([message]) => message.kind === "closeAnswer" && !message.allow,
        ),
      ).toBe(true),
    );
    expect(guard).toHaveBeenCalledWith("restart");
    expect(screen.getByText(t("updates.restartVeto"))).toBeTruthy();
  });
  it("shows closing after accepted restart until the real window closes", async () => {
    mount("actualizacion-lista", <Updates />);
    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: t("updates.restart") }));
    await screen.findByRole("button", { name: t("updates.restarting") });
  });
});

describe("honest notification preferences", () => {
  it.each([false, true])(
    "allows changing emitted internal preferences from saved=%s",
    async (saved) => {
      const calls = vi.spyOn(Client.prototype, "request");
      const hook = mount("ajustes-base", <General />);
      await loaded(hook);
      for (const field of ["updates", "launcher"] as const) {
        if (hook.result.current.view?.general[field] !== saved) {
          act(() => hook.result.current.update({ field, value: saved }));
          await waitFor(() =>
            expect(hook.result.current.view?.general[field]).toBe(saved),
          );
        }
      }
      calls.mockClear();
      for (const field of ["updates", "launcher"] as const) {
        const control = screen.getByRole("switch", {
          name: t(`general.${field}`),
        });
        expect(control.getAttribute("aria-checked")).toBe(String(saved));
        expect(control.getAttribute("aria-disabled")).not.toBe("true");
        expect(control.getAttribute("aria-description")).toBe(
          t(`general.${field}Help`),
        );
        expect(screen.getByText(t(`general.${field}Help`))).toBeTruthy();
        fireEvent.click(control);
        await waitFor(() =>
          expect(hook.result.current.view?.general[field]).toBe(!saved),
        );
      }
      expect(
        calls.mock.calls.filter(([r]) => r.method === "settings.update"),
      ).toHaveLength(2);
    },
  );
  it("keeps the Windows switch editable for the manual test and explains its limit", async () => {
    const calls = vi.spyOn(Client.prototype, "request");
    const hook = mount("ajustes-base", <General />);
    await loaded(hook);
    vi.stubGlobal("vantare", { platform: "win32" });
    const control = screen.getByRole("switch", { name: t("general.toasts") });
    expect(control.getAttribute("aria-description")).toBe(
      t("general.toastsHelp"),
    );
    expect(screen.getByText(t("general.toastsHelp"))).toBeTruthy();
    expect(hook.result.current.view?.general.toasts).toBe(true);
    await userEvent.setup().click(control);
    await waitFor(() =>
      expect(hook.result.current.view?.general.toasts).toBe(false),
    );
    expect(
      screen.queryByRole("button", { name: t("general.testNotice") }),
    ).toBeNull();
    await userEvent.setup().click(control);
    await waitFor(() =>
      expect(hook.result.current.view?.general.toasts).toBe(true),
    );
    const test = screen.getByRole("button", { name: t("general.testNotice") });
    await userEvent.setup().click(test);
    await waitFor(() =>
      expect(
        calls.mock.calls.some(([r]) => r.method === "notifications.test"),
      ).toBe(true),
    );
  });
});
