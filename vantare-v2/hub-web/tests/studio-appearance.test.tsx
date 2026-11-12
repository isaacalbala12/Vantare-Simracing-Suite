// @vitest-environment jsdom
import { CSPProvider } from "@base-ui/react/csp-provider";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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
    expect(screen.queryByText(t.brandReadOnly) !== null).toBe(
      kind === "standings",
    );
  },
);
it("keeps the focused control enabled and blocks writes while saving", async () => {
  const item = instance("standings");
  const mounted = mount(item);
  const user = userEvent.setup();
  const accent = screen.getByRole("combobox", { name: t.widgetAccent });
  for (let index = 0; index < 12 && document.activeElement !== accent; index++)
    await user.tab();
  expect(document.activeElement).toBe(accent);
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
  const look = screen.getByRole("combobox", { name: t.widgetLook });
  expect(look.hasAttribute("disabled")).toBe(true);
  expect(look.getAttribute("aria-busy")).toBeNull();
  expect(screen.queryByText(t.appearancePreviewNote)).toBeNull();
  expect(
    screen.getByText(reason === "unverified" ? t.verifyWidget : t.lockedWidget),
  ).toBeTruthy();
  await user.click(look);
  expect(screen.queryByRole("option")).toBeNull();
  expect(state.execute).not.toHaveBeenCalled();
});

