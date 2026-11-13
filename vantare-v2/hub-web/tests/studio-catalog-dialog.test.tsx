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
import { useLayoutEffect, useRef, useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createMockHost } from "../src/mock/host";
import { HostProvider } from "../src/renderer/app/Host";
import { UiProvider } from "../src/renderer/app/UiState";
import { Client } from "../src/renderer/bridge/client";
import { studioText as t } from "../src/renderer/i18n/studio";
import { studioCatalogText as text } from "../src/renderer/i18n/studio-catalog";
import {
  StudioProvider,
  useStudio,
} from "../src/renderer/screens/studio/state";
import { TooltipProvider } from "../src/renderer/ui/Layers";
import { CatalogDialog } from "../src/renderer/ui/studio/CatalogDialog";
import { MoreMenu } from "../src/renderer/ui/studio/MoreMenu";
import { RemoveWidget } from "../src/renderer/ui/studio/RemoveWidget";
import { StudioFocus } from "../src/renderer/ui/studio/StudioFocus";
import { WindowDialogProvider } from "../src/renderer/ui/WindowDialog";

const caches: QueryClient[] = [];
const plans = vi.fn();
const added = vi.fn();
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
  vi.unstubAllGlobals();
  plans.mockReset();
  added.mockReset();
  caches.splice(0).forEach((cache) => {
    cache.clear();
  });
  window.history.replaceState(null, "", "/");
});

function Probe() {
  const [open, setOpen] = useState(false);
  const state = useStudio();
  const seen = useRef<string | undefined>(undefined);
  useLayoutEffect(() => {
    if (state.added && state.added.revision !== seen.current) {
      seen.current = state.added.revision;
      state.setSelected(state.added.id);
      setOpen(false);
      added(state.added.id);
    }
  });
  const view = state.view;
  const item = view?.instances[0];
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Abrir catálogo
      </button>
      <output data-testid="selection">{state.selected}</output>
      <CatalogDialog open={open} onOpenChange={setOpen} onPlans={plans} />
      {item && view && (
        <MoreMenu
          item={item}
          view={view}
          pending={state.pending}
          onRemove={() => state.setRemoving(item.id)}
        />
      )}
      <RemoveWidget />
    </>
  );
}
function mount(scene = "studio-base", realScreen = false) {
  window.history.replaceState(null, "", `/?escena=${scene}`);
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  caches.push(cache);
  render(
    <QueryClientProvider client={cache}>
      <HostProvider>
        <CSPProvider disableStyleElements>
          <TooltipProvider>
            <UiProvider>
              <WindowDialogProvider>
                <StudioProvider>
                  {realScreen ? <StudioFocus /> : <Probe />}
                </StudioProvider>
              </WindowDialogProvider>
            </UiProvider>
          </TooltipProvider>
        </CSPProvider>
      </HostProvider>
    </QueryClientProvider>,
  );
}
async function openCatalog() {
  await userEvent.click(screen.getByRole("button", { name: "Abrir catálogo" }));
  return screen.findByRole("dialog", { name: t.catalog });
}

it("keeps Add named and operable when the compact strip hides its visible text", async () => {
  mount("studio-base", true);
  await screen.findByRole("button", { name: /^Standings,/ });
  const trigger = await screen.findByRole("button", { name: t.add });
  const label = Array.from(trigger.querySelectorAll<HTMLElement>("span")).find(
    (node) => node.textContent === t.add && !node.querySelector("svg"),
  );
  if (!label) throw new Error("missing strip label");
  label.hidden = true;
  expect(screen.getByRole("button", { name: t.add })).toBe(trigger);
  await userEvent.click(trigger);
  await screen.findByRole("dialog", { name: t.catalog });
});

it("focuses search and restores the opener after Escape without adding anything", async () => {
  const requests = vi.spyOn(Client.prototype, "request");
  mount();
  const dialog = await openCatalog();
  await waitFor(() =>
    expect(document.activeElement).toBe(
      within(dialog).getByRole("searchbox", { name: t.search }),
    ),
  );
  await userEvent.keyboard("{Escape}");
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: t.catalog })).toBeNull(),
  );
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Abrir catálogo" }),
  );
  expect(
    requests.mock.calls.some(([request]) => request.method === "studio.add"),
  ).toBe(false);
});

