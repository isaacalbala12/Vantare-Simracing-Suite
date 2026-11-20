// @vitest-environment jsdom
import { CSPProvider } from "@base-ui/react/csp-provider";
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
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import updates from "../fixtures/updates-base.json";
import type {
  AccountView,
  CoreStatus,
  HostToUi,
  LauncherView,
  Reply,
  SettingsView,
} from "../src/contract/generated/contract";
import corpus from "../src/contract/generated/corpus.json";
import { AccountProvider, useAccount } from "../src/renderer/app/AccountState";
import { coreKey, HostProvider, settingsKey } from "../src/renderer/app/Host";
import { PilotProvider } from "../src/renderer/app/PilotState";
import { registeredSections } from "../src/renderer/app/ScreenRegistry";
import { SettingsProvider } from "../src/renderer/app/SettingsState";
import { Shell } from "../src/renderer/app/Shell";
import { UiProvider } from "../src/renderer/app/UiState";
import { Client, HostFailure } from "../src/renderer/bridge/client";
import { commandsText as text } from "../src/renderer/i18n/commands.es";
import { zoomText } from "../src/renderer/i18n/zoom.es";
import type { PaletteCommand } from "../src/renderer/ui/CommandPalette";
import { ToastProvider, TooltipProvider } from "../src/renderer/ui/Layers";
import { WindowDialogProvider } from "../src/renderer/ui/WindowDialog";

// Retain the actual rendered callback to reproduce a cache/event change between
// painting a row and dispatching Enter. The real palette and Shell still render.
const driver = vi.hoisted(() => ({ commands: [] as PaletteCommand[] }));
vi.mock("../src/renderer/ui/CommandPalette", async (original) => {
  const actual =
    await original<typeof import("../src/renderer/ui/CommandPalette")>();
  const { createElement } = await import("react");
  return {
    ...actual,
    CommandPalette: (props: Parameters<typeof actual.CommandPalette>[0]) => {
      driver.commands = props.commands;
      return createElement(actual.CommandPalette, props);
    },
  };
});
let cache: QueryClient;
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});
const accountListeners = new Set<(message: HostToUi) => void>();
let showAccountIdentity = false;
let accountState: ReturnType<typeof useAccount>;
function AccountProbe() {
  accountState = useAccount();
  return showAccountIdentity ? (
    <button
      type="button"
      onClick={() => {
        void accountState.act({ method: "account.logout" });
      }}
    >
      Iniciar transición de cierre
    </button>
  ) : null;
}
function publishAccount(patch: Partial<AccountView>) {
  const sample = (corpus.host as HostToUi[]).find(
    (m) => m.kind === "response" && m.result.method === "account.get",
  );
  if (sample?.kind !== "response" || sample.result.method !== "account.get")
    throw Error("missing account fixture");
  const value: AccountView = {
    ...sample.result.value,
    session: "signedIn",
    gate: "none",
    blocked: false,
    verified: true,
    ...patch,
  };
  for (const listener of accountListeners)
    listener({ kind: "event", event: { topic: "account", value } });
}
let postedMethods: string[];
beforeEach(() => {
  postedMethods = [];
  const connect = Client.connect;
  vi.spyOn(Client, "connect").mockImplementation(async () => {
    const client = await connect.call(Client);
    client.observeRequests((event) => {
      if (event.phase === "start") postedMethods.push(event.method);
    });
    return client;
  });
});
beforeEach(() => {
  accountListeners.clear();
  showAccountIdentity = false;
  const listen = Client.prototype.listen;
  vi.spyOn(Client.prototype, "listen").mockImplementation(function (
    this: Client,
    fn,
  ) {
    accountListeners.add(fn);
    const stop = listen.call(this, (message) =>
      fn(
        message.kind === "hello" && showAccountIdentity
          ? { ...message, demo: false }
          : message,
      ),
    );
    return () => {
      accountListeners.delete(fn);
      return stop();
    };
  });
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  window.history.replaceState(null, "", "/?escena=launcher-ready");
  cache = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
});
afterEach(() => {
  cleanup();
  cache.clear();
  expect(postedMethods).not.toContain("launcher.launch");
  expect(postedMethods).not.toContain("launcher.favorite");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});
