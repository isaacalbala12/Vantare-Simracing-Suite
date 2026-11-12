// @vitest-environment jsdom
import { CSPProvider } from "@base-ui/react/csp-provider";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  type OverlayInstance,
  studioWidgetDefaults,
  type WidgetSettings,
} from "../src/contract/generated/studio";
import { studioText as t } from "../src/renderer/i18n/studio";
import { AppearanceInspector } from "../src/renderer/ui/studio/AppearanceInspector";

const state = vi.hoisted(() => ({
  view: { state: "ready", plan: "free", revision: "a".repeat(64) },
  pending: false,
  execute: vi.fn(),
}));
vi.mock("../src/renderer/screens/studio/state", () => ({
  useStudio: () => state,
}));
beforeEach(() => {
  state.view = { state: "ready", plan: "free", revision: "a".repeat(64) };
  state.pending = false;
  state.execute.mockReset();
});
afterEach(cleanup);
const instance = (
  kind: "standings" | "relative" | "delta" | "pedals" | "fuel-strategy",
): OverlayInstance => ({
  id: "widget-1",
  kind,
  settings: JSON.parse(
    JSON.stringify(studioWidgetDefaults[kind]),
  ) as WidgetSettings,
  visible: true,
  locked: false,
  opacity: 100,
  showIn: { practice: true, qualifying: true, race: true },
  offTrack: "inherit",
  size: { width: 400, height: 300 },
});
function mount(item = instance("standings")) {
  return render(
    <CSPProvider disableStyleElements>
      <AppearanceInspector item={item} />
    </CSPProvider>,
  );
}
it.each(["standings", "relative", "delta", "pedals", "fuel-strategy"] as const)(
  "writes only the chosen accent with the observed revision for %s",
  async (kind) => {
    mount(instance(kind));
    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox", { name: t.widgetAccent }));
    await user.click(
      await screen.findByRole("option", { name: t.accentGreen }),
    );
    expect(state.execute).toHaveBeenCalledExactlyOnceWith({
      method: "studio.instance",
      id: "widget-1",
      baseRevision: state.view.revision,
      patch: { field: "settings", value: { kind, accent: "green" } },
    });
    expect(screen.getByText(t.appearancePreviewNote)).toBeTruthy();
    expect(screen.getByText(t.brandReadOnly)).toBeTruthy();
  },
);
it("keeps the focused control enabled and blocks writes while saving", async () => {
  const item = instance("standings");
  const mounted = mount(item);
  const user = userEvent.setup();
  const accent = screen.getByRole("combobox", { name: t.widgetAccent });
  while (document.activeElement !== accent) await user.tab();
  state.pending = true;
  mounted.rerender(
    <CSPProvider disableStyleElements>
      <AppearanceInspector item={item} />
    </CSPProvider>,
  );
  expect(document.activeElement).toBe(accent);
  expect(accent.hasAttribute("disabled")).toBe(false);
  expect(accent.getAttribute("aria-disabled")).toBe("true");
  await user.click(accent);
  await user.click(await screen.findByRole("option", { name: t.accentGreen }));
  expect(state.execute).not.toHaveBeenCalled();
});
it.each(["protected", "missing"])(
  "does not present defaults from a %s document",
  (value) => {
    state.view.state = value;
    mount();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByText(t.appearanceUnavailable)).toBeTruthy();
  },
);
it("does not invent settings for an unsupported widget", () => {
  mount({ ...instance("standings"), settings: null });
  expect(screen.queryByRole("combobox")).toBeNull();
});
it.each(["locked", "unverified"])("blocks writes when %s", async (reason) => {
  const item = instance("standings");
  item.locked = reason === "locked";
  if (reason === "unverified") state.view.plan = "unverified";
  mount(item);
  const user = userEvent.setup();
  await user.click(screen.getByRole("combobox", { name: t.widgetLook }));
  await user.click(
    await screen.findByRole("option", { name: t.lookEficiencia }),
  );
  expect(state.execute).not.toHaveBeenCalled();
});
