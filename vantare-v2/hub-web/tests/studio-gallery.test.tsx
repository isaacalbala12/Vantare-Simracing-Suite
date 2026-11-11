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
import { Client } from "../src/renderer/bridge/client";
import { studioText as t } from "../src/renderer/i18n/studio";
import { StudioProvider } from "../src/renderer/screens/studio/state";
import { TooltipProvider } from "../src/renderer/ui/Layers";
import { Gallery } from "../src/renderer/ui/studio/Gallery";
import { StudioRail } from "../src/renderer/ui/studio/Rail";

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
            <StudioProvider>
              <Gallery />
              <StudioRail />
            </StudioProvider>
          </TooltipProvider>
        </CSPProvider>
      </HostProvider>
    </QueryClientProvider>,
  );
}
describe("Studio gallery", () => {
  it("toggles membership with a revision and offers no geometry controls", async () => {
    const requests = vi.spyOn(Client.prototype, "request");
    mount();
    const card = await screen.findByRole("button", {
      name: "Standings",
    });
    const article = card.closest("article");
    if (!article) throw new Error("Missing card");
    fireEvent.click(
      within(article).getByRole("button", { name: t.hideWidget }),
    );
    await waitFor(() =>
      expect(within(article).getByText(t.hidden)).toBeTruthy(),
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
    expect(
      screen.getByRole("button", { name: t.edit }).hasAttribute("disabled"),
    ).toBe(true);
  });
  it("requires confirmation again after a removal conflict", async () => {
    const requests = vi.spyOn(Client.prototype, "request");
    mount("studio-error");
    await screen.findByRole("button", { name: "Standings" });
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
    expect(screen.getByRole("button", { name: "Standings" })).toBeTruthy();
  });
  it("adds from the catalog and undoes only that addition", async () => {
    const requests = vi.spyOn(Client.prototype, "request");
    mount("studio-vacio");
    await screen.findByText(t.empty);
    const catalogButton = await screen.findByRole("button", {
      name: /Standings/,
    });
    fireEvent.click(catalogButton);
    await screen.findByText(t.added);
    expect(
      await screen.findByRole("button", { name: "Standings" }),
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
    expect(screen.queryByRole("button", { name: "Standings" })).toBeNull();
  });
  it("searches descriptions without accents and blocks locked choices", async () => {
    const requests = vi.spyOn(Client.prototype, "request");
    mount("studio-pro-bloqueado");
    await screen.findByRole("button", { name: "Standings" });
    fireEvent.click(screen.getByRole("button", { name: t.addShort }));
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
      name: "Standings",
    });
    card.focus();
    fireEvent.keyDown(card, { key: " " });
    await waitFor(() =>
      expect(
        requests.mock.calls.some(([r]) => r.method === "studio.visibility"),
      ).toBe(true),
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(
      await screen.findByRole("searchbox", { name: t.search }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: t.show }));
    await screen.findByRole("button", { name: t.hide });
    expect(
      requests.mock.calls.find(([r]) => r.method === "studio.track")?.[0],
    ).toEqual({ method: "studio.track", show: true });
  });
  it("saves session and off-track choices as closed patches", async () => {
    const requests = vi.spyOn(Client.prototype, "request");
    mount();
    await screen.findByRole("button", { name: "Standings" });
    fireEvent.click(screen.getByRole("tab", { name: t.track }));
    fireEvent.click(await screen.findByRole("checkbox", { name: t.practice }));
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
});