it("filters by search and category, supports clearing and explains an empty result", async () => {
  mount();
  const dialog = await openCatalog();
  await within(dialog).findByRole("button", {
    name: `${t.addShort} Standings`,
  });
  const search = within(dialog).getByRole("searchbox", { name: t.search });
  fireEvent.change(search, { target: { value: "DELTA" } });
  expect(
    within(dialog).getByRole("button", { name: `${t.addShort} Delta` }),
  ).toBeTruthy();
  fireEvent.click(within(dialog).getByRole("button", { name: "Coche" }));
  expect(within(dialog).getByText(t.noResults)).toBeTruthy();
  fireEvent.click(
    within(dialog).getByRole("button", { name: text.catalogClear }),
  );
  expect(
    within(dialog).getByRole("button", { name: `${t.addShort} Fuel y stint` }),
  ).toBeTruthy();
  expect(
    within(dialog).queryByRole("button", { name: `${t.addShort} Delta` }),
  ).toBeNull();
});

it("keeps Pro cards focusable, marked and inert for mouse and keyboard", async () => {
  const requests = vi.spyOn(Client.prototype, "request");
  mount("studio-pro-bloqueado");
  const dialog = await openCatalog();
  const card = await within(dialog).findByRole("button", {
    name: `${t.addShort} Fuel y stint`,
  });
  expect(card.getAttribute("aria-disabled")).toBe("true");
  expect(
    within(card).getByText(text.catalogPro, {
      selector: ".v-studio-catalog-badge",
    }),
  ).toBeTruthy();
  card.focus();
  await userEvent.keyboard("{Enter} ");
  fireEvent.click(card);
  expect(
    requests.mock.calls.some(([request]) => request.method === "studio.add"),
  ).toBe(false);
  expect(added).not.toHaveBeenCalled();
});

it("moves vertically using the actual grid column count and horizontally with arrows", async () => {
  mount();
  const dialog = await openCatalog();
  await within(dialog).findByRole("button", {
    name: `${t.addShort} Standings`,
  });
  const grid = Array.from(
    dialog.querySelectorAll<HTMLElement>(".v-studio-catalog-grid"),
  ).find((node) => node.querySelectorAll("[data-kind]").length >= 4);
  if (!grid) throw new Error("missing populated catalogue group");
  grid.style.gridTemplateColumns = "1fr 1fr";
  const cards = Array.from(
    grid.querySelectorAll<HTMLButtonElement>("[data-kind]"),
  );
  cards[0].focus();
  fireEvent.keyDown(cards[0], { key: "ArrowDown" });
  expect(document.activeElement).toBe(cards[2]);
  fireEvent.keyDown(cards[2], { key: "ArrowRight" });
  expect(document.activeElement).toBe(cards[3]);
  grid.style.gridTemplateColumns = "1fr";
  fireEvent.keyDown(cards[3], { key: "ArrowUp" });
  expect(document.activeElement).toBe(cards[2]);
});

it("adds once with the read revision, selects the new instance and closes the catalogue", async () => {
  const requests = vi.spyOn(Client.prototype, "request");
  mount();
  const dialog = await openCatalog();
  const card = await within(dialog).findByRole("button", {
    name: `${t.addShort} Delta`,
  });
  fireEvent.click(card);
  fireEvent.click(card);
  await waitFor(() => expect(added).toHaveBeenCalledOnce());
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: t.catalog })).toBeNull(),
  );
  expect(screen.getByTestId("selection").textContent).toBe(
    added.mock.calls[0][0],
  );
  expect(
    requests.mock.calls
      .filter(([request]) => request.method === "studio.add")
      .map(([request]) => request),
  ).toEqual([
    { method: "studio.add", kind: "delta", baseRevision: "0".repeat(64) },
  ]);
});

it("keeps the catalogue open on conflict and does not announce a successful add", async () => {
  mount("studio-error");
  const dialog = await openCatalog();
  fireEvent.click(
    await within(dialog).findByRole("button", { name: `${t.addShort} Delta` }),
  );
  await within(dialog).findByText(t.conflict);
  expect(dialog.isConnected).toBe(true);
  expect(added).not.toHaveBeenCalled();
});

