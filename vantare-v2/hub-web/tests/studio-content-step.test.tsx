// @vitest-environment jsdom
import { CSPProvider } from "@base-ui/react/csp-provider";
import { act, cleanup, render, screen, within } from "@testing-library/react";
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
  await user.click(screen.getByRole("combobox", { name: text.column }));
  await user.click(
    await screen.findByRole("option", { name: "Última vuelta" }),
  );
  await user.click(screen.getByRole("tab", { name: "Práctica" }));
  expect(
    screen.getByRole("combobox", { name: text.column }).textContent,
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
it("reads saved time formats and enables reset without pretending an edit was saved", async () => {
  const item = contentInstance();
  if (item.settings?.kind !== "standings") throw Error("standings");
  const time = item.settings.columns?.find((c) => c.metricId === "lastLap");
  if (!time) throw Error("time");
  time.format.display = "compact";
  time.format.decimals = 1;
  const { user } = await mount(item);
  await user.click(screen.getByRole("combobox", { name: text.column }));
  await user.click(
    await screen.findByRole("option", { name: "Última vuelta" }),
  );
  expect(
    (
      screen.getByRole("combobox", {
        name: text.timeFormat,
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(false);
  expect(
    within(screen.getByRole("group", { name: text.decimals }))
      .getByRole("button", { name: "1" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  expect(screen.queryByText(text.timeReadOnly)).toBeNull();
  expect(
    (screen.getByRole("button", { name: text.reset }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
  await user.click(screen.getByRole("button", { name: text.reset }));
  const format = state.execute.mock.calls[0][0].patch.value.columns.find(
    (column: { metric: string }) => column.metric === "lastLap",
  ).format;
  expect(format).toMatchObject({ mode: null, display: null, decimals: null });
  expect(
    within(screen.getByRole("group", { name: text.decimals }))
      .getByRole("button", { name: "1" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
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
it("writes the displayed 16 character default together with truncate, not as an unsaved fallback", async () => {
  const { user } = await mount();
  await user.click(screen.getByRole("combobox", { name: text.name }));
  await user.click(
    await screen.findByRole("option", { name: text.names.truncate }),
  );
  expect(state.execute).toHaveBeenCalledTimes(1);
  expect(
    state.execute.mock.calls[0][0].patch.value.columns.find(
      (column: { metric: string }) => column.metric === "driverName",
    ).format,
  ).toEqual({ mode: "truncate", maxChars: 16 });
});
it.each(["Carrera", "Práctica", "Qualy"])(
  "edits the time display in %s without changing other sessions",
  async (session) => {
    const { user } = await mount();
    await user.click(screen.getByRole("tab", { name: session }));
    await user.click(screen.getByRole("combobox", { name: text.column }));
    await user.click(
      await screen.findByRole("option", { name: "Última vuelta" }),
    );
    await user.click(screen.getByRole("combobox", { name: text.timeFormat }));
    await user.click(await screen.findByRole("option", { name: "Compacto" }));
    const key =
      session === "Carrera"
        ? "columns"
        : session === "Práctica"
          ? "practiceColumns"
          : "qualifyingColumns";
    expect(state.execute.mock.calls[0][0]).toMatchObject({
      method: "studio.instance",
      baseRevision: "a".repeat(64),
      patch: { field: "settings", value: { kind: "standings" } },
    });
    expect(
      state.execute.mock.calls[0][0].patch.value[key].find(
        (column: { metric: string }) => column.metric === "lastLap",
      ).format,
    ).toEqual({ display: "compact" });
    expect(
      screen.getByRole("combobox", { name: text.timeFormat }).textContent,
    ).toContain("Completo");
  },
);
it.each([0, 1, 2, 3])(
  "commits decimal count %s explicitly without showing a saved value early",
  async (decimals) => {
    const item = contentInstance();
    if (item.settings?.kind !== "standings") throw Error("standings");
    const column = item.settings.columns?.find(
      (column) => column.metricId === "bestLap",
    );
    if (!column) throw Error("column");
    column.format.decimals = (decimals + 1) % 4;
    const { user } = await mount(item);
    await user.click(screen.getByRole("combobox", { name: text.column }));
    await user.click(
      await screen.findByRole("option", { name: "Mejor vuelta" }),
    );
    const group = screen.getByRole("group", { name: text.decimals });
    await user.click(
      within(group).getByRole("button", { name: String(decimals) }),
    );
    expect(
      within(group)
        .getByRole("button", { name: String((decimals + 1) % 4) })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      state.execute.mock.calls[0][0].patch.value.columns.find(
        (column: { metric: string }) => column.metric === "bestLap",
      ).format,
    ).toEqual({ decimals });
  },
);
it("never exposes editable time formatting for Relative", async () => {
  await mount(contentInstance("relative"));
  expect(screen.queryByRole("combobox", { name: text.timeFormat })).toBeNull();
  expect(screen.queryByRole("group", { name: text.decimals })).toBeNull();
});

it("uses the same closed patch path for Delta content", async () => {
  const { user } = await mount(contentInstance("delta"));
  await user.click(screen.getByRole("combobox", { name: text.reference }));
  await user.click(
    await screen.findByRole("option", { name: text.references.optimal }),
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
  if (!item.settings || !("designSystem" in item.settings))
    throw Error("settings");
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
