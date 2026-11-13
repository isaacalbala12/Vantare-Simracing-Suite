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
import { studioLimits } from "../src/contract/generated/studio";
import { HostProvider } from "../src/renderer/app/Host";
import { UiProvider } from "../src/renderer/app/UiState";
import { Client, HostFailure } from "../src/renderer/bridge/client";
import { studioText as t } from "../src/renderer/i18n/studio";
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
    expect(screen.getByRole("heading", { name: t.firstWidget })).toBeTruthy();
    const track = screen.getByRole("button", { name: t.show });
    expect(track.hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("group", { name: t.showNeedsWidget })).toBeTruthy();
    fireEvent.click(track);
    expect(
      spy.mock.calls.filter(([r]) => r.method === "studio.track"),
    ).toHaveLength(0);
    const quick = screen.getByRole("region", { name: t.quickStart });
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
      expect(screen.queryByRole("heading", { name: t.firstWidget })).toBeNull(),
    );
  });
  it("opens the real catalogue from the empty call to action", async () => {
    mount("studio-a-vacio");
    await screen.findByRole("heading", { name: t.firstWidget });
    const add = document.querySelector<HTMLButtonElement>(
      ".v-studio-empty-stage > button",
    );
    if (!add) throw new Error("Missing empty-state add action");
    await userEvent.setup().click(add);
    await screen.findByRole("dialog", { name: t.catalog });
    expect(screen.getByRole("searchbox", { name: t.search })).toBeTruthy();
  });
  it("names Add explicitly and opens the catalog from the strip", async () => {
    mount("studio-a-vacio");
    await screen.findByRole("heading", { name: t.firstWidget });
    const strip = screen.getByRole("complementary", { name: t.layoutLabel });
    const add = strip.querySelector<HTMLButtonElement>("[data-add-widget]");
    if (!add) throw new Error("Missing Add button");
    expect(within(strip).getByRole("button", { name: t.add })).toBe(add);
    await userEvent.setup().click(add);
    await screen.findByRole("dialog", { name: t.catalog });
  });
  it("returns focus to a protected empty list without targeting disabled Add", async () => {
    mount("studio-a-ilegible");
    await screen.findByRole("alert");
    await userEvent.click(screen.getByRole("button", { name: t.reload }));
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("region", { name: t.title }),
      ),
    );
    expect(
      screen.getByRole("button", { name: t.add }).hasAttribute("disabled"),
    ).toBe(true);
  });
  it("focuses the newly committed row after a protected document recovers", async () => {
    mount("studio-a-recargar");
    await screen.findByRole("alert");
    expect(screen.queryByRole("button", { name: /^Standings, / })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: t.reload }));
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: /^Standings, / }),
      ),
    );
    expect((document.activeElement as HTMLElement).dataset.widget).toBe(
      "recovered-widget",
    );
  });
  it("recovers an initial read failure without an eternal loading skeleton or fake discard", async () => {
    const requests = vi.spyOn(Client.prototype, "request");
    mount("studio-a-fallo-lectura");
    await screen.findByRole("alert");
    expect(document.querySelector(".v-studio-state-loading")).toBeNull();
    expect(
      document.querySelector('.v-studio-focus [aria-busy="true"]'),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: t.discard })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: t.reload }));
    await screen.findByRole("button", { name: /^Standings, / });
    expect(
      requests.mock.calls.filter(([r]) => r.method === "studio.get"),
    ).toHaveLength(2);
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("focuses the unavailable notice if retrying the read confirms the core is missing", async () => {
    const original = Client.prototype.request;
    vi.spyOn(Client.prototype, "request").mockImplementation(async function (
      this: Client,
      request,
      onSent,
    ) {
      const reply = await original.call(this, request, onSent);
      if (reply.method === "studio.get")
        return {
          ...reply,
          value: { ...reply.value, state: "missing" as const, instances: [] },
        };
      return reply;
    });
    mount("studio-a-fallo-lectura");
    await screen.findByRole("alert");
    await userEvent.click(screen.getByRole("button", { name: t.reload }));
    const notice = await screen.findByRole("region", { name: t.missing });
    await waitFor(() => expect(document.activeElement).toBe(notice));
    expect(
      screen.queryByRole("complementary", { name: t.layoutLabel }),
    ).toBeNull();
  });
  it("keeps protection, reload and Solo lectura visible after a failed reload", async () => {
    const original = Client.prototype.request;
    let reads = 0;
    vi.spyOn(Client.prototype, "request").mockImplementation(function (
      this: Client,
      request,
      onSent,
    ) {
      if (request.method === "studio.get" && ++reads > 1)
        return Promise.reject(new HostFailure({ kind: "io" }));
      return original.call(this, request, onSent);
    });
    mount("studio-a-ilegible");
    await screen.findByRole("alert");
    await userEvent.click(screen.getByRole("button", { name: t.reload }));
    await waitFor(() => expect(screen.getAllByRole("alert")).toHaveLength(2));
    expect(screen.getByText(t.protectedHelp)).toBeTruthy();
    expect(screen.getByRole("button", { name: t.reload })).toBeTruthy();
    expect(screen.queryByRole("button", { name: t.retry })).toBeNull();
    expect(screen.queryByRole("button", { name: t.discard })).toBeNull();
    expect(
      within(
        screen.getByRole("complementary", { name: t.layoutLabel }),
      ).getByRole("status", { name: t.readOnly }),
    ).toBeTruthy();
  });
  it("does not retry a write when its conflict reveals a protected document", async () => {
    const original = Client.prototype.request;
    vi.spyOn(Client.prototype, "request").mockImplementation(async function (
      this: Client,
      request,
      onSent,
    ) {
      if (request.method === "studio.visibility") {
        const reply = await original.call(this, { method: "studio.get" });
        if (reply.method !== "studio.get") throw Error("Missing Studio view");
        throw new HostFailure({
          kind: "studioConflict",
          current: { ...reply.value, state: "protected" },
        });
      }
      return original.call(this, request, onSent);
    });
    mount();
    fireEvent.keyDown(await listRow("Standings"), { key: " " });
    await waitFor(() => expect(screen.getAllByRole("alert")).toHaveLength(2));
    expect(screen.getByText(t.protectedHelp)).toBeTruthy();
    expect(screen.getByRole("button", { name: t.reload })).toBeTruthy();
    expect(screen.queryByRole("button", { name: t.retry })).toBeNull();
  });
  it("retries a conflict with the revision actually changed in the mock host", async () => {
    const original = Client.prototype.request;
    let conflict = true;
    let revision = "";
    const requests = vi
      .spyOn(Client.prototype, "request")
      .mockImplementation(async function (this: Client, request, onSent) {
        if (request.method === "studio.visibility" && conflict) {
          conflict = false;
          const reply = await original.call(this, {
            method: "studio.instance",
            id: request.id,
            patch: { field: "opacity", value: 90 },
            baseRevision: request.baseRevision,
          });
          if (reply.method !== "studio.instance")
            throw Error("Missing changed Studio view");
          revision = reply.value.revision;
          throw new HostFailure({
            kind: "studioConflict",
            current: reply.value,
          });
        }
        return original.call(this, request, onSent);
      });
    mount();
    fireEvent.keyDown(await listRow("Standings"), { key: " " });
    await screen.findByRole("alert");
    expect(
      screen
        .getByRole("button", { name: /^Standings, / })
        .getAttribute("aria-label"),
    ).toContain("90 %");
    await userEvent.click(screen.getByRole("button", { name: t.retry }));
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: /^Standings, / })
          .getAttribute("aria-label"),
      ).toContain(t.hidden),
    );
    const writes = requests.mock.calls.filter(
      ([r]) => r.method === "studio.visibility",
    );
    expect(writes).toHaveLength(2);
    expect(writes[1][0]).toMatchObject({ baseRevision: revision });
    expect(revision).not.toBe("0".repeat(64));
  });
  it.each(["studio-a-limite", "studio-a-no-verificado"])(
    "does not add widgets in %s",
    async (scene) => {
      const requests = vi.spyOn(Client.prototype, "request");
      mount(scene);
      await screen.findAllByRole("button", { name: /^Standings(?: \d+)?,/ });
      const add = await screen.findByRole("button", { name: t.add });
      expect(add.hasAttribute("disabled")).toBe(true);
      if (scene === "studio-a-limite") {
        expect(
          screen.getByText(t.overlaysCount(studioLimits.instances)),
        ).toBeTruthy();
        const trigger = add.closest(".v-tooltip-trigger");
        if (!trigger) throw new Error("Missing Add tooltip trigger");
        await userEvent.hover(trigger);
        fireEvent.mouseMove(trigger, { clientX: 1, clientY: 1 });
        const tooltip = await screen.findByText(
          t.atLimit(studioLimits.instances),
        );
        expect(tooltip.closest(".v-tooltip")).not.toBeNull();
      } else
        expect(
          screen.getByText(t.verifyWidget, { selector: "strong" }),
        ).toBeTruthy();
      fireEvent.click(add);
      expect(requests.mock.calls.some(([r]) => r.method === "studio.add")).toBe(
        false,
      );
    },
  );
  it.each(["studio-a-protegido", "studio-a-ilegible"])(
    "shows only known data and no editable defaults in %s",
    async (scene) => {
      const spy = vi.spyOn(Client.prototype, "request");
      mount(scene);
      await screen.findByRole("alert");
      expect(screen.getByText(t.protectedHelp)).toBeTruthy();
      expect(screen.getByText(t.appearanceUnavailable)).toBeTruthy();
      expect(screen.queryByRole("combobox")).toBeNull();
      expect(screen.queryByRole("switch")).toBeNull();
      expect(screen.queryByRole("slider")).toBeNull();
      expect(
        screen.getByRole("button", { name: t.show }).hasAttribute("disabled"),
      ).toBe(true);
      if (scene === "studio-a-protegido") {
        expect(screen.getByText(t.overlaysCount(4))).toBeTruthy();
        const row = await listRow("Standings");
        fireEvent.keyDown(row, { key: " " });
        fireEvent.keyDown(row, { key: "Delete" });
      } else {
        expect(screen.queryByText(t.overlaysCount(0))).toBeNull();
        expect(
          within(
            screen.getByRole("complementary", { name: t.layoutLabel }),
          ).queryByText(t.empty),
        ).toBeNull();
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
    await screen.findByRole("status", { name: t.loading });
    expect(screen.getAllByRole("status", { name: t.loading })).toHaveLength(1);
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
    // A different control is being saved: keep the track action's label visible.
    const track = screen.getByRole("button", { name: t.show });
    expect(track.getAttribute("aria-disabled")).toBe("true");
    expect(track.getAttribute("aria-busy")).toBeNull();
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
