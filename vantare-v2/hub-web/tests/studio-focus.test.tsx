// @vitest-environment jsdom

import { CSPProvider } from "@base-ui/react/csp-provider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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
import { initialStudioSelection } from "../src/renderer/screens/studio/selection";
import { StudioProvider } from "../src/renderer/screens/studio/state";
import { TooltipProvider } from "../src/renderer/ui/Layers";
import { StudioFocus } from "../src/renderer/ui/studio/StudioFocus";
import { illustrationSizes } from "../src/renderer/ui/widgets/illustrations";
import { stageGeometry } from "../src/renderer/ui/widgets/WidgetThumb";

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
async function tabTo(
  user: ReturnType<typeof userEvent.setup>,
  element: HTMLElement,
) {
  for (let i = 0; i < 40 && document.activeElement !== element; i++)
    await user.tab();
  expect(document.activeElement).toBe(element);
}
const listRow = (name: string) =>
  screen.findByRole("button", { name: new RegExp(`^${name}, `) });
describe("Studio Foco structure", () => {
  it("selects remembered, then first visible, then first, then none", () => {
    const view = {
      instances: [
        { id: "hidden", visible: false },
        { id: "visible", visible: true },
      ],
    };
    expect(initialStudioSelection(view, "hidden")).toBe("hidden");
    expect(initialStudioSelection(view, "absent")).toBe("visible");
    expect(
      initialStudioSelection(
        { instances: [{ id: "hidden", visible: false }] },
        null,
      ),
    ).toBe("hidden");
    expect(initialStudioSelection({ instances: [] }, "absent")).toBeNull();
  });
  it("fits a stage drawing without cropping or exceeding its 2.6 scale", () => {
    const natural = illustrationSizes.delta;
    expect(stageGeometry("delta", 10000, 10000)).toEqual({
      width: natural.width * 2.6,
      height: natural.height * 2.6,
      cropped: false,
    });
    const small = stageGeometry("delta", 200, 100);
    expect(small.width).toBeLessThanOrEqual(200);
    expect(small.height).toBeLessThanOrEqual(100);
    expect(small.width / small.height).toBeCloseTo(
      natural.width / natural.height,
    );
  });
  it("uses real Tab, arrows, Home/End and Enter without moving focus on a click", async () => {
    mount();
    const user = userEvent.setup();
    const first = await listRow("Standings");
    await tabTo(user, first);
    await user.keyboard("{ArrowDown}");
    const delta = await listRow("Delta");
    expect(delta.getAttribute("aria-pressed")).toBe("true");
    expect(document.activeElement).toBe(delta);
    await user.keyboard("{End}");
    const fuel = await listRow("Fuel y stint");
    expect(document.activeElement).toBe(fuel);
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(fuel);
    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(first);
    await user.keyboard("{Enter}");
    expect(document.activeElement).toBe(
      screen.getByRole("tab", { name: t.track }),
    );
    await user.click(delta);
    expect(document.activeElement).toBe(delta);
  });
  it("sends the same CAS visibility request using Space", async () => {
    const requests = vi.spyOn(Client.prototype, "request");
    mount();
    const user = userEvent.setup();
    const first = await listRow("Standings");
    await tabTo(user, first);
    await user.keyboard(" ");
    await waitFor(() =>
      expect(
        requests.mock.calls.some(
          ([request]) =>
            request.method === "studio.visibility" &&
            request.id === "widget-1" &&
            request.visible === false &&
            request.baseRevision === "0".repeat(64),
        ),
      ).toBe(true),
    );
    await waitFor(() =>
      expect(first.getAttribute("aria-label")).toContain(t.hidden),
    );
    expect(document.activeElement).toBe(first);
  });
  it("opens removal with Delete, returns focus on cancellation, and Esc never opens the catalogue", async () => {
    mount();
    const user = userEvent.setup();
    const first = await listRow("Standings");
    await tabTo(user, first);
    await user.keyboard("{Delete}");
    await screen.findByRole("dialog", { name: t.removeTitle });
    await user.click(screen.getByRole("button", { name: t.cancel }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(first));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("searchbox", { name: t.search })).toBeNull();
  });
  it("restores the chosen overlay when Studio remounts in the same Hub session", async () => {
    mount();
    const user = userEvent.setup();
    const delta = await listRow("Delta");
    await user.click(delta);
    await user.click(screen.getByRole("button", { name: "Toggle Studio" }));
    await user.click(screen.getByRole("button", { name: "Toggle Studio" }));
    expect((await listRow("Delta")).getAttribute("aria-pressed")).toBe("true");
  });
  it("starts with the first visible overlay and blocks showing an empty layout", async () => {
    mount("studio-oculto");
    expect((await listRow("Delta")).getAttribute("aria-pressed")).toBe("true");
    cleanup();
    mount("studio-vacio");
    const show = await screen.findByRole("button", { name: t.show });
    expect(show.hasAttribute("disabled")).toBe(true);
  });
});