async function mount() {
  render(
    <QueryClientProvider client={cache}>
      <HostProvider>
        <UiProvider>
          <CSPProvider disableStyleElements>
            <TooltipProvider delay={0}>
              <ToastProvider>
                <AccountProvider>
                  <AccountProbe />
                  <PilotProvider>
                    <SettingsProvider>
                      <WindowDialogProvider>
                        <Shell />
                      </WindowDialogProvider>
                    </SettingsProvider>
                  </PilotProvider>
                </AccountProvider>
              </ToastProvider>
            </TooltipProvider>
          </CSPProvider>
        </UiProvider>
      </HostProvider>
    </QueryClientProvider>,
  );
  await waitFor(
    () =>
      expect(cache.getQueryData<CoreStatus>(coreKey)?.rights).toBe("connected"),
    { timeout: 5000 },
  );
  fireEvent.keyDown(document.body, { key: "k", ctrlKey: true });
  await screen.findByRole("combobox");
  await waitFor(() => {
    expect(cache.getQueryState(["launcher"])?.fetchStatus).toBe("idle");
    expect(
      driver.commands.find(
        (row) => row.id.startsWith("launch-profile:") && !row.disabled,
      ),
    ).toBeTruthy();
  });
  const command = driver.commands.find(
    (row) => row.id.startsWith("launch-profile:") && !row.disabled,
  );
  if (!command) throw new Error("Missing launch command");
  return command;
}
function snapshot() {
  const value = cache.getQueryData<LauncherView>(["launcher"]);
  if (!value) throw new Error("Missing snapshot");
  return structuredClone(value);
}
function launchCalls(spy: {
  mock: { calls: [{ method: string }, ...unknown[]][] };
}) {
  return spy.mock.calls.filter(
    ([request]) => request.method === "launcher.launchChecked",
  );
}

it.each([
  ["Ana María", "AM, cuenta"],
  ["", "Cuenta"],
] as const)(
  "names the account control from the visible initials of %j",
  async (name, expected) => {
    showAccountIdentity = true;
    await mount();
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("combobox")).toBeNull());
    act(() => publishAccount({ name, photo: null }));
    const button = await screen.findByRole("button", {
      name: expected,
    });
    expect(button.classList.contains("v-account-link")).toBe(true);
  },
);

it("the frame never replaces B's published identity with an initial GET from A", async () => {
  showAccountIdentity = true;
  const pending: ((reply: Reply) => void)[] = [];
  const request = Client.prototype.request;
  const calls = vi
    .spyOn(Client.prototype, "request")
    .mockImplementation(function (this: Client, input, onSent) {
      if (input.method === "account.get")
        return new Promise((resolve) => pending.push(resolve));
      return request.call(this, input, onSent);
    });
  await mount();
  act(() => publishAccount({ name: "Cuenta B", photo: null }));
  await screen.findByLabelText("Cuenta B");
  const sample = (corpus.host as HostToUi[]).find(
    (m) => m.kind === "response" && m.result.method === "account.get",
  );
  if (sample?.kind !== "response" || sample.result.method !== "account.get")
    throw Error("missing account fixture");
  const oldAccount = sample.result.value;
  await act(async () => {
    for (const resolve of pending)
      resolve({
        method: "account.get",
        value: {
          ...oldAccount,
          session: "signedIn",
          gate: "none",
          blocked: false,
          name: "Cuenta A",
          photo: null,
        },
      });
  });
  expect(screen.getByLabelText("Cuenta B")).toBeTruthy();
  expect(screen.queryByLabelText("Cuenta A")).toBeNull();
  expect(
    calls.mock.calls.filter(([r]) => r.method === "account.get"),
  ).toHaveLength(1);
  expect(cache.getQueryData(["frame", "account"])).toBeUndefined();
});

