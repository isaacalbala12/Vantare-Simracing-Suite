// @vitest-environment jsdom
import { CSPProvider } from "@base-ui/react/csp-provider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { HostProvider } from "../src/renderer/app/Host";
import {
  SectionChromeProvider,
  SectionRailSlot,
  SectionTabsSlot,
} from "../src/renderer/app/SectionChrome";
import { Client } from "../src/renderer/bridge/client";
import { removalText } from "../src/renderer/i18n/launcher-removal";
import { profileText as text } from "../src/renderer/i18n/profile-editor";
import LauncherEntry from "../src/renderer/screens/launcher/entry";
import {
  ToastProvider,
  ToastViewport,
  TooltipProvider,
} from "../src/renderer/ui/Layers";

const caches: QueryClient[] = [];
// Module loading on the cold HDD is fixture setup, not part of editor behavior.
beforeAll(async () => {
  await import("../src/mock/host");
});
beforeEach(() =>
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })),
);
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  caches.forEach((cache) => {
    cache.clear();
  });
  caches.length = 0;
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});
function ScreenNavigation() {
  const [visible, setVisible] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setVisible(!visible)}>
        Otra sección
      </button>
      <SectionChromeProvider>
        <SectionTabsSlot />
        <SectionRailSlot fallback={null} />
        {visible && <LauncherEntry />}
      </SectionChromeProvider>
    </>
  );
}
function mount(scene = "launcher-editor-ready") {
  window.history.replaceState(null, "", `/?escena=${scene}`);
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  caches.push(cache);
  render(
    <QueryClientProvider client={cache}>
      <HostProvider>
        <CSPProvider disableStyleElements>
          <ToastProvider>
            <TooltipProvider>
              <ScreenNavigation />
              <ToastViewport closeLabel={text.cancel} />
            </TooltipProvider>
          </ToastProvider>
        </CSPProvider>
      </HostProvider>
    </QueryClientProvider>,
  );
}

async function confirmRemoval(scene: string) {
  mount(scene);
  const origin = await screen.findByRole("button", {
    name: "Creador de Contenido",
  });
  fireEvent.contextMenu(origin);
  fireEvent.click(await screen.findByRole("menuitem", { name: "Eliminar" }));
  const dialog = await screen.findByRole("dialog", { name: "Eliminar perfil" });
  return {
    origin,
    dialog,
    confirm: within(dialog).getByRole("button", {
      name: "Eliminar",
    }),
  };
}
it("entry uses removeChecked and leaves the profile and dialog intact after Accepted", async () => {
  const requests = vi.spyOn(Client.prototype, "request");
  const { dialog, confirm } = await confirmRemoval("launcher-removal-accepted");
  fireEvent.click(confirm);
  await within(dialog).findByText(removalText.accepted);
  expect(screen.getByRole("dialog", { name: "Eliminar perfil" })).toBeTruthy();
  expect(
    document.querySelector(
      '.v-launcher-profile[aria-label="Creador de Contenido"]',
    ),
  ).toBeTruthy();
  expect(
    requests.mock.calls.filter(([r]) => r.method === "launcher.profile.delete"),
  ).toHaveLength(0);
  const sent = requests.mock.calls.filter(
    ([r]) => r.method === "launcher.profile.removeChecked",
  );
  expect(sent).toHaveLength(1);
  expect(sent[0][0]).toMatchObject({
    target: {
      instance: "b".repeat(64),
      accountGeneration: "a".repeat(64),
      profile: "creator",
      revision: "0".repeat(64),
    },
  });
  fireEvent.click(confirm);
  expect(
    requests.mock.calls.filter(
      ([r]) => r.method === "launcher.profile.removeChecked",
    ),
  ).toHaveLength(1);
});
it("entry waits for Removed before closing, refreshes the document and restores focus to its heading", async () => {
  const { confirm } = await confirmRemoval("launcher-removal-finished");
  fireEvent.click(confirm);
  await waitFor(
    () =>
      expect(
        screen.queryByRole("dialog", { name: "Eliminar perfil" }),
      ).toBeNull(),
    { timeout: 3000 },
  );
  await waitFor(() =>
    expect(
      document.querySelector(
        '.v-launcher-profile[aria-label="Creador de Contenido"]',
      ),
    ).toBeNull(),
  );
  expect(screen.getByText(removalText.removed)).toBeTruthy();
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "Launcher" }),
    ),
  );
});
it.each([
  ["owned", removalText.reasons["owned-live"]],
  ["unknown", removalText.reasons["ownership-unknown"]],
  ["unsupported", removalText.reasons.unsupported],
])(
  "entry explains %s instead of treating ownership as empty",
  async (state, message) => {
    const requests = vi.spyOn(Client.prototype, "request");
    const { dialog, confirm } = await confirmRemoval(
      `launcher-removal-${state}`,
    );
    expect(within(dialog).getByText(message)).toBeTruthy();
    expect(confirm.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(confirm);
    expect(
      requests.mock.calls.filter(
        ([r]) => r.method === "launcher.profile.removeChecked",
      ),
    ).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  },
);
it.each(["gap", "restart"])(
  "entry keeps %s Unknown visible and never claims removal",
  async (state) => {
    const { dialog, confirm } = await confirmRemoval(
      `launcher-removal-${state}`,
    );
    fireEvent.click(confirm);
    await within(dialog).findByText(removalText.unknown);
    expect(screen.queryByText(removalText.removed)).toBeNull();
    expect(
      document.querySelector(
        '.v-launcher-profile[aria-label="Creador de Contenido"]',
      ),
    ).toBeTruthy();
  },
);

it("requires reconfirmation with a fresh revision after a conflict, never blind retry", async () => {
  const requests = vi.spyOn(Client.prototype, "request");
  const { dialog, confirm } = await confirmRemoval("launcher-removal-conflict");
  fireEvent.click(confirm);
  await within(dialog).findByText(removalText.reasons["write-conflict"]);
  expect(
    within(dialog).queryByRole("button", { name: "Reintentar" }),
  ).toBeNull();
  fireEvent.click(within(dialog).getByRole("button", { name: "Cerrar" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  fireEvent.contextMenu(
    screen.getByRole("button", { name: "Creador de Contenido" }),
  );
  fireEvent.click(await screen.findByRole("menuitem", { name: "Eliminar" }));
  const fresh = await screen.findByRole("dialog", { name: "Eliminar perfil" });
  fireEvent.click(within(fresh).getByRole("button", { name: "Eliminar" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), {
    timeout: 3000,
  });
  const sent = requests.mock.calls.filter(
    ([r]) => r.method === "launcher.profile.removeChecked",
  );
  expect(sent).toHaveLength(2);
  expect(sent[1][0]).toMatchObject({
    target: { revision: `${"0".repeat(63)}1` },
  });
});

it("reconciles profiles after an Unknown without hiding it or retrying deletion", async () => {
  const requests = vi.spyOn(Client.prototype, "request");
  const { dialog, confirm } = await confirmRemoval("launcher-removal-gap");
  const before = requests.mock.calls.filter(
    ([r]) => r.method === "launcher.get",
  ).length;
  fireEvent.click(confirm);
  await within(dialog).findByText(removalText.unknown);
  await waitFor(() =>
    expect(
      requests.mock.calls.filter(([r]) => r.method === "launcher.get").length,
    ).toBeGreaterThan(before),
  );
  expect(screen.getByRole("dialog", { name: "Eliminar perfil" })).toBeTruthy();
  expect(
    requests.mock.calls.filter(
      ([r]) => r.method === "launcher.profile.removeChecked",
    ),
  ).toHaveLength(1);
});
