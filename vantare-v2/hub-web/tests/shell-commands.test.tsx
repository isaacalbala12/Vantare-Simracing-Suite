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
import type {
  AccountView,
  CoreStatus,
  HostToUi,
  LauncherView,
  Reply,
} from "../src/contract/generated/contract";
import corpus from "../src/contract/generated/corpus.json";
import { AccountProvider } from "../src/renderer/app/AccountState";
import { coreKey, HostProvider } from "../src/renderer/app/Host";
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
const accountListeners = new Set<(message: HostToUi) => void>();
let showAccountIdentity = false;
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
    ([request]) => request.method === "launcher.launch",
  );
}

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
    expect(await screen.findByText(text.changed)).toBeTruthy();
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
      if (request.method === "launcher.launch")
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
        if (request.method === "launcher.launch") {
          await hold;
          return { method: "launcher.launch", accepted: true };
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
      ["launcher.launch", "launcher.favorite"].includes(request.method),
    );
  expect(calls()).toHaveLength(0);
  await userEvent.setup().keyboard("{Escape}");
  fireEvent.keyDown(document.body, { key: "l", ctrlKey: true });
  await waitFor(() => expect(calls()).toHaveLength(1));
  expect(calls()[0][0].method).toBe("launcher.favorite");
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
      ).toBe(id === "strategy" ? "Strategy" : "Engineer"),
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
  vi.stubGlobal("outerWidth", 1280);
  vi.stubGlobal("outerHeight", 720);
  await mount();
  expect(driver.commands.find((row) => row.id === "zoom-more")).toMatchObject({
    disabled: true,
    meta: zoomText.moreUnavailable,
  });
  const request = vi.spyOn(Client.prototype, "request");
  act(() => {
    vi.stubGlobal("outerWidth", 1920);
    vi.stubGlobal("outerHeight", 1080);
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