it("hides A immediately after logout starts while its signed-in value is still published", async () => {
  showAccountIdentity = true;
  vi.stubGlobal(
    "Image",
    class {
      onload?: () => void;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    },
  );
  const request = Client.prototype.request;
  vi.spyOn(Client.prototype, "request").mockImplementation(function (
    this: Client,
    input,
    onSent,
  ) {
    if (input.method === "account.logout") return new Promise(() => {});
    return request.call(this, input, onSent);
  });
  await mount();
  const photo = "data:image/png;base64,cGhvdG8=";
  await userEvent.setup().keyboard("{Escape}");
  act(() => publishAccount({ name: "Cuenta A", photo }));
  await screen.findByLabelText("Cuenta A");
  await waitFor(() =>
    expect(document.querySelector(`img[src="${photo}"]`)).not.toBeNull(),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Iniciar transición de cierre" }),
  );
  expect(accountState.value?.name).toBe("Cuenta A");
  expect(accountState.value?.session).toBe("signedIn");
  expect(accountState.value?.gate).toBe("none");
  expect(accountState.pending).toBe(true);
  expect(screen.queryByLabelText("Cuenta A")).toBeNull();
  expect(document.querySelector(`img[src="${photo}"]`)).toBeNull();
});

it("hides the account identity while confirmation is pending, then shows B", async () => {
  showAccountIdentity = true;
  await mount();
  act(() => publishAccount({ name: "Cuenta A", photo: null }));
  await screen.findByLabelText("Cuenta A");
  act(() =>
    publishAccount({ name: "Cuenta A", session: "pending", gate: "checking" }),
  );
  expect(screen.queryByLabelText("Cuenta A")).toBeNull();
  act(() => publishAccount({ name: "Cuenta B", photo: null }));
  await screen.findByLabelText("Cuenta B");
});

it.each(["revision", "deleted", "unlaunchable"])(
  "rechecks %s at dispatch, warns and sends no launch",
  async (change) => {
    const command = await mount();
    const spy = vi.spyOn(Client.prototype, "request");
    const view = snapshot(),
      id = command.id.slice("launch-profile:".length);
    if (change === "revision") view.revision = "f".repeat(64);
    if (change === "deleted")
      view.profiles = view.profiles.filter((profile) => profile.id !== id);
    if (change === "unlaunchable") {
      const profile = view.profiles.find((profile) => profile.id === id);
      if (profile) profile.launchable = false;
    }
    act(() => {
      cache.setQueryData(["launcher"], view);
      command.run();
    });
    expect(launchCalls(spy)).toHaveLength(0);
    expect(
      await screen.findByText(
        change === "unlaunchable" ? text.unavailable : text.changed,
      ),
    ).toBeTruthy();
  },
);
it.each(["live", "unverified", "blocked", "disconnected"])(
  "rechecks authority after opening: %s",
  async (change) => {
    const command = await mount();
    const spy = vi.spyOn(Client.prototype, "request");
    const core = structuredClone(cache.getQueryData<CoreStatus>(coreKey));
    if (!core) throw new Error("Missing core");
    if (change === "live") core.live = true;
    if (change === "unverified") core.access.verified = false;
    if (change === "blocked") core.access.blocked = true;
    if (change === "disconnected") core.rights = "unavailable";
    act(() => {
      cache.setQueryData(coreKey, core);
      command.run();
    });
    expect(launchCalls(spy)).toHaveLength(0);
    await waitFor(() =>
      expect(document.querySelector(".v-toast")).toBeTruthy(),
    );
  },
);
it("updates the cache on a host conflict and announces it", async () => {
  const command = await mount(),
    current = snapshot();
  current.revision = "e".repeat(64);
  // The fake conflict below is a server state transition. Suppress the mock's
  // initial subscription replay of its older, unrelated snapshot.
  const subscribe = Client.prototype.subscribe;
  vi.spyOn(Client.prototype, "subscribe").mockImplementation(function (
    this: Client,
    topic,
  ) {
    return topic === "launcher" ? () => {} : subscribe.call(this, topic);
  });
  const original = Client.prototype.request;
  const spy = vi
    .spyOn(Client.prototype, "request")
    .mockImplementation(async function (this: Client, request) {
      if (request.method === "launcher.launchChecked")
        throw new HostFailure({ kind: "launcherConflict", current });
      if (request.method === "launcher.get")
        return { method: "launcher.get", value: current };
      return original.call(this, request);
    });
  await act(async () => command.run());
  expect(launchCalls(spy)).toHaveLength(1);
  expect(cache.getQueryData<LauncherView>(["launcher"])?.revision).toBe(
    current.revision,
  );
  expect(await screen.findByText(text.changed)).toBeTruthy();
});
it.each(["Enter", "click"])(
  "sends once during a held launch despite double %s, then navigates and focuses main",
  async (input) => {
    const command = await mount();
    let release!: () => void;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const send = Client.prototype.request;
    const held = vi
      .spyOn(Client.prototype, "request")
      .mockImplementation(async function (this: Client, request) {
        if (request.method === "launcher.launchChecked") {
          await hold;
          return {
            method: "launcher.launchChecked",
            value: { kind: "queued", request: "a".repeat(32) },
          };
        }
        return send.call(this, request);
      });
    const user = userEvent.setup();
    await user.type(screen.getByRole("combobox"), command.label);
    if (input === "Enter") await user.keyboard("{Enter}{Enter}");
    else
      await user.dblClick(
        screen.getByRole("option", { name: new RegExp(command.label) }),
      );
    act(() => command.run());
    expect(launchCalls(held)).toHaveLength(1);
    await act(async () => release());
    expect(await screen.findByText(text.sent)).toBeTruthy();
    await waitFor(() =>
      expect(document.activeElement).toBe(
        document.querySelector(".v-shell-main"),
      ),
    );
  },
);
it("blocks Ctrl L on a non-editable palette row, with a positive normal-screen control", async () => {
  await mount();
  const spy = vi.spyOn(Client.prototype, "request");
  const row = screen.getAllByRole("option")[0];
  row.tabIndex = 0;
  row.focus();
  fireEvent.keyDown(row, { key: "l", ctrlKey: true });
  const calls = () =>
    spy.mock.calls.filter(([request]) =>
      ["launcher.launchChecked", "launcher.favorite"].includes(request.method),
    );
  expect(calls()).toHaveLength(0);
  await userEvent.setup().keyboard("{Escape}");
  fireEvent.keyDown(document.body, { key: "l", ctrlKey: true });
  await waitFor(() => expect(calls()).toHaveLength(1));
  expect(calls()[0][0].method).toBe("launcher.launchChecked");
});

