// @vitest-environment jsdom
import { CSPProvider } from "@base-ui/react/csp-provider";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  type OverlayInstance,
  studioWidgetDefaults,
  type WidgetSettings,
} from "../src/contract/generated/studio";
import { studioText as t } from "../src/renderer/i18n/studio";
import { TooltipProvider } from "../src/renderer/ui/Layers";
import { StudioSteps } from "../src/renderer/ui/studio/StudioSteps";

const state = vi.hoisted(() => ({
  view: { state: "ready", plan: "pro", revision: "a".repeat(64) },
  pending: false,
  failure: undefined,
  execute: vi.fn(),
}));
vi.mock("../src/renderer/screens/studio/state", () => ({
  useStudio: () => state,
}));
beforeEach(() => {
  state.view = { state: "ready", plan: "pro", revision: "a".repeat(64) };
  state.pending = false;
  state.execute.mockReset();
});
afterEach(cleanup);
const kinds = [
  "standings",
  "relative",
  "delta",
  "pedals",
  "fuel-strategy",
] as const;
function item(kind: (typeof kinds)[number]): OverlayInstance {
  return {
    id: "widget-1",
    kind,
    settings: structuredClone(studioWidgetDefaults[kind]) as WidgetSettings,
    visible: true,
    locked: false,
    opacity: 100,
    showIn: { practice: true, qualifying: true, race: true },
    offTrack: "inherit",
    size: { width: 400, height: 300 },
  };
}
function mount(value = item("standings")) {
  return render(
    <CSPProvider disableStyleElements>
      <TooltipProvider>
        <StudioSteps item={value} />
      </TooltipProvider>
    </CSPProvider>,
  );
}
function lastPatch(value: unknown) {
  expect(state.execute).toHaveBeenLastCalledWith({
    method: "studio.instance",
    id: "widget-1",
    baseRevision: state.view.revision,
    patch: { field: "settings", value },
  });
}
it.each(kinds)("keeps the same one-field accent patch for %s", async (kind) => {
  mount(item(kind));
  const user = userEvent.setup();
  await user.click(screen.getByRole("radio", { name: t.accentGreen }));
  lastPatch({ kind, accent: "green" });
  expect(screen.queryByText(t.brandReadOnly) !== null).toBe(
    kind === "standings",
  );
});
it.each(kinds)(
  "selects Look by real keyboard and keeps focus for %s",
  async (kind) => {
    mount(item(kind));
    const user = userEvent.setup();
    const radio = screen.getByRole("radio", { name: t.lookVantare });
    for (let n = 0; n < 30 && document.activeElement !== radio; n++)
      await user.tab();
    expect(document.activeElement).toBe(radio);
    await user.keyboard("{ArrowRight}");
    await waitFor(() => lastPatch({ kind, designSystem: "eficiencia" }));
    expect(document.activeElement).toBe(
      screen.getByRole("radio", { name: t.lookEficiencia }),
    );
  },
);
it.each(["pill", "bar", "expanded"] as const)(
  "sends only Delta format %s",
  async (size) => {
    mount(item("delta"));
    const label = {
      pill: t.deltaPill,
      bar: t.deltaBarFormat,
      expanded: t.deltaExpanded,
    }[size];
    await userEvent.setup().click(screen.getByRole("radio", { name: label }));
    if (size === studioWidgetDefaults.delta.size) {
      expect(state.execute).not.toHaveBeenCalled();
      return;
    }
    lastPatch({ kind: "delta", size });
  },
);
it.each(["compact", "standard", "expanded"] as const)(
  "table format %s is an unselected action, not a saved field",
  async (tablePreset) => {
    mount();
    const names = {
      compact: t.formatCompact,
      standard: t.formatStandard,
      expanded: t.formatExpanded,
    };
    const group = screen.getByRole("group", { name: t.tablePreset });
    expect(within(group).queryByRole("radio")).toBeNull();
    await userEvent.setup().click(
      within(group).getByRole("button", {
        name: t.applyFormat(names[tablePreset]),
      }),
    );
    lastPatch({ kind: "standings", tablePreset });
    expect(within(group).queryByRole("button", { pressed: true })).toBeNull();
  },
);
it("table action arrows move focus without applying, Enter applies", async () => {
  mount();
  const user = userEvent.setup();
  const compact = screen.getByRole("button", {
    name: t.applyFormat(t.formatCompact),
  });
  for (let n = 0; n < 30 && document.activeElement !== compact; n++)
    await user.tab();
  expect(document.activeElement).toBe(compact);
  await user.keyboard("{ArrowRight}");
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: t.applyFormat(t.formatStandard) }),
  );
  expect(state.execute).not.toHaveBeenCalled();
  await user.keyboard("{Enter}");
  lastPatch({ kind: "standings", tablePreset: "standard" });
});
it.each(["standings", "delta"] as const)(
  "Eficiencia shows designs and hides Color for %s",
  async (kind) => {
    const value = item(kind);
    if (!value.settings || value.settings.kind !== kind) throw Error("fixture");
    value.settings.designSystem = "eficiencia";
    mount(value);
    expect(
      screen.queryByRole("radiogroup", { name: t.accentLabel }),
    ).toBeNull();
    const name = kind === "standings" ? t.designBroadcast : t.designCapsule;
    await userEvent.setup().click(screen.getByRole("radio", { name }));
    lastPatch({
      kind,
      templateId: kind === "standings" ? "broadcast" : "capsule",
    });
    if (kind === "standings") {
      const group = screen.getByRole("group", { name: t.tablePreset });
      expect(
        within(group)
          .getAllByRole("button")
          .every((button) => button.hasAttribute("disabled")),
      ).toBe(true);
    } else
      expect(screen.queryByRole("group", { name: t.tablePreset })).toBeNull();
  },
);
it("Fuel and Pedals keep format and transparency patches", async () => {
  mount(item("fuel-strategy"));
  const user = userEvent.setup();
  await user.click(screen.getByRole("radio", { name: t.formatExpanded }));
  lastPatch({ kind: "fuel-strategy", size: "expanded" });
  cleanup();
  mount(item("pedals"));
  await user.click(
    screen.getByRole("switch", { name: t.transparentBackground }),
  );
  lastPatch({ kind: "pedals", transparentBackground: true });
});
it("does not disable the focused control while pending and sends nothing", async () => {
  const mounted = mount();
  const user = userEvent.setup();
  const green = screen.getByRole("radio", { name: t.accentGreen });
  await user.click(green);
  state.execute.mockClear();
  state.pending = true;
  mounted.rerender(
    <CSPProvider disableStyleElements>
      <TooltipProvider>
        <StudioSteps item={item("standings")} />
      </TooltipProvider>
    </CSPProvider>,
  );
  expect(document.activeElement).toBe(green);
  expect(green.hasAttribute("disabled")).toBe(false);
  await user.keyboard("{ArrowRight} ");
  expect(state.execute).not.toHaveBeenCalled();
});
it("blocks a locked widget and never presents editable defaults for protected", () => {
  const value = item("standings");
  value.locked = true;
  mount(value);
  expect(
    screen
      .getByRole("radio", { name: t.lookVantare })
      .getAttribute("aria-disabled"),
  ).toBe("true");
  expect(screen.queryByText(t.autoSaved)).toBeNull();
  cleanup();
  state.view.state = "protected";
  mount();
  expect(screen.queryByRole("radio")).toBeNull();
  expect(screen.queryByRole("switch")).toBeNull();
});
it("Next focuses En pista and changing widget resets to Appearance", async () => {
  const mounted = mount();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: t.next }));
  expect(document.activeElement).toBe(
    screen.getByRole("tab", { name: /En pista/ }),
  );
  await screen.findByRole("slider", { name: t.opacity });
  mounted.rerender(
    <CSPProvider disableStyleElements>
      <TooltipProvider>
        <StudioSteps item={{ ...item("delta"), id: "widget-2" }} />
      </TooltipProvider>
    </CSPProvider>,
  );
  expect(
    screen
      .getByRole("tab", { name: /Apariencia/ })
      .getAttribute("aria-selected"),
  ).toBe("true");
  expect(screen.queryByRole("slider")).toBeNull();
});