it("explains unavailable More actions without sending anything, then opens RemoveWidget", async () => {
  const requests = vi.spyOn(Client.prototype, "request");
  mount();
  const trigger = await screen.findByRole("button", { name: text.moreLabel });
  await userEvent.click(trigger);
  const menu = await screen.findByRole("menu");
  for (const name of [t.edit, t.obs]) {
    const item = within(menu).getByRole("menuitem", { name: new RegExp(name) });
    expect(item.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(item);
  }
  expect(within(menu).getByText(text.moreEditHelp)).toBeTruthy();
  expect(within(menu).getByText(text.moreObsHelp)).toBeTruthy();
  expect(
    requests.mock.calls.some(([request]) => request.method === "studio.remove"),
  ).toBe(false);
  await userEvent.click(
    within(menu).getByRole("menuitem", { name: /Eliminar Standings/ }),
  );
  await screen.findByRole("dialog", { name: t.removeTitle });
  expect(
    requests.mock.calls.some(([request]) => request.method === "studio.remove"),
  ).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: t.cancel }));
  await waitFor(() => expect(document.activeElement).toBe(trigger));
});

it("returns focus to More after Escape", async () => {
  mount();
  const trigger = await screen.findByRole("button", { name: text.moreLabel });
  await userEvent.click(trigger);
  await screen.findByRole("menu");
  await userEvent.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  expect(document.activeElement).toBe(trigger);
});

it("keeps protected catalogue entries inert and explains why", async () => {
  const requests = vi.spyOn(Client.prototype, "request");
  mount("studio-protegido");
  const dialog = await openCatalog();
  const card = await within(dialog).findByRole("button", {
    name: `${t.addShort} Delta`,
  });
  expect(dialog.querySelector(".v-callout")?.textContent).toContain(
    text.catalogProtected,
  );
  expect(card.getAttribute("aria-disabled")).toBe("true");
  fireEvent.click(card);
  expect(
    requests.mock.calls.some(([request]) => request.method === "studio.add"),
  ).toBe(false);
});

it.each(["protected", "unverified", "locked", "pending"] as const)(
  "prevents removal and exposes the %s reason in More",
  async (condition) => {
    const host = createMockHost("studio-base");
    const reply = host({
      kind: "request",
      id: 1,
      request: { method: "studio.get" },
    });
    if (reply?.kind !== "response" || reply.result.method !== "studio.get")
      throw new Error("missing view");
    const view = reply.result.value;
    const item = view.instances[0];
    const remove = vi.fn();
    if (condition === "protected") view.state = "protected";
    if (condition === "unverified") view.plan = "unverified";
    if (condition === "locked") item.locked = true;
    render(
      <CSPProvider disableStyleElements>
        <MoreMenu
          item={item}
          view={view}
          pending={condition === "pending"}
          onRemove={remove}
        />
      </CSPProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: text.moreLabel }));
    const menu = await screen.findByRole("menu");
    const action = within(menu).getByRole("menuitem", {
      name: /Eliminar Standings/,
    });
    expect(action.getAttribute("aria-disabled")).toBe("true");
    const reason =
      condition === "protected"
        ? text.catalogProtected
        : condition === "unverified"
          ? t.verifyWidget
          : condition === "locked"
            ? t.lockedWidget
            : t.saving;
    expect(within(action).getByText(reason)).toBeTruthy();
    fireEvent.click(action);
    expect(remove).not.toHaveBeenCalled();
  },
);

it("keeps unavailable More actions in the arrow-key order without activating or closing", async () => {
  const requests = vi.spyOn(Client.prototype, "request");
  mount();
  const user = userEvent.setup();
  const trigger = await screen.findByRole("button", { name: text.moreLabel });
  await user.click(trigger);
  const menu = await screen.findByRole("menu");
  await waitFor(() => expect(menu.contains(document.activeElement)).toBe(true));
  await user.keyboard("{Home}");
  const place = within(menu).getByRole("menuitem", {
    name: /^Colocar en pantalla/,
  });
  const obs = within(menu).getByRole("menuitem", { name: /^Publicar en OBS/ });
  await waitFor(() => expect(document.activeElement).toBe(place));
  expect(place.getAttribute("aria-disabled")).toBe("true");
  await user.keyboard("{Enter}{ArrowDown}");
  expect(document.activeElement).toBe(obs);
  expect(obs.getAttribute("aria-disabled")).toBe("true");
  await user.keyboard(" {ArrowDown}");
  expect(document.activeElement).toBe(
    within(menu).getByRole("menuitem", { name: /Eliminar Standings/ }),
  );
  expect(menu.isConnected).toBe(true);
  expect(
    requests.mock.calls.every(([request]) => request.method === "studio.get"),
  ).toBe(true);
});