it.each(["strategy", "engineer"])(
  "keeps the upcoming %s presentation navigable, including the Pro catalog label",
  async (id) => {
    await mount();
    act(() =>
      publishAccount({
        session: "signedIn",
        name: "QA",
        photo: null,
        plan: { kind: "founders" },
      }),
    );
    await waitFor(() =>
      expect(driver.commands.find((row) => row.id === id)?.meta).toBe(
        text.included,
      ),
    );
    const row = driver.commands.find((item) => item.id === id);
    expect(row?.disabled).toBe(false);
    expect(
      driver.commands.some((item) => item.label === "Guardar perfil"),
    ).toBe(false);
    const user = userEvent.setup();
    await user.type(
      screen.getByRole("combobox"),
      id === "strategy" ? text.strategy : text.engineer,
    );
    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(
        document
          .querySelector('.v-sidebar [aria-current="page"]')
          ?.getAttribute("aria-label"),
      ).toBe(id === "strategy" ? "Estrategia" : "Ingeniero"),
    );
    await waitFor(() =>
      expect(document.activeElement).toBe(
        document.querySelector(".v-shell-main"),
      ),
    );
  },
);

it("shows a failed profile refresh and blocks stale launch commands", async () => {
  await mount();
  const user = userEvent.setup();
  await user.keyboard("{Escape}");
  const original = Client.prototype.request;
  vi.spyOn(Client.prototype, "request").mockImplementation(async function (
    this: Client,
    request,
  ) {
    if (request.method === "launcher.get")
      throw new HostFailure({ kind: "coreUnavailable" });
    return original.call(this, request);
  });
  fireEvent.keyDown(document.body, { key: "k", ctrlKey: true });
  expect((await screen.findAllByText(text.readFailed)).length).toBeGreaterThan(
    0,
  );
  expect(
    driver.commands
      .filter((row) => row.id.startsWith("launch-profile:"))
      .every((row) => row.disabled),
  ).toBe(true);
});