it("Content can receive arrow focus without activating a promised panel", async () => {
  mount();
  const user = userEvent.setup();
  await user.click(screen.getByRole("tab", { name: t.track }));
  await user.keyboard("{ArrowRight}");
  const content = screen.getByRole("tab", { name: t.content });
  expect(document.activeElement).toBe(content);
  expect(content.getAttribute("aria-disabled")).toBe("true");
  expect(
    screen.getByRole("tab", { name: t.track }).getAttribute("aria-selected"),
  ).toBe("true");
  await user.keyboard("{Enter} ");
  expect(state.execute).not.toHaveBeenCalled();
});

it("read-only header is usable in protected states without any editable values", async () => {
  state.view.state = "protected";
  render(
    <CSPProvider disableStyleElements>
      <TooltipProvider>
        <StudioSteps item={item("standings")} readOnly />
      </TooltipProvider>
    </CSPProvider>,
  );
  expect(screen.getByRole("tab", { name: t.appearance })).toBeTruthy();
  expect(screen.getByText(t.readOnly)).toBeTruthy();
  expect(screen.queryByRole("radio")).toBeNull();
  expect(screen.queryByRole("slider")).toBeNull();
  expect(screen.queryByRole("switch")).toBeNull();
  expect(screen.queryByRole("button", { name: t.next })).toBeNull();
  await userEvent.setup().click(screen.getByRole("tab", { name: t.track }));
  expect(state.execute).not.toHaveBeenCalled();
  expect(screen.queryByRole("tabpanel")).toBeNull();
});