it.each(["standings", "relative", "delta", "pedals", "fuel-strategy"] as const)(
  "sends only designSystem for %s using keyboard selection",
  async (kind) => {
    mount(instance(kind));
    const user = userEvent.setup();
    const lookControl = screen.getByRole("combobox", { name: t.widgetLook });
    for (
      let index = 0;
      index < 12 && document.activeElement !== lookControl;
      index++
    )
      await user.tab();
    expect(document.activeElement).toBe(lookControl);
    await user.keyboard("{ArrowDown}");
    // Options mount before Base UI moves keyboard focus on an animation frame.
    // Home belongs to the popup, not to its still-focused combobox trigger.
    await waitFor(() =>
      expect(screen.getByRole("option", { selected: true })).toBe(
        document.activeElement,
      ),
    );
    await user.keyboard("{Home}");
    await waitFor(() =>
      expect(screen.getByRole("option", { name: t.lookEficiencia })).toBe(
        document.activeElement,
      ),
    );
    await user.keyboard("{Enter}");
    expect(state.execute).toHaveBeenCalledExactlyOnceWith({
      method: "studio.instance",
      id: "widget-1",
      baseRevision: state.view.revision,
      patch: { field: "settings", value: { kind, designSystem: "eficiencia" } },
    });
  },
);
it.each(["standings", "relative", "delta", "pedals", "fuel-strategy"] as const)(
  "sends only style for %s",
  async (kind) => {
    mount(instance(kind));
    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox", { name: t.widgetStyle }));
    await user.click(
      await screen.findByRole("option", { name: t.styleNeutral }),
    );
    expect(state.execute).toHaveBeenCalledExactlyOnceWith({
      method: "studio.instance",
      id: "widget-1",
      baseRevision: state.view.revision,
      patch: { field: "settings", value: { kind, style: "neutro" } },
    });
  },
);
it("hides style and accent for Eficiencia", () => {
  const item = instance("standings");
  if (!item.settings) throw new Error("Missing settings");
  item.settings.designSystem = "eficiencia";
  mount(item);
  expect(screen.getByRole("combobox", { name: t.widgetLook })).toBeTruthy();
  expect(screen.queryByRole("combobox", { name: t.widgetStyle })).toBeNull();
  expect(screen.queryByRole("combobox", { name: t.widgetAccent })).toBeNull();
});
it.each([
  [undefined, t.brandAuto],
  [true, t.brandShown],
  [false, t.brandHidden],
] as const)(
  "shows brand %s as a definition before Look",
  (brandVisible, label) => {
    const item = instance("standings");
    if (!item.settings) throw new Error("Missing settings");
    item.settings.brandVisible = brandVisible;
    mount(item);
    const brand = screen.getAllByRole("definition")[0];
    expect(brand.textContent).toBe(label);
    expect(screen.getByRole("term").textContent).toBe(t.widgetBrand);
    expect(
      Boolean(
        brand.compareDocumentPosition(
          screen.getByRole("combobox", { name: t.widgetLook }),
        ) & Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toBe(true);
  },
);

it.each([
  ["delta", "vantare"],
  ["pedals", "vantare"],
  ["pedals", "eficiencia"],
] as const)(
  "writes only transparentBackground for %s / %s",
  async (kind, look) => {
    const item = instance(kind);
    if (!item.settings) throw new Error("Missing settings");
    item.settings.designSystem = look;
    mount(item);
    const user = userEvent.setup();
    const control = screen.getByRole("switch", {
      name: t.transparentBackground,
    });
    expect(control.getAttribute("aria-checked")).toBe("false");
    await user.click(control);
    expect(state.execute).toHaveBeenCalledExactlyOnceWith({
      method: "studio.instance",
      id: "widget-1",
      baseRevision: state.view.revision,
      patch: {
        field: "settings",
        value: { kind, transparentBackground: true },
      },
    });
    expect(
      Boolean(
        control.compareDocumentPosition(
          screen.getByRole("combobox", { name: t.widgetLook }),
        ) & Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toBe(true);
  },
);
it("does not offer Delta transparency in Eficiencia", () => {
  const item = instance("delta");
  if (!item.settings) throw new Error("Missing settings");
  item.settings.designSystem = "eficiencia";
  mount(item);
  expect(
    screen.queryByRole("switch", { name: t.transparentBackground }),
  ).toBeNull();
});
it("keeps the transparency switch focused while pending and blocks a second send", async () => {
  const item = instance("pedals");
  const mounted = mount(item);
  const user = userEvent.setup();
  const control = screen.getByRole("switch", { name: t.transparentBackground });
  await user.tab();
  expect(document.activeElement).toBe(control);
  state.pending = true;
  mounted.rerender(
    <CSPProvider disableStyleElements>
      <AppearanceInspector item={item} />
    </CSPProvider>,
  );
  expect(control.hasAttribute("disabled")).toBe(false);
  expect(control.getAttribute("aria-disabled")).toBe("true");
  expect(document.activeElement).toBe(control);
  await user.keyboard(" ");
  expect(state.execute).not.toHaveBeenCalled();
});
it.each(["locked", "unverified"])(
  "disables transparency when %s",
  async (reason) => {
    const item = instance("pedals");
    item.locked = reason === "locked";
    if (reason === "unverified") state.view.plan = "unverified";
    mount(item);
    const user = userEvent.setup();
    const control = screen.getByRole("switch", {
      name: t.transparentBackground,
    });
    expect(control.getAttribute("aria-disabled")).toBe("true");
    const nativeInput = control.parentElement?.querySelector<HTMLInputElement>(
      "input[type=checkbox]",
    );
    expect(nativeInput?.disabled).toBe(true);
    expect(control.getAttribute("aria-busy")).toBeNull();
    await user.click(control);
    expect(state.execute).not.toHaveBeenCalled();
  },
);
it("does not invent a transparency value for a protected document", () => {
  state.view.state = "protected";
  mount(instance("pedals"));
  expect(
    screen.queryByRole("switch", { name: t.transparentBackground }),
  ).toBeNull();
});

it.each(["delta", "pedals"] as const)(
  "reads the saved transparency for %s",
  (kind) => {
    const item = instance(kind);
    if (
      !item.settings ||
      (item.settings.kind !== "delta" && item.settings.kind !== "pedals")
    )
      throw new Error("Missing settings");
    item.settings.transparentBackground = true;
    mount(item);
    expect(
      screen
        .getByRole("switch", { name: t.transparentBackground })
        .getAttribute("aria-checked"),
    ).toBe("true");
    expect(state.execute).not.toHaveBeenCalled();
  },
);