it("warns and opens Launcher when the favorite shortcut loses verified access", async () => {
  await mount();
  await userEvent.setup().keyboard("{Escape}");
  const core = structuredClone(cache.getQueryData<CoreStatus>(coreKey));
  if (!core) throw new Error("Missing core");
  core.access.verified = false;
  const spy = vi.spyOn(Client.prototype, "request");
  act(() => cache.setQueryData(coreKey, core));
  fireEvent.keyDown(document.body, { key: "l", ctrlKey: true });
  expect(
    spy.mock.calls.filter(
      ([request]) => request.method === "launcher.favorite",
    ),
  ).toHaveLength(0);
  await waitFor(() =>
    expect(
      document
        .querySelector('.v-sidebar [aria-current="page"]')
        ?.getAttribute("aria-label"),
    ).toBe("Launcher"),
  );
  expect(document.querySelector(".v-toast")).toBeTruthy();
});

it("offers only registered navigation destinations and never Workshop, with an orphan control", async () => {
  await mount();
  const core = structuredClone(cache.getQueryData<CoreStatus>(coreKey));
  if (!core) throw new Error("Missing core");
  core.access.tester = true;
  core.access.calendar = true;
  act(() => cache.setQueryData(coreKey, core));
  await waitFor(() =>
    expect(driver.commands.some((row) => row.id === "calendar")).toBe(true),
  );
  const known = new Set<string>(registeredSections);
  const orphans = (commands: readonly PaletteCommand[]) =>
    commands
      .filter((row) => row.group === "navigation" && !known.has(row.id))
      .map((row) => row.id);
  expect(driver.commands.some((row) => row.id === "workshop")).toBe(false);
  expect(orphans(driver.commands)).toEqual([]);
  expect(
    orphans([
      ...driver.commands,
      { id: "workshop", label: "Workshop", group: "navigation", run: vi.fn() },
    ]),
  ).toEqual(["workshop"]);
});

it.each(["verified", "unverified"] as const)(
  "never labels the %s plan as Included in Pro",
  async (kind) => {
    await mount();
    act(() =>
      publishAccount({
        session: "signedIn",
        name: "QA",
        photo: null,
        plan: { kind },
      }),
    );
    await waitFor(() => {
      for (const id of ["strategy", "engineer"])
        expect(driver.commands.find((row) => row.id === id)?.meta).toBe(
          text.soon,
        );
    });
  },
);

it.each(["unverified", "blocked"])(
  "does not show the Pro catalog label with %s authority",
  async (reason) => {
    await mount();
    const core = structuredClone(cache.getQueryData<CoreStatus>(coreKey));
    if (!core) throw new Error("Missing core");
    if (reason === "unverified") core.access.verified = false;
    else core.access.blocked = true;
    act(() => {
      publishAccount({
        session: "signedIn",
        name: "QA",
        photo: null,
        plan: { kind: "founders" },
      });
      cache.setQueryData(coreKey, core);
    });
    await waitFor(() => {
      for (const id of ["strategy", "engineer"])
        expect(driver.commands.find((row) => row.id === id)?.meta).toBe(
          text.soon,
        );
    });
  },
);

it.each([
  ["Planificador", text.strategy],
  ["Radio", text.engineer],
])("finds the native help text %s", async (query, label) => {
  await mount();
  await userEvent.setup().type(screen.getByRole("combobox"), query);
  expect(
    screen.getByRole("option", { name: new RegExp(`^${label} ·`) }),
  ).toBeTruthy();
});

it("does not navigate when Enter selects a blocked destination", async () => {
  await mount();
  const core = structuredClone(cache.getQueryData<CoreStatus>(coreKey));
  if (!core) throw new Error("Missing core");
  core.access.verified = false;
  act(() => cache.setQueryData(coreKey, core));
  const before = document.querySelector('.v-sidebar [aria-current="page"]');
  const user = userEvent.setup();
  await user.type(screen.getByRole("combobox"), "Abre tus apps");
  const row = screen.getByRole("option", { name: /^Launcher ·/ });
  expect(row.getAttribute("aria-disabled")).toBe("true");
  await user.keyboard("{ArrowDown}{Enter}");
  expect(document.querySelector('.v-sidebar [aria-current="page"]')).toBe(
    before,
  );
  expect(screen.getByRole("combobox")).toBeTruthy();
});

