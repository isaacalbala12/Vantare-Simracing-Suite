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
  caches.forEach((c) => { c.clear(); });
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
      exact: true,
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
    await screen.findByRole("button", { name: "Standings", exact: true });
    fireEvent.click(screen.getByRole("tab", { name: t.track, exact: true }));
    fireEvent.click(
      await screen.findByRole("button", { name: t.remove, exact: true }),
    );
    const dialog = await screen.findByRole("dialog", { name: t.removeTitle });
    fireEvent.click(
      within(dialog).getByRole("button", { name: t.remove, exact: true }),
    );
    await screen.findByText(t.reconfirm);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: t.retry })).toBeNull();
    expect(
      requests.mock.calls.filter(([r]) => r.method === "studio.remove"),
    ).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "Standings", exact: true }),
    ).toBeTruthy();
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
      await screen.findByRole("button", { name: "Standings", exact: true }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: t.undo, exact: true }));
    await screen.findByText(t.empty);
    expect(
      requests.mock.calls.filter(([r]) => r.method === "studio.add"),
    ).toHaveLength(1);
  });
  it("keeps protected and missing layouts read-only", async () => {
    mount("studio-missing");
    await screen.findByText(t.missingHelp);
    expect(
      screen
        .getByRole("button", { name: t.show, exact: true })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen.queryByRole("button", { name: "Standings", exact: true }),
    ).toBeNull();
  });
});
