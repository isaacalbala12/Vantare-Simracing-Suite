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
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { HostProvider } from "../src/renderer/app/Host";
import { UiProvider } from "../src/renderer/app/UiState";
import { Client } from "../src/renderer/bridge/client";
import { studioText as t } from "../src/renderer/i18n/studio";
import { studioStateText as text } from "../src/renderer/i18n/studio-states.es";
import { StudioProvider } from "../src/renderer/screens/studio/state";
import { TooltipProvider } from "../src/renderer/ui/Layers";
import { StudioFocus } from "../src/renderer/ui/studio/StudioFocus";

const caches: QueryClient[] = [];
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
  vi.restoreAllMocks();
  caches.forEach((c) => {
    c.clear();
  });
  caches.length = 0;
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});
function ToggleScreen() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setOpen((value) => !value)}>
        Toggle Studio
      </button>
      {open && (
        <StudioProvider>
          <StudioFocus />
        </StudioProvider>
      )}
    </>
  );
}
function mount(scene = "studio-base") {
  window.history.replaceState(null, "", `/?escena=${scene}`);
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  caches.push(cache);
  render(
    <QueryClientProvider client={cache}>
      <HostProvider>
        <CSPProvider disableStyleElements>
          <TooltipProvider>
            <UiProvider>
              <ToggleScreen />
            </UiProvider>
          </TooltipProvider>
        </CSPProvider>
      </HostProvider>
    </QueryClientProvider>,
  );
}
const listRow = (name: string) =>
  screen.findByRole("button", { name: new RegExp(`^${name}, `) });