it("returns focus to the opener on Escape without navigating", async () => {
  await mount();
  const user = userEvent.setup();
  await user.keyboard("{Escape}");
  const origin = document.querySelector<HTMLButtonElement>(
    '.v-sidebar [data-nav="home"]',
  );
  if (!origin) throw new Error("Missing origin");
  origin.focus();
  fireEvent.keyDown(origin, { key: "k", ctrlKey: true });
  await screen.findByRole("combobox");
  await user.keyboard("{Escape}");
  await waitFor(() => expect(document.activeElement).toBe(origin));
});

it("announces unavailable zoom in the palette and reevaluates it on resize without saving", async () => {
  vi.stubGlobal("innerWidth", 1280);
  vi.stubGlobal("innerHeight", 720);
  await mount();
  expect(driver.commands.find((row) => row.id === "zoom-more")).toMatchObject({
    disabled: true,
    meta: zoomText.moreUnavailable,
  });
  const request = vi.spyOn(Client.prototype, "request");
  act(() => {
    vi.stubGlobal("innerWidth", 1920);
    vi.stubGlobal("innerHeight", 1080);
    fireEvent(window, new Event("resize"));
  });
  await waitFor(() =>
    expect(
      driver.commands.find((row) => row.id === "zoom-more")?.disabled,
    ).toBe(false),
  );
  expect(
    request.mock.calls.filter(([value]) => value.method === "settings.update"),
  ).toHaveLength(0);
});

it("Ctrl L uses the first favorite supplied by the host and preserves the selected profile", async () => {
  await mount();
  await userEvent.setup().keyboard("{Escape}");
  const view = snapshot();
  view.profiles[0].name = "\u{10000}";
  view.profiles[1].name = "\uE000";
  for (const profile of view.profiles) profile.favorite = true;
  act(() => {
    cache.setQueryData(["launcher"], view);
    cache.setQueryData(["launcher", "selection"], view.profiles[1].id);
  });
  const send = vi.spyOn(Client.prototype, "request");
  fireEvent.keyDown(document.body, { key: "l", ctrlKey: true });
  await waitFor(() => expect(launchCalls(send)).toHaveLength(1));
  expect(launchCalls(send)[0][0]).toEqual({
    method: "launcher.launchChecked",
    profile: view.profiles[0].id,
    baseRevision: view.revision,
    armedGeneration: "a".repeat(64),
  });
  expect(cache.getQueryData(["launcher", "selection"])).toBe(
    view.profiles[1].id,
  );
});

it("takes an open Analysis route back to Home when the beta is disabled", async () => {
  await mount();
  fireEvent.keyDown(document.body, { key: "Escape" });
  const settings = cache.getQueryData<SettingsView>(settingsKey);
  if (!settings) throw new Error("Missing settings");
  const preference = (analisisBeta: boolean) => ({
    ...settings,
    general: { ...settings.general, analisisBeta },
  });
  act(() => {
    cache.setQueryData(["updates"], { ...updates, channel: "nightly" });
    cache.setQueryData(settingsKey, preference(true));
  });
  const analysis = await screen.findByRole("button", { name: "Análisis" });
  fireEvent.click(analysis);
  await waitFor(() =>
    expect(analysis.getAttribute("aria-current")).toBe("page"),
  );
  act(() => cache.setQueryData(settingsKey, preference(false)));
  await waitFor(() => {
    expect(screen.queryByRole("button", { name: "Análisis" })).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Inicio" })
        .getAttribute("aria-current"),
    ).toBe("page");
  });
});

