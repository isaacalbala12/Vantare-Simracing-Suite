// @vitest-environment jsdom
import { CSPProvider } from "@base-ui/react/csp-provider";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { OverlayInstance } from "../src/contract/generated/studio";
import { studioContentText as text } from "../src/renderer/i18n/studio-content.es";
import { TooltipProvider } from "../src/renderer/ui/Layers";
import { StudioSteps } from "../src/renderer/ui/studio/StudioSteps";
import { contentInstance } from "./helpers/studio-content";

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
const cases = [
  {
    kind: "standings",
    label: text.rows,
    field: "rowCount",
    value: 8,
    min: 1,
    max: 30,
  },
  {
    kind: "relative",
    label: text.relativeAhead,
    field: "rangeAhead",
    value: 0,
    min: 0,
    max: 8,
  },
  {
    kind: "relative",
    label: text.relativeBehind,
    field: "rangeBehind",
    value: 8,
    min: 0,
    max: 8,
  },
  {
    kind: "fuel-strategy",
    label: text.historyRows,
    field: "historyRows",
    value: 6,
    min: 1,
    max: 8,
  },
] as const;
async function mount(item: OverlayInstance) {
  render(
    <CSPProvider disableStyleElements>
      <TooltipProvider>
        <StudioSteps item={item} />
      </TooltipProvider>
    </CSPProvider>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("tab", { name: "Contenido" }));
  return user;
}
for (const entry of cases) {
  it(`saves only ${entry.kind}.${entry.field} with the current revision after commit`, async () => {
    const item = contentInstance(entry.kind);
    if (item.settings?.kind === "fuel-strategy")
      item.settings.designSystem = "eficiencia";
    const before = structuredClone(item.settings);
    const user = await mount(item);
    const input = screen.getByRole("textbox", {
      name: entry.label,
    }) as HTMLInputElement;
    await user.clear(input);
    await user.type(input, String(entry.value));
    expect(state.execute).not.toHaveBeenCalled();
    await user.keyboard("{Enter}");
    expect(state.execute).toHaveBeenCalledTimes(1);
    expect(state.execute).toHaveBeenCalledWith({
      method: "studio.instance",
      id: item.id,
      baseRevision: "a".repeat(64),
      patch: {
        field: "settings",
        value: { kind: entry.kind, [entry.field]: entry.value },
      },
    });
    expect(item.settings).toEqual(before);
    expect(document.activeElement).toBe(input);
  });
  it(`validates ${entry.field} bounds after interaction and clears its error on edit`, async () => {
    const item = contentInstance(entry.kind);
    if (item.settings?.kind === "fuel-strategy")
      item.settings.designSystem = "eficiencia";
    const user = await mount(item);
    const input = screen.getByRole("textbox", { name: entry.label });
    await user.clear(input);
    await user.type(input, String(entry.max + 1));
    expect(
      screen.queryByText(text.invalidNumber(entry.min, entry.max)),
    ).toBeNull();
    await user.keyboard("{Enter}");
    expect(
      screen.getByText(text.invalidNumber(entry.min, entry.max)),
    ).toBeTruthy();
    expect(state.execute).not.toHaveBeenCalled();
    await user.clear(input);
    await user.type(input, String(entry.value));
    expect(
      screen.queryByText(text.invalidNumber(entry.min, entry.max)),
    ).toBeNull();
  });
}
it("does not expose the legacy fuel history option for the Vantare painter", async () => {
  await mount(contentInstance("fuel-strategy"));
  expect(screen.queryByRole("textbox", { name: text.historyRows })).toBeNull();
  expect(state.execute).not.toHaveBeenCalled();
});
it.each(["locked", "unverified"])(
  "does not send numeric writes while %s",
  async (mode) => {
    const item = contentInstance();
    if (mode === "locked") item.locked = true;
    else state.view.plan = "unverified";
    const user = await mount(item);
    const input = screen.getByRole("textbox", {
      name: text.rows,
    }) as HTMLInputElement;
    expect(input.disabled).toBe(true);
    await user.click(input);
    await user.keyboard("{Enter}");
    expect(state.execute).not.toHaveBeenCalled();
  },
);