describe("Studio A honest states", () => {
  it("guides an empty layout, explains track availability and adds with the existing CAS", async () => {
    const spy = vi.spyOn(Client.prototype, "request");
    mount("studio-a-vacio");
    await screen.findByRole("heading", { name: t.emptyTitle });
    expect(
      screen.getByRole("heading", { name: text.firstWidget }),
    ).toBeTruthy();
    const track = screen.getByRole("button", { name: t.show });
    expect(track.hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("group", { name: t.showNeedsWidget })).toBeTruthy();
    fireEvent.click(track);
    expect(
      spy.mock.calls.filter(([r]) => r.method === "studio.track"),
    ).toHaveLength(0);
    const quick = screen.getByRole("region", { name: text.quickStart });
    const buttons = quick.querySelectorAll("button");
    expect(buttons.length).toBe(3);
    expect(
      Array.from(buttons, (button) => button.getAttribute("aria-label")),
    ).toEqual([
      `${t.addShort} Standings`,
      `${t.addShort} Relative`,
      `${t.addShort} Delta`,
    ]);
    const user = userEvent.setup();
    await user.click(buttons[0]);
    await waitFor(() =>
      expect(
        spy.mock.calls.filter(([r]) => r.method === "studio.add"),
      ).toHaveLength(1),
    );
    expect(
      spy.mock.calls.find(([r]) => r.method === "studio.add")?.[0],
    ).toMatchObject({ baseRevision: "0".repeat(64) });
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: text.firstWidget }),
      ).toBeNull(),
    );
  });
  it("opens the real catalogue from the empty call to action", async () => {
    mount("studio-a-vacio");
    await screen.findByRole("heading", { name: text.firstWidget });
    const add = document.querySelector<HTMLButtonElement>(
      ".v-studio-empty-stage > button",
    );
    if (!add) throw new Error("Missing empty-state add action");
    await userEvent.setup().click(add);
    await screen.findByRole("dialog", { name: t.catalog });
    expect(screen.getByRole("searchbox", { name: t.search })).toBeTruthy();
  });
  it("keeps Add named when the compact strip hides its visual label", async () => {
    mount("studio-a-vacio");
    await screen.findByRole("heading", { name: text.firstWidget });
    const strip = screen.getByRole("complementary", { name: t.layoutLabel });
    const add = strip.querySelector<HTMLButtonElement>("[data-add-widget]");
    const label = add?.querySelector<HTMLElement>(".v-button-label > span");
    if (!add || !label) throw new Error("Missing compact Add button or label");
    label.hidden = true;
    expect(within(strip).getByRole("button", { name: t.add })).toBe(add);
    await userEvent.setup().click(add);
    await screen.findByRole("dialog", { name: t.catalog });
  });
  it.each(["studio-a-protegido", "studio-a-ilegible"])(
    "shows only known data and no editable defaults in %s",
    async (scene) => {
      const spy = vi.spyOn(Client.prototype, "request");
      mount(scene);
      await screen.findByRole("alert");
      expect(screen.getByText(text.protectedHelp)).toBeTruthy();
      expect(screen.getByText(t.appearanceUnavailable)).toBeTruthy();
      expect(screen.queryByRole("combobox")).toBeNull();
      expect(screen.queryByRole("switch")).toBeNull();
      expect(screen.queryByRole("slider")).toBeNull();
      expect(
        screen.getByRole("button", { name: t.show }).hasAttribute("disabled"),
      ).toBe(true);
      if (scene === "studio-a-protegido") {
        const row = await listRow("Standings");
        fireEvent.keyDown(row, { key: " " });
        fireEvent.keyDown(row, { key: "Delete" });
      } else {
        expect(
          screen.queryAllByRole("button", { name: /^Standings, / }),
        ).toHaveLength(0);
      }
      expect(
        spy.mock.calls.filter(([r]) => r.method !== "studio.get"),
      ).toHaveLength(0);
      await userEvent
        .setup()
        .click(screen.getByRole("button", { name: t.reload }));
      await waitFor(() =>
        expect(
          spy.mock.calls.filter(([r]) => r.method === "studio.get"),
        ).toHaveLength(2),
      );
    },
  );
  it("shows loading skeletons without claiming a save or displaying values", async () => {
    mount("studio-a-cargando");
    await screen.findAllByLabelText(t.loading);
    expect(screen.queryByText(t.saved)).toBeNull();
    expect(screen.queryByText(t.saving)).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByRole("button", { name: t.show })).toBeNull();
  });
  it("announces an actual pending write and blocks a second visibility change", async () => {
    const spy = vi.spyOn(Client.prototype, "request");
    mount("studio-a-guardando");
    const row = await listRow("Standings");
    fireEvent.keyDown(row, { key: " " });
    await within(
      screen.getByRole("complementary", { name: t.layoutLabel }),
    ).findByRole("status", { name: t.saving });
    fireEvent.keyDown(row, { key: " " });
    expect(
      spy.mock.calls.filter(([r]) => r.method === "studio.visibility"),
    ).toHaveLength(1);
    expect(
      document.querySelector('.v-studio-temporary[aria-busy="true"]'),
    ).toBeTruthy();
  });
  it("reports a failed save, retries the same intent and returns to the real saved state", async () => {
    const spy = vi.spyOn(Client.prototype, "request");
    mount("studio-a-error");
    const row = await listRow("Standings");
    fireEvent.keyDown(row, { key: " " });
    await screen.findByRole("alert");
    expect(screen.getByRole("status", { name: t.notSaved })).toBeTruthy();
    expect(row.getAttribute("aria-label")).toContain(t.visible);
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: t.retry }));
    await waitFor(() =>
      expect(row.getAttribute("aria-label")).toContain(t.hidden),
    );
    const writes = spy.mock.calls.filter(
      ([r]) => r.method === "studio.visibility",
    );
    expect(writes).toHaveLength(2);
    expect(writes[0][0]).toEqual(writes[1][0]);
  });
  it("discards the failed intent without writing", async () => {
    const spy = vi.spyOn(Client.prototype, "request");
    mount("studio-a-error");
    const row = await listRow("Standings");
    fireEvent.keyDown(row, { key: " " });
    await screen.findByRole("alert");
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: t.discard }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(row.getAttribute("aria-label")).toContain(t.visible);
    expect(
      spy.mock.calls.filter(([r]) => r.method === "studio.visibility"),
    ).toHaveLength(1);
  });
  it("keeps a hidden overlay editable and shows it with the existing revision", async () => {
    const spy = vi.spyOn(Client.prototype, "request");
    mount("studio-a-oculto");
    await userEvent.setup().click(await listRow("Relative"));
    expect(screen.getByText(t.hiddenStage)).toBeTruthy();
    expect(screen.getAllByRole("tab").length).toBeGreaterThan(0);
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: t.showNow }));
    await waitFor(() => expect(screen.queryByText(t.hiddenStage)).toBeNull());
    expect(
      spy.mock.calls.find(([r]) => r.method === "studio.visibility")?.[0],
    ).toEqual({
      method: "studio.visibility",
      id: "widget-3",
      visible: true,
      baseRevision: "0".repeat(64),
    });
  });
  it("does not display a layout or seed controls when the core document is missing", async () => {
    const spy = vi.spyOn(Client.prototype, "request");
    mount("studio-a-missing");
    await screen.findByText(t.missing);
    expect(
      screen.queryByRole("complementary", { name: t.layoutLabel }),
    ).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(
      spy.mock.calls.filter(([r]) => r.method !== "studio.get"),
    ).toHaveLength(0);
  });
});