it("offers the Analysis beta switch in Settings only on the nightly channel", async () => {
  await mount();
  fireEvent.keyDown(document.body, { key: "Escape" });
  act(() =>
    cache.setQueryData(["updates"], { ...updates, channel: "testers" }),
  );
  fireEvent.click(screen.getByRole("tab", { name: "Privacidad" }));
  await screen.findByRole("switch", { name: "Enviar informes de fallos" });
  expect(screen.queryByText("Funciones en pruebas")).toBeNull();
  act(() =>
    cache.setQueryData(["updates"], { ...updates, channel: "nightly" }),
  );
  await screen.findByText("Funciones en pruebas");
  expect(
    screen.getByRole("switch", { name: "Análisis y Estrategia (beta)" }),
  ).toBeTruthy();
});

function betaSettings(settings: SettingsView) {
  return {
    ...settings,
    general: { ...settings.general, analisisBeta: true },
  };
}

it("hides Analysis on testers and master even with the beta enabled", async () => {
  await mount();
  fireEvent.keyDown(document.body, { key: "Escape" });
  const settings = cache.getQueryData<SettingsView>(settingsKey);
  if (!settings) throw new Error("Missing settings");
  act(() => cache.setQueryData(settingsKey, betaSettings(settings)));
  for (const channel of ["testers", "master"]) {
    act(() => cache.setQueryData(["updates"], { ...updates, channel }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Análisis" })).toBeNull(),
    );
  }
});

it("returns from Analysis to Home when the channel leaves nightly", async () => {
  await mount();
  fireEvent.keyDown(document.body, { key: "Escape" });
  const settings = cache.getQueryData<SettingsView>(settingsKey);
  if (!settings) throw new Error("Missing settings");
  act(() => {
    cache.setQueryData(["updates"], { ...updates, channel: "nightly" });
    cache.setQueryData(settingsKey, betaSettings(settings));
  });
  const analysis = await screen.findByRole("button", { name: "Análisis" });
  fireEvent.click(analysis);
  await waitFor(() =>
    expect(analysis.getAttribute("aria-current")).toBe("page"),
  );
  act(() =>
    cache.setQueryData(["updates"], { ...updates, channel: "testers" }),
  );
  await waitFor(() => {
    expect(screen.queryByRole("button", { name: "Análisis" })).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Inicio" })
        .getAttribute("aria-current"),
    ).toBe("page");
  });
});

it("keeps the Shell alive and Analysis hidden when updates.get fails", async () => {
  await mount();
  fireEvent.keyDown(document.body, { key: "Escape" });
  const settings = cache.getQueryData<SettingsView>(settingsKey);
  if (!settings) throw new Error("Missing settings");
  act(() => {
    cache.setQueryData(["updates"], { ...updates, channel: "nightly" });
    cache.setQueryData(settingsKey, betaSettings(settings));
  });
  await screen.findByRole("button", { name: "Análisis" });
  const query = cache.getQueryCache().find({ queryKey: ["updates"] });
  if (!query) throw new Error("Missing updates query");
  act(() =>
    query.setState({
      status: "error",
      error: new Error("HostFailure"),
      fetchStatus: "idle",
    }),
  );
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Análisis" })).toBeNull(),
  );
  expect(screen.getByRole("button", { name: "Inicio" })).toBeTruthy();
}, 15_000);

it("shows the no-access screen with the beta on and no Analysis permission", async () => {
  await mount();
  fireEvent.keyDown(document.body, { key: "Escape" });
  const core = cache.getQueryData<CoreStatus>(coreKey);
  const settings = cache.getQueryData<SettingsView>(settingsKey);
  if (!core || !settings) throw new Error("Missing host state");
  act(() => {
    cache.setQueryData(coreKey, {
      ...core,
      access: {
        ...core.access,
        verified: true,
        blocked: false,
        analysis: false,
      },
    });
    cache.setQueryData(["updates"], { ...updates, channel: "nightly" });
    cache.setQueryData(settingsKey, betaSettings(settings));
  });
  const analysis = await screen.findByRole("button", { name: "Análisis" });
  fireEvent.click(analysis);
  expect(
    await screen.findByText("Análisis no está incluido en tu acceso"),
  ).toBeTruthy();
});

