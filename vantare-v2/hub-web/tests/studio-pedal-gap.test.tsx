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
    kind: "pedals",
    look: "vantare",
    label: text.pedalGap,
    field: "gap",
    value: 0.1,
    min: 0,
    max: 12,
  },
  {
    kind: "pedals",
    look: "eficiencia",
    label: text.pedalGap,
    field: "gap",
    value: 0.25,
    min: 0,
    max: 12,
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
  it(`saves only ${entry.kind}.${entry.look}.${entry.field} with the current revision after commit`, async () => {
    const item = contentInstance(entry.kind);
    if (item.settings?.kind === "pedals")
      item.settings.designSystem = entry.look;
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
        value: { kind: entry.kind, [entry.field]: Math.fround(entry.value) },
      },
    });
    expect(item.settings).toEqual(before);
    expect(document.activeElement).toBe(input);
  });
  it(`validates ${entry.look}.${entry.field} bounds after interaction and clears its error on edit`, async () => {
    const item = contentInstance(entry.kind);
    if (item.settings?.kind === "pedals")
      item.settings.designSystem = entry.look;
    const user = await mount(item);
    const input = screen.getByRole("textbox", { name: entry.label });
    await user.clear(input);
    await user.type(input, String(entry.max + 1));
    expect(
      screen.queryByText(text.invalidDecimal(entry.min, entry.max)),
    ).toBeNull();
    await user.keyboard("{Enter}");
    expect(
      screen.getByText(text.invalidDecimal(entry.min, entry.max)),
    ).toBeTruthy();
    expect(state.execute).not.toHaveBeenCalled();
    await user.clear(input);
    await user.type(input, String(entry.value));
    expect(
      screen.queryByText(text.invalidDecimal(entry.min, entry.max)),
    ).toBeNull();
  });
}
it("recognizes the native f32 acknowledgment before accepting a later external update", async () => {
  const item = contentInstance("pedals");
  if (item.settings?.kind !== "pedals")
    throw new Error("pedals fixture required");
  item.settings.gap = 1;
  const view = (value: OverlayInstance) => (
    <CSPProvider disableStyleElements>
      <TooltipProvider>
        <StudioSteps item={value} />
      </TooltipProvider>
    </CSPProvider>
  );
  const rendered = render(view(item));
  const user = userEvent.setup();
  await user.click(screen.getByRole("tab", { name: "Contenido" }));
  const input = screen.getByRole("textbox", { name: text.pedalGap });
  await user.clear(input);
  await user.type(input, "0.2");
  await user.keyboard("{Enter}");
  expect(state.execute.mock.calls[0][0].patch.value.gap).toBe(Math.fround(0.2));
  const acknowledged = structuredClone(item);
  if (acknowledged.settings?.kind !== "pedals")
    throw new Error("pedals fixture required");
  acknowledged.settings.gap = 0.2;
  rendered.rerender(view(acknowledged));
  expect(input).toHaveProperty("value", "0.2");
  const external = structuredClone(acknowledged);
  if (external.settings?.kind !== "pedals")
    throw new Error("pedals fixture required");
  external.settings.gap = 0.3;
  rendered.rerender(view(external));
  expect(input).toHaveProperty("value", "0.3");
});
