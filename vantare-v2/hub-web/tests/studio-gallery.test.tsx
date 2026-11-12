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
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
import { UiProvider, useUi } from "../src/renderer/app/UiState";
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
function RailProbe() {
  const collapsed = useUi((state) => state.railCollapsed),
    toggle = useUi((state) => state.toggleRail);
  return (
    <button type="button" aria-pressed={collapsed} onClick={toggle}>
      QA toggle rail
    </button>
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
              <RailProbe />
              <StudioProvider>
                <StudioFocus />
              </StudioProvider>
            </UiProvider>
          </TooltipProvider>
        </CSPProvider>
      </HostProvider>
    </QueryClientProvider>,
  );
}
async function tabTo(
  user: ReturnType<typeof userEvent.setup>,
  element: HTMLElement,
) {
  for (let index = 0; index < 80 && document.activeElement !== element; index++)
    await user.tab();
  expect(document.activeElement).toBe(element);
}
describe("Studio Foco interactions", () => {
  it("explains unavailable native actions in More without activating them", async () => {
    const requests = vi.spyOn(Client.prototype, "request");
    mount();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: t.moreLabel }));
    const action = await screen.findByRole("menuitem", {
      name: /^Colocar en pantalla/,
    });
    expect(action.getAttribute("aria-disabled")).toBe("true");
    expect(within(action).getByText(t.editHelp)).toBeTruthy();
    fireEvent.click(action);
    expect(
      requests.mock.calls.every(([request]) => request.method === "studio.get"),
    ).toBe(true);
    await user.keyboard("{Escape}");
  });
  it("moves vertically by the catalog's actual columns after resizing", async () => {
    mount();
    await screen.findByRole("button", { name: /^Standings,/ });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: t.add }));
    const grid = Array.from(
      document.querySelectorAll<HTMLFieldSetElement>(".v-studio-catalog-grid"),
    ).find(
      (node) => node.querySelectorAll("[data-kind]:not(:disabled)").length >= 4,
    );
    if (!grid) throw new Error("Missing populated catalog group");
    const buttons = Array.from(
      grid.querySelectorAll<HTMLButtonElement>("[data-kind]:not(:disabled)"),
    );
    grid.style.gridTemplateColumns = "100px 100px 100px";
    await tabTo(user, buttons[0]);
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(buttons[3]);
    await user.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(buttons[0]);
    grid.style.gridTemplateColumns = "300px";
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(buttons[1]);
  });
  it("toggles membership with a revision and offers no geometry controls", async () => {
    const requests = vi.spyOn(Client.prototype, "request");
    mount();
    const card = await screen.findByRole("button", {
      name: /^Standings,/,
    });
    const article = card.closest(".v-focus-row");
    if (!article) throw new Error("Missing card");
    fireEvent.click(
      within(article).getByRole("button", { name: t.hideWidget }),
    );
    await waitFor(() =>
      expect(
        within(article).getByText(new RegExp(`^${t.hidden}`)),
      ).toBeTruthy(),
    );
    const call = requests.mock.calls.find(
      ([r]) => r.method === "studio.visibility",
    )?.[0];
    expect(call).toMatchObject({
      method: "studio.visibility",
      id: "widget-1",
      visible: false,
      baseRevision: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(screen.queryByRole("spinbutton")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: t.moreLabel }));
    expect(
      screen
        .getByRole("menuitem", { name: /^Colocar en pantalla/ })
        .getAttribute("aria-disabled"),
    ).toBe("true");
  });
  it("adds from the catalog and undoes only that addition", async () => {
    const requests = vi.spyOn(Client.prototype, "request");
    mount("studio-vacio");
    await screen.findByText(t.empty);
    fireEvent.click(
      screen.getAllByRole("button", { name: t.add, exact: true })[0],
    );
    const catalogButton = await screen.findByRole("button", {
      name: "Añadir Standings",
    });
    fireEvent.click(catalogButton);
    await screen.findByText(t.addedName("Standings"));
    expect(
      await screen.findByRole("button", { name: /^Standings,/ }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: t.undo }));
    await screen.findByText(t.empty);
    expect(
      requests.mock.calls.filter(([r]) => r.method === "studio.add"),
    ).toHaveLength(1);
  });
  it("keeps protected and missing layouts read-only", async () => {
    mount("studio-missing");
    await screen.findByText(t.missingHelp);
    expect(
      screen.getByRole("button", { name: t.show }).hasAttribute("disabled"),
    ).toBe(true);
    expect(screen.queryByRole("button", { name: /^Standings,/ })).toBeNull();
  });
  it("searches descriptions without accents and blocks locked choices", async () => {
    const requests = vi.spyOn(Client.prototype, "request");
    mount("studio-pro-bloqueado");
    await screen.findByRole("button", { name: /^Standings,/ });
    fireEvent.click(screen.getByRole("button", { name: t.add }));
    const search = await screen.findByRole("searchbox", { name: t.search });
    fireEvent.change(search, { target: { value: "clasificacion" } });
    expect(
      screen.getByRole("button", { name: "Añadir Standings" }),
    ).toBeTruthy();
    fireEvent.change(search, { target: { value: "telemetria de entrada" } });
    const widget = screen.getByRole("button", {
      name: "Añadir Telemetría de entrada",
    });
    expect(widget.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(widget);
    expect(
      requests.mock.calls.filter(([r]) => r.method === "studio.add"),
    ).toHaveLength(0);
    fireEvent.change(search, { target: { value: "no existe este widget" } });
    expect(screen.getByText(t.noResults)).toBeTruthy();
  });
  it("keeps visibility keyboard actions and track requests independent of geometry", async () => {
    const requests = vi.spyOn(Client.prototype, "request");
    mount();
    const card = await screen.findByRole("button", {
      name: /^Standings,/,
    });
    card.focus();
    fireEvent.keyDown(card, { key: " " });
    await waitFor(() =>
      expect(
        requests.mock.calls.some(([r]) => r.method === "studio.visibility"),
      ).toBe(true),
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("searchbox", { name: t.search })).toBeNull();
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: t.show })
          .getAttribute("aria-disabled"),
      ).toBe("false"),
    );
    fireEvent.click(screen.getByRole("button", { name: t.show }));
    await screen.findByRole("button", { name: t.hide });
    expect(
      requests.mock.calls.find(([r]) => r.method === "studio.track")?.[0],
    ).toEqual({ method: "studio.track", show: true });
  });
  it("moves between rows with arrows, keeps focus on click and does not open the catalogue with Escape", async () => {
    mount();
    const first = await screen.findByRole("button", { name: /^Standings,/ });
    const next = screen.getByRole("button", { name: /^Delta,/ });
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowDown" });
    expect(document.activeElement).toBe(next);
    fireEvent.click(next);
    expect(document.activeElement).toBe(next);
    fireEvent.keyDown(next, { key: "Escape" });
    expect(screen.queryByRole("searchbox", { name: t.search })).toBeNull();
    expect(document.activeElement).toBe(next);
  });
  it("can withdraw overlays even when the layout is protected and rights expired", async () => {
    const requests = vi.spyOn(Client.prototype, "request");
    mount("studio-protegido-mostrando");
    const hide = await screen.findByRole("button", { name: t.hide });
    expect(hide.hasAttribute("disabled")).toBe(false);
    fireEvent.click(hide);
    const show = await screen.findByRole("button", { name: t.show });
    expect(show.hasAttribute("disabled")).toBe(true);
    expect(
      requests.mock.calls.find(([r]) => r.method === "studio.track")?.[0],
    ).toEqual({ method: "studio.track", show: false });
  });
  it("requires confirmation again after a removal conflict", async () => {
    const requests = vi.spyOn(Client.prototype, "request");
    mount("studio-error");
    await screen.findByRole("button", { name: /^Standings,/ });
    fireEvent.click(screen.getByRole("tab", { name: t.track }));
    fireEvent.click(await screen.findByRole("button", { name: t.remove }));
    const dialog = await screen.findByRole("dialog", { name: t.removeTitle });
    fireEvent.click(within(dialog).getByRole("button", { name: t.remove }));
    await screen.findByText(t.reconfirm);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: t.retry })).toBeNull();
    expect(
      requests.mock.calls.filter(([r]) => r.method === "studio.remove"),
    ).toHaveLength(1);
    expect(screen.getByRole("button", { name: /^Standings,/ })).toBeTruthy();
  });
  it("saves session and off-track choices as closed patches", async () => {
    const requests = vi.spyOn(Client.prototype, "request");
    mount();
    await screen.findByRole("button", { name: /^Standings,/ });
    fireEvent.click(screen.getByRole("tab", { name: t.track }));
    fireEvent.click(await screen.findByRole("switch", { name: t.practice }));
    await waitFor(() =>
      expect(
        requests.mock.calls.some(
          ([r]) => r.method === "studio.instance" && r.patch.field === "showIn",
        ),
      ).toBe(true),
    );
    await waitFor(() =>
      expect(
        screen
          .getByRole("combobox", { name: t.offTrack })
          .hasAttribute("disabled"),
      ).toBe(false),
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox", { name: t.offTrack }));
    await user.click(await screen.findByRole("option", { name: t.always }));
    await waitFor(() =>
      expect(
        requests.mock.calls.some(
          ([r]) =>
            r.method === "studio.instance" &&
            r.patch.field === "offTrack" &&
            r.patch.value === "alwaysVisible",
        ),
      ).toBe(true),
    );
    expect(
      requests.mock.calls.find(
        ([r]) => r.method === "studio.instance" && r.patch.field === "showIn",
      )?.[0],
    ).toMatchObject({
      id: "widget-1",
      patch: {
        field: "showIn",
        value: { practice: false, qualifying: true, race: true },
      },
      baseRevision: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });
  it("commits opacity with the native bounds after keyboard adjustment", async () => {
    const requests = vi.spyOn(Client.prototype, "request");
    mount();
    await screen.findByRole("button", { name: /^Standings,/ });
    fireEvent.click(screen.getByRole("tab", { name: t.track }));
    const slider = await screen.findByRole("slider", { name: t.opacity });
    expect(slider.getAttribute("min")).toBe("20");
    expect(slider.getAttribute("max")).toBe("100");
    slider.focus();
    await userEvent.setup().keyboard("{ArrowLeft}");
    await waitFor(() =>
      expect(
        requests.mock.calls.some(
          ([r]) =>
            r.method === "studio.instance" &&
            r.patch.field === "opacity" &&
            r.patch.value === 99,
        ),
      ).toBe(true),
    );
  });
  it("opens the same confirmation with Delete without removing until confirmed", async () => {
    const requests = vi.spyOn(Client.prototype, "request");
    mount();
    const card = await screen.findByRole("button", {
      name: /^Standings,/,
    });
    fireEvent.keyDown(card, { key: "Delete" });
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(t.removeNamed("Standings"))).toBeTruthy();
    expect(
      requests.mock.calls.some(([r]) => r.method === "studio.remove"),
    ).toBe(false);
    fireEvent.click(within(dialog).getByRole("button", { name: t.cancel }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: /^Standings,/ })).toBeTruthy();
  });
  it("adds a suggested kind once and keeps its name and owned count in the catalog", async () => {
    const requests = vi.spyOn(Client.prototype, "request");
    mount("studio-pocos");
    await screen.findByRole("button", { name: /^Standings,/ });
    fireEvent.click(screen.getByRole("button", { name: t.add, exact: true }));
    const suggestion = within(
      await screen.findByRole("group", { name: t.kit }),
    ).getAllByRole("button")[0];
    const name = suggestion
      .getAttribute("aria-label")
      ?.slice(t.addShort.length + 1);
    if (!name) throw new Error("Missing suggestion name");
    fireEvent.click(suggestion);
    await screen.findByRole("button", { name: new RegExp(`^${name},`) });
    fireEvent.click(screen.getByRole("button", { name: t.add }));
    await screen.findByText(t.addedName(name));
    const catalog = screen.getByRole("button", {
      name: `${t.addShort} ${name}`,
    });
    expect(within(catalog).getByText(t.owned(1))).toBeTruthy();
    expect(
      requests.mock.calls.filter(([r]) => r.method === "studio.add"),
    ).toHaveLength(1);
  });
  it("filters thirty overlays without writing the document", async () => {
    const requests = vi.spyOn(Client.prototype, "request");
    mount("studio-muchos");
    await screen.findByRole("button", { name: /^Standings 1,/ });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: t.filters.hidden }));
    expect(await screen.findByText(t.noHidden)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Standings 1,/ })).toBeNull();
    await user.click(screen.getByRole("button", { name: t.filters.all }));
    expect(
      await screen.findByRole("button", { name: /^Standings 1,/ }),
    ).toBeTruthy();
    expect(requests.mock.calls.every(([r]) => r.method === "studio.get")).toBe(
      true,
    );
  });
  it("opens the catalogue without changing the collapsed rail", async () => {
    mount();
    await screen.findByRole("button", { name: /^Standings,/ });
    fireEvent.click(screen.getByRole("button", { name: "QA toggle rail" }));
    fireEvent.click(
      screen.getByRole("button", { name: new RegExp(`^${t.add}`) }),
    );
    expect(
      screen
        .getByRole("button", { name: "QA toggle rail" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    const search = await screen.findByRole("searchbox", { name: t.search });
    await waitFor(() => expect(document.activeElement).toBe(search));
  });
  it("keeps focus in the filtered gallery after a card leaves it", async () => {
    mount("studio-muchos");
    const first = await screen.findByRole("button", { name: /^Standings 1,/ });
    fireEvent.keyDown(first, { key: " " });
    await waitFor(() =>
      expect(first.closest(".v-focus-row")?.getAttribute("data-hidden")).toBe(
        "true",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: t.filters.hidden }));
    const show = screen.getByRole("button", { name: t.showWidget });
    show.focus();
    fireEvent.click(show);
    await screen.findByText(t.noHidden);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: t.add, exact: true }),
    );
  });
  it("puts a filtered card in the real Tab order when selection is outside the filter", async () => {
    mount("studio-muchos");
    const user = userEvent.setup();
    const delta = await screen.findByRole("button", { name: /^Delta 1,/ });
    const article = delta.closest(".v-focus-row");
    if (!article) throw new Error("Missing card");
    await user.click(
      within(article).getByRole("button", { name: t.hideWidget }),
    );
    await waitFor(() =>
      expect(article.getAttribute("data-hidden")).toBe("true"),
    );
    await user.click(screen.getByRole("button", { name: t.filters.hidden }));
    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: /^Delta 1,/ }),
    );
  });
  it("removes the selected widget, focuses its neighbor and offers Undo", async () => {
    mount();
    const user = userEvent.setup();
    await screen.findByRole("button", { name: /^Standings,/ });
    await user.click(screen.getByRole("button", { name: t.remove }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: t.remove,
      }),
    );
    await screen.findByText(t.removedName("Standings"));
    expect(screen.queryByRole("button", { name: /^Standings,/ })).toBeNull();
    expect(screen.queryByRole("searchbox", { name: t.search })).toBeNull();
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: /^Delta,/ }),
      ),
    );
    await user.click(screen.getByRole("button", { name: t.undo }));
    expect(
      await screen.findByRole("button", { name: /^Standings,/ }),
    ).toBeTruthy();
    expect(screen.queryByText(t.removedName("Standings"))).toBeNull();
  });
  it("removes an unselected card without losing the current inspector", async () => {
    mount();
    const user = userEvent.setup();
    const first = await screen.findByRole("button", { name: /^Standings,/ });
    await tabTo(user, first);
    fireEvent.keyDown(screen.getByRole("button", { name: /^Delta,/ }), {
      key: "Delete",
    });
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(t.removeNamed("Delta"))).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: t.remove }));
    await screen.findByText(t.removedName("Delta"));
    expect(screen.queryByRole("button", { name: /^Delta,/ })).toBeNull();
    expect(screen.getByRole("heading", { name: "Standings" })).toBeTruthy();
    expect(screen.queryByRole("searchbox", { name: t.search })).toBeNull();
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: /^Relative,/ }),
      ),
    );
    await user.click(screen.getByRole("button", { name: t.undo }));
    expect(await screen.findByRole("button", { name: /^Delta,/ })).toBeTruthy();
  });
  it.each(["card", "inspector"])(
    "returns focus to the %s when deletion is cancelled",
    async (origin) => {
      mount();
      const user = userEvent.setup();
      const card = await screen.findByRole("button", { name: /^Standings,/ });
      const source =
        origin === "card"
          ? card
          : screen.getByRole("button", { name: t.remove });
      if (origin === "card") {
        await tabTo(user, card);
        await user.keyboard("{Delete}");
      } else await user.click(source);
      const dialog = await screen.findByRole("dialog");
      await user.click(within(dialog).getByRole("button", { name: t.cancel }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      await waitFor(() => expect(document.activeElement).toBe(source));
    },
  );
  it("focuses Add after removing the final widget", async () => {
    mount("studio-pocos");
    const user = userEvent.setup();
    const first = await screen.findByRole("button", { name: /^Standings,/ });
    await tabTo(user, first);
    for (const name of ["Standings", "Delta"]) {
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: new RegExp(`^${name},`) }),
      );
      await user.keyboard("{Delete}");
      await user.click(
        within(await screen.findByRole("dialog")).getByRole("button", {
          name: t.remove,
        }),
      );
      await screen.findByText(t.removedName(name));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    }
    await screen.findByText(t.empty);
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getAllByRole("button", { name: t.add, exact: true })[0],
      ),
    );
  });
  it("shows the suggested addition notice and Undo while selecting its inspector", async () => {
    mount("studio-pocos");
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "Standings" });
    fireEvent.click(screen.getByRole("button", { name: t.add, exact: true }));
    const suggestion = within(
      await screen.findByRole("group", { name: t.kit }),
    ).getAllByRole("button")[0];
    const name = suggestion
      .getAttribute("aria-label")
      ?.slice(t.addShort.length + 1);
    if (!name) throw new Error("Missing suggestion name");
    await user.click(suggestion);
    await screen.findByText(t.addedName(name));
    expect(screen.getByRole("heading", { name })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: t.undo }));
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: new RegExp(`^${name},`) }),
      ).toBeNull(),
    );
  });
  it("resets the filter to All when the count drops below nine", async () => {
    mount("studio-nueve");
    const user = userEvent.setup();
    await screen.findByRole("button", { name: /^Standings 1,/ });
    await user.click(screen.getByRole("button", { name: t.filters.visible }));
    await user.click(screen.getByRole("button", { name: t.remove }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: t.remove,
      }),
    );
    await screen.findByText(t.removedName("Standings 1"));
    expect(screen.queryByRole("group", { name: t.filterLabel })).toBeNull();
    await user.click(screen.getByRole("button", { name: t.undo }));
    const filter = await screen.findByRole("group", { name: t.filterLabel });
    expect(
      within(filter)
        .getByRole("button", { name: t.filters.all })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });
  it("rolls opacity back after failure and keeps the saved value after discard", async () => {
    mount();
    const user = userEvent.setup();
    const slider = await screen.findByRole("slider", { name: t.opacity });
    const original = Client.prototype.request;
    vi.spyOn(Client.prototype, "request").mockImplementation(function (
      this: Client,
      request,
      onSent,
    ) {
      if (
        request.method === "studio.instance" &&
        request.patch.field === "opacity"
      )
        return Promise.reject(new HostFailure({ kind: "busy" }));
      return original.call(this, request, onSent);
    });
    await tabTo(user, slider);
    await user.keyboard("{ArrowLeft}");
    expect(
      within(await screen.findByRole("alert")).getByText(t.busy),
    ).toBeTruthy();
    await waitFor(() =>
      expect(slider.getAttribute("aria-valuenow")).toBe("100"),
    );
    expect(document.activeElement).toBe(slider);
    await user.click(screen.getByRole("button", { name: t.discard }));
    expect(slider.getAttribute("aria-valuenow")).toBe("100");
  });
  it("uses the fresh saved opacity when a conflicting edit is discarded", async () => {
    mount();
    const user = userEvent.setup();
    const slider = await screen.findByRole("slider", { name: t.opacity });
    const original = Client.prototype.request;
    vi.spyOn(Client.prototype, "request").mockImplementation(async function (
      this: Client,
      request,
      onSent,
    ) {
      if (
        request.method === "studio.instance" &&
        request.patch.field === "opacity"
      ) {
        const fresh = await original.call(this, { method: "studio.get" });
        if (fresh.method !== "studio.get")
          throw new Error("Missing Studio view");
        fresh.value.instances[0].opacity = 80;
        throw new HostFailure({
          kind: "studioConflict",
          current: fresh.value,
        });
      }
      return original.call(this, request, onSent);
    });
    await tabTo(user, slider);
    await user.keyboard("{ArrowLeft}");
    expect(
      within(await screen.findByRole("alert")).getByText(t.conflict),
    ).toBeTruthy();
    await waitFor(() =>
      expect(slider.getAttribute("aria-valuenow")).toBe("80"),
    );
    await user.click(screen.getByRole("button", { name: t.discard }));
    expect(slider.getAttribute("aria-valuenow")).toBe("80");
  });
  it("keeps the focused slider enabled and blocks more writes while pending", async () => {
    mount();
    const user = userEvent.setup();
    const slider = await screen.findByRole("slider", { name: t.opacity });
    const original = Client.prototype.request;
    let settle: (() => Promise<void>) | undefined;
    const requests = vi
      .spyOn(Client.prototype, "request")
      .mockImplementation(function (this: Client, request, onSent) {
        if (
          request.method === "studio.instance" &&
          request.patch.field === "opacity"
        )
          return new Promise((resolve, reject) => {
            settle = async () => {
              try {
                resolve(await original.call(this, request, onSent));
              } catch (error) {
                reject(error);
              }
            };
          });
        return original.call(this, request, onSent);
      });
    await tabTo(user, slider);
    await user.keyboard("{ArrowLeft}");
    expect(settle).toBeTypeOf("function");
    expect(slider.hasAttribute("disabled")).toBe(false);
    expect(document.activeElement).toBe(slider);
    await user.keyboard("{ArrowLeft}");
    expect(
      requests.mock.calls.filter(
        ([request]) => request.method === "studio.instance",
      ),
    ).toHaveLength(1);
    await user.tab();
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(slider);
    if (!settle) throw new Error("Missing pending request");
    const finish = settle;
    await act(async () => {
      await finish();
    });
    await waitFor(() =>
      expect(slider.getAttribute("aria-valuenow")).toBe("99"),
    );
    expect(document.activeElement).toBe(slider);
  });
  it("opens Appearance by keyboard and saves an accent through the existing CAS contract", async () => {
    const requests = vi.spyOn(Client.prototype, "request");
    mount();
    const user = userEvent.setup();
    await screen.findByRole("slider", { name: t.opacity });
    await tabTo(user, screen.getByRole("tab", { name: t.track }));
    await user.keyboard("{ArrowLeft}{Enter}");
    const appearance = screen.getByRole("tab", { name: t.appearance });
    expect(appearance.getAttribute("aria-selected")).toBe("true");
    await user.click(screen.getByRole("combobox", { name: t.widgetAccent }));
    await user.click(
      await screen.findByRole("option", { name: t.accentGreen }),
    );
    await waitFor(() =>
      expect(
        requests.mock.calls.some(
          ([request]) =>
            request.method === "studio.instance" &&
            request.patch.field === "settings" &&
            request.patch.value.kind === "standings" &&
            request.patch.value.accent === "green",
        ),
      ).toBe(true),
    );
    const control = screen.getByRole("combobox", { name: t.widgetAccent });
    await waitFor(() => expect(control.textContent).toContain(t.accentGreen));
  });
  it("returns to En pista on selecting another widget", async () => {
    mount();
    const user = userEvent.setup();
    await screen.findByRole("slider", { name: t.opacity });
    await user.click(screen.getByRole("tab", { name: t.appearance }));
    await user.click(screen.getByRole("button", { name: /^Delta,/ }));
    expect(
      screen.getByRole("tab", { name: t.track }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.queryByRole("combobox", { name: t.widgetLook })).toBeNull();
  });
  it("keeps Appearance unavailable for untyped widgets", async () => {
    mount();
    const user = userEvent.setup();
    await screen.findByRole("slider", { name: t.opacity });
    await user.click(screen.getByRole("button", { name: t.add }));
    await user.click(
      await screen.findByRole("button", { name: /^Añadir .*Radar/i }),
    );
    await user.click(await screen.findByRole("button", { name: /^Radar,/ }));
    await waitFor(() =>
      expect(
        screen
          .getByRole("tab", { name: t.appearance })
          .getAttribute("aria-disabled"),
      ).toBe("true"),
    );
    expect(screen.queryByText(t.appearanceUnavailable)).toBeNull();
  });
  it("shows the fresh appearance after a revision conflict and can discard the failed patch", async () => {
    mount();
    const user = userEvent.setup();
    await screen.findByRole("slider", { name: t.opacity });
    await user.click(screen.getByRole("tab", { name: t.appearance }));
    const original = Client.prototype.request;
    vi.spyOn(Client.prototype, "request").mockImplementation(async function (
      this: Client,
      request,
      onSent,
    ) {
      if (
        request.method === "studio.instance" &&
        request.patch.field === "settings"
      ) {
        const fresh = await original.call(this, { method: "studio.get" });
        if (fresh.method !== "studio.get" || !fresh.value.instances[0].settings)
          throw new Error("Missing view");
        fresh.value.revision = "f".repeat(64);
        fresh.value.instances[0].settings.accent = "white";
        throw new HostFailure({ kind: "studioConflict", current: fresh.value });
      }
      return original.call(this, request, onSent);
    });
    await user.click(screen.getByRole("combobox", { name: t.widgetAccent }));
    await user.click(
      await screen.findByRole("option", { name: t.accentGreen }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("combobox", { name: t.widgetAccent }).textContent,
      ).toContain(t.accentWhite),
    );
    expect(
      within(screen.getByRole("alert")).getByText(t.conflict),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: t.discard }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      screen.getByRole("combobox", { name: t.widgetAccent }).textContent,
    ).toContain(t.accentWhite);
  });
});