// collapsed in jsdom, so the upcoming mark is the lock beside the icon
const upcoming = (item: HTMLElement | null) =>
  Boolean(item?.querySelector(".v-nav-lock"));

it("opens the real Strategy screen only with the beta on nightly", async () => {
  await mount();
  fireEvent.keyDown(document.body, { key: "Escape" });
  const settings = cache.getQueryData<SettingsView>(settingsKey);
  if (!settings) throw new Error("Missing settings");
  const requests = vi.spyOn(Client.prototype, "request");
  const strategyCalls = () =>
    requests.mock.calls.filter(([r]) => r.method.startsWith("strategy."));
  const entry = () =>
    document.querySelector<HTMLElement>('.v-sidebar [data-nav="strategy"]');
  // today's behaviour: upcoming badge, no calls to the host
  fireEvent.click(entry() as HTMLElement);
  await waitFor(() => expect(upcoming(entry())).toBe(true));
  expect(upcoming(entry())).toBe(true);
  expect(strategyCalls()).toHaveLength(0);
  act(() => {
    cache.setQueryData(["updates"], { ...updates, channel: "nightly" });
    cache.setQueryData(settingsKey, betaSettings(settings));
  });
  await waitFor(() => expect(upcoming(entry())).toBe(false));
  fireEvent.click(entry() as HTMLElement);
  await waitFor(() => expect(strategyCalls().length).toBeGreaterThan(0));
  expect(entry()?.getAttribute("aria-current")).toBe("page");
});

it("returns Strategy to the upcoming page when the channel leaves nightly", async () => {
  await mount();
  fireEvent.keyDown(document.body, { key: "Escape" });
  const settings = cache.getQueryData<SettingsView>(settingsKey);
  if (!settings) throw new Error("Missing settings");
  act(() => {
    cache.setQueryData(["updates"], { ...updates, channel: "nightly" });
    cache.setQueryData(settingsKey, betaSettings(settings));
  });
  const entry = () =>
    document.querySelector<HTMLElement>('.v-sidebar [data-nav="strategy"]');
  await waitFor(() => expect(upcoming(entry())).toBe(false));
  fireEvent.click(entry() as HTMLElement);
  const requests = vi.spyOn(Client.prototype, "request");
  act(() =>
    cache.setQueryData(["updates"], { ...updates, channel: "testers" }),
  );
  await waitFor(() => expect(upcoming(entry())).toBe(true));
  requests.mockClear();
  // the section shows the upcoming page, not the real screen, and asks nothing
  await screen.findByText("Plan de paradas");
  expect(screen.getAllByText("Próximamente").length).toBeGreaterThan(0);
  await waitFor(() =>
    expect(document.querySelector(".strategy-screen")).toBeNull(),
  );
  expect(
    requests.mock.calls.filter(([x]) => x.method.startsWith("strategy.")),
  ).toHaveLength(0);
});

it("keeps the open Strategy screen when reading the channel fails", async () => {
  await mount();
  fireEvent.keyDown(document.body, { key: "Escape" });
  const settings = cache.getQueryData<SettingsView>(settingsKey);
  if (!settings) throw new Error("Missing settings");
  act(() => {
    cache.setQueryData(["updates"], { ...updates, channel: "nightly" });
    cache.setQueryData(settingsKey, betaSettings(settings));
  });
  const entry = () =>
    document.querySelector<HTMLElement>('.v-sidebar [data-nav="strategy"]');
  await waitFor(() => expect(upcoming(entry())).toBe(false));
  fireEvent.click(entry() as HTMLElement);
  await waitFor(() =>
    expect(document.querySelector(".strategy-screen")).not.toBeNull(),
  );
  const query = cache.getQueryCache().find({ queryKey: ["updates"] });
  if (!query) throw new Error("Missing updates query");
  act(() =>
    query.setState({
      status: "error",
      error: new Error("HostFailure"),
      fetchStatus: "idle",
    }),
  );
  await waitFor(() => expect(query.state.status).toBe("error"));
  expect(upcoming(entry())).toBe(false);
  expect(document.querySelector(".strategy-screen")).not.toBeNull();
  expect(entry()?.getAttribute("aria-current")).toBe("page");
}, 15_000);
