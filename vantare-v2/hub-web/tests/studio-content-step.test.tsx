// @vitest-environment jsdom
import { CSPProvider } from "@base-ui/react/csp-provider";
import { act, cleanup, render, screen } from "@testing-library/react";
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
const tree = (item: OverlayInstance) => (
  <CSPProvider disableStyleElements>
    <TooltipProvider>
      <StudioSteps item={item} />
    </TooltipProvider>
  </CSPProvider>
);
async function mount(item = contentInstance()) {
  const ui = render(tree(item));
  const user = userEvent.setup();
  await user.click(screen.getByRole("tab", { name: "Contenido" }));
  return { ui, user, item };
}
it("opens Content by keyboard without writing, and renders the native Race columns", async () => {
  render(tree(contentInstance()));
  const user = userEvent.setup();
  const appearance = screen.getByRole("tab", {
    name: "Apariencia",
  });
  appearance.focus();
  await user.keyboard("{ArrowRight}{ArrowRight}");
  expect(
    screen
      .getByRole("tab", { name: "Contenido" })
      .getAttribute("aria-selected"),
  ).toBe("true");
  expect(
    screen.getByRole("tab", { name: "Carrera" }).getAttribute("aria-selected"),
  ).toBe("true");
  expect(
    screen.getByRole("switch", { name: "Piloto" }).getAttribute("aria-checked"),
  ).toBe("true");
  expect(
    screen
      .getByRole("switch", { name: "Piloto" })
      .getAttribute("aria-disabled"),
  ).toBe("true");
  expect(screen.queryByLabelText("Clases")).toBeNull();
  expect(state.execute).not.toHaveBeenCalled();
});
it("sends a revision-bound Practice edit without mutating Race or painting success optimistically", async () => {
  const { user, item } = await mount();
  await user.click(screen.getByRole("tab", { name: "Práctica" }));
  const gap = screen.getByRole("switch", { name: "Diferencia" });
  await user.click(gap);
  expect(state.execute).toHaveBeenCalledTimes(1);
  const request = state.execute.mock.calls[0][0];
  expect(request).toMatchObject({
    method: "studio.instance",
    id: item.id,
    baseRevision: "a".repeat(64),
    patch: { field: "settings", value: { kind: "standings" } },
  });
  expect(Object.keys(request.patch.value).sort()).toEqual([
    "kind",
    "practiceColumns",
  ]);
  expect(
    request.patch.value.practiceColumns.find(
      (column: { metric: string }) => column.metric === "gap",
    ),
  ).toEqual({ metric: "gap", enabled: false });
  expect(gap.getAttribute("aria-checked")).toBe("true");
});
it("retains the selected metric when switching sessions, as the GPUI inspector does", async () => {
  const { user } = await mount();
  await user.click(screen.getByRole("combobox", { name: text.columnFormat }));
  await user.click(screen.getByRole("option", { name: "Última vuelta" }));
  await user.click(screen.getByRole("tab", { name: "Práctica" }));
  expect(
    screen.getByRole("combobox", { name: text.columnFormat }).textContent,
  ).toContain("Última vuelta");
  expect(screen.getByRole("combobox", { name: text.timeFormat })).toBeTruthy();
  expect(state.execute).not.toHaveBeenCalled();
});
it("keeps focus and blocks a second write while the host save is pending", async () => {
  let finish: () => void = () => {};
  state.execute.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const { user, item, ui } = await mount();
  const gap = screen.getByRole("switch", { name: "Diferencia" });
  await user.click(gap);
  state.pending = true;
  ui.rerender(tree(item));
  expect(document.activeElement).toBe(gap);
  expect(gap.getAttribute("aria-disabled")).toBe("true");
  expect(gap.hasAttribute("disabled")).toBe(false);
  await user.click(gap);
  expect(state.execute).toHaveBeenCalledTimes(1);
  await act(async () => finish());
});
it.each(["locked", "unverified"])("never writes a %s widget", async (mode) => {
  const item = contentInstance();
  if (mode === "locked") item.locked = true;
  else state.view.plan = "unverified";
  const { user } = await mount(item);
  await user.click(screen.getByRole("switch", { name: "Diferencia" }));
  expect(state.execute).not.toHaveBeenCalled();
});
it("does not show editable defaults for a protected document", () => {
  state.view.state = "protected";
  render(tree(contentInstance()));
  expect(screen.queryByRole("switch")).toBeNull();
  expect(state.execute).not.toHaveBeenCalled();
});
it("keeps unknown column sets read-only rather than pretending a toggle saved", async () => {
  const item = contentInstance();
  if (item.settings?.kind !== "standings" || !item.settings.columns?.[0])
    throw Error("Standings fixture");
  item.settings.columns[0].metricId = "futureMetric";
  const { user } = await mount(item);
  expect(screen.getByText(text.unreadable)).toBeTruthy();
  const gap = screen.getByRole("switch", { name: "Diferencia" });
  expect(gap.getAttribute("aria-disabled")).toBe("true");
  await user.click(gap);
  expect(state.execute).not.toHaveBeenCalled();
});
it("preserves unsupported time formatting and explains the disabled reset", async () => {
  const item = contentInstance();
  if (item.settings?.kind !== "standings") throw Error("standings");
  const time = item.settings.columns?.find((c) => c.metricId === "lastLap");
  if (!time) throw Error("time");
  time.format.display = "compact";
  time.format.decimals = 1;
  const { user } = await mount(item);
  await user.click(screen.getByRole("combobox", { name: text.columnFormat }));
  await user.click(screen.getByRole("option", { name: "Última vuelta" }));
  expect(
    (
      screen.getByRole("combobox", {
        name: text.timeFormat,
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(
    (screen.getByRole("textbox", { name: text.decimals }) as HTMLInputElement)
      .value,
  ).toBe("1");
  expect(screen.getByText(text.timeReadOnly)).toBeTruthy();
  expect(
    (screen.getByRole("button", { name: text.reset }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  const ids = Array.from(document.querySelectorAll("[id]"), (node) => node.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(state.execute).not.toHaveBeenCalled();
});
it("validates the name limit after commit and retains focus after a confirmed value changes", async () => {
  const item = contentInstance();
  if (item.settings?.kind !== "standings") throw Error("standings");
  const name = item.settings.columns?.find((c) => c.metricId === "driverName");
  if (!name) throw Error("name");
  name.format.mode = "truncate";
  name.format.maxChars = 16;
  const { user, ui } = await mount(item);
  const input = screen.getByRole("textbox", { name: text.maxChars });
  await user.clear(input);
  await user.type(input, "0{Enter}");
  expect(state.execute).not.toHaveBeenCalled();
  expect(screen.getByText(text.invalidNumber(1, 64))).toBeTruthy();
  await user.clear(input);
  await user.type(input, "22{Enter}");
  expect(state.execute).toHaveBeenCalledTimes(1);
  expect(
    state.execute.mock.calls[0][0].patch.value.columns.find(
      (c: { metric: string }) => c.metric === "driverName",
    ),
  ).toMatchObject({ format: { maxChars: 22 } });
  name.format.maxChars = 22;
  state.view.revision = "b".repeat(64);
  ui.rerender(tree({ ...item }));
  expect(document.activeElement).toBe(input);
  expect((input as HTMLInputElement).value).toBe("22");
});
it("uses the same closed patch path for Delta content", async () => {
  const { user } = await mount(contentInstance("delta"));
  await user.click(screen.getByRole("combobox", { name: text.reference }));
  await user.click(
    screen.getByRole("option", { name: text.references.optimal }),
  );
  expect(state.execute).toHaveBeenCalledWith(
    expect.objectContaining({
      patch: {
        field: "settings",
        value: { kind: "delta", reference: "optimal" },
      },
    }),
  );
});
it.each(["pedals", "fuel-strategy"] as const)(
  "saves the supported %s content switch with its actual next value",
  async (kind) => {
    const item = contentInstance(kind);
    if (item.settings?.kind === "fuel-strategy") {
      item.settings.designSystem = "eficiencia";
      item.settings.showProjection = true;
    } else if (item.settings?.kind === "pedals")
      item.settings.showBrakePeak = true;
    const { user } = await mount(item);
    await user.click(
      screen.getByRole("switch", {
        name: kind === "pedals" ? text.brakePeak : text.projection,
      }),
    );
    expect(state.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        patch: {
          field: "settings",
          value:
            kind === "pedals"
              ? { kind, showBrakePeak: false }
              : { kind, showProjection: false },
        },
      }),
    );
  },
);
it("edits the legacy footer without adding a Vantare footer or class-scope control", async () => {
  const item = contentInstance();
  if (!item.settings) throw Error("settings");
  item.settings.designSystem = "eficiencia";
  const { user } = await mount(item);
  await user.click(screen.getByRole("switch", { name: text.footer }));
  expect(state.execute).toHaveBeenCalledWith(
    expect.objectContaining({
      patch: {
        field: "settings",
        value: { kind: "standings", showSessionFooter: false },
      },
    }),
  );
  expect(screen.queryByLabelText("Clases")).toBeNull();
});
