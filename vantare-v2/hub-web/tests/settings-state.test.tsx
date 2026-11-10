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
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReactNode, useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HostProvider, useHost } from "../src/renderer/app/Host";
import { PilotProvider } from "../src/renderer/app/PilotState";
import {
  SettingsProvider,
  useSettings,
} from "../src/renderer/app/SettingsState";
import { Shell } from "../src/renderer/app/Shell";
import { UiProvider, useUi } from "../src/renderer/app/UiState";
import { Client } from "../src/renderer/bridge/client";
import { t } from "../src/renderer/i18n/es";
import { Account } from "../src/renderer/screens/settings/Account";
import { Appearance } from "../src/renderer/screens/settings/Appearance";
import { Diagnostics } from "../src/renderer/screens/settings/Diagnostics";
import { General } from "../src/renderer/screens/settings/General";
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

type Guard = Parameters<Client["setCloseGuard"]>[0];
const caches: QueryClient[] = [];
beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
});
afterEach(() => {
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
                  <PilotProvider>
                    <SettingsProvider>
                      {content}
                      {children}
                    </SettingsProvider>
                  </PilotProvider>
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
function hold(method: "settings.update" | "launcher.favorite") {
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
    expect(pending.calls()).toBe(1);
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
    const hook = mount("ajustes-base", <Shell />);
    await loaded(hook);
    fireEvent.keyDown(window, { key: "l", ctrlKey: true, repeat: true });
    expect(pending.calls()).toBe(0);
    fireEvent.keyDown(window, { key: "l", ctrlKey: true });
    fireEvent.keyDown(window, { key: "l", ctrlKey: true });
    expect(pending.calls()).toBe(1);
    await act(async () => pending.release());
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
    expect(pending.calls()).toBe(1);
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
    expect(pending.calls()).toBe(1);
    await act(async () => pending.release());
  });
  it("keeps the select focusable while its selection is saving", async () => {
    const pending = hold("settings.update");
    const hook = mount("ajustes-base", <Appearance />);
    await loaded(hook);
    const user = userEvent.setup();
    const select = screen.getByRole("combobox", { name: t("appearance.font") });
    await user.click(select);
    await user.click(
      await screen.findByRole("option", { name: t("appearance.segoe") }),
    );
    await waitFor(() => expect(hook.result.current.pending).toBe(true));
    expect(select.hasAttribute("disabled")).toBe(false);
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(document.activeElement).not.toBe(document.body);
    expect(pending.calls()).toBe(1);
    await act(async () => pending.release());
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
      request.mock.calls.some(([value]) => value.method === "shortcuts.get"),
    ).toBe(true);
    expect(
      request.mock.calls.some(
        ([value]) => value.method === "launcher.favorite",
      ),
    ).toBe(false);
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
    const mail = screen.getByRole("switch", { name: t("privacy.mail") });
    await waitFor(() => expect(mail.hasAttribute("disabled")).toBe(false));
    await user.click(mail);
    await waitFor(() => expect(mail.getAttribute("aria-checked")).toBe("true"));
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
  it("does not infer email permission while services are unavailable", async () => {
    const request = vi.spyOn(Client.prototype, "request");
    const hook = mount("ajustes-base", <Privacy />);
    await loaded(hook);
    await screen.findByText(t("privacy.mailUnavailable"));
    const control = screen.getByRole("switch", { name: t("privacy.mail") });
    expect(control.getAttribute("aria-disabled")).toBe("true");
    await userEvent.setup().click(control);
    expect(control.getAttribute("aria-checked")).toBe("false");
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
    const hook = mount("diagnostico-observado", <Diagnostics />);
    await loaded(hook);
    const user = userEvent.setup();
    const prepare = await screen.findByRole("button", {
      name: t("diagnostics.prepare"),
    });
    expect(
      screen
        .getByRole("button", { name: t("diagnostics.copy") })
        .hasAttribute("disabled"),
    ).toBe(true);
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
  it("retains draft when changing tabs and searches without accents", async () => {
    mount("cuenta-base", <Settings />);
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

function RestartVeto() {
  const { client } = useHost();
  useEffect(() => client?.addCloseGuard(() => false), [client]);
  return null;
}
describe("restart feedback", () => {
  it("announces a veto and makes restart available again without a timer", async () => {
    mount(
      "actualizacion-lista",
      <>
        <RestartVeto />
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
        screen
          .getByRole("button", { name: t("updates.restart") })
          .getAttribute("aria-disabled"),
      ).not.toBe("true"),
    );
  });
  it("shows closing after accepted restart until the real window closes", async () => {
    mount("actualizacion-lista", <Updates />);
    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: t("updates.restart") }));
    await screen.findByRole("button", { name: t("updates.restarting") });
  });
});
