// @vitest-environment jsdom
import { CSPProvider } from "@base-ui/react/csp-provider";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type {
  HostError,
  Reply,
  Request,
  StudioView,
} from "../src/contract/generated/contract";
import corpus from "../src/contract/generated/corpus/studio.json";
import {
  studioAdditionalCases,
  type WidgetSettings,
} from "../src/contract/generated/studio";
import { UiProvider } from "../src/renderer/app/UiState";
import { HostFailure } from "../src/renderer/bridge/client";
import { studioText as studio } from "../src/renderer/i18n/studio";
import { studioWidgetFieldsText as text } from "../src/renderer/i18n/studio-widget-fields.es";
import {
  StudioProvider,
  useStudio,
} from "../src/renderer/screens/studio/state";
import { TooltipProvider } from "../src/renderer/ui/Layers";
import { StudioSteps } from "../src/renderer/ui/studio/StudioSteps";
import { contentInstance } from "./helpers/studio-content";

const transport = vi.hoisted(() => ({
  request: vi.fn(),
  listen: () => () => {},
  subscribe: () => () => {},
}));
vi.mock("../src/renderer/app/Host", () => ({
  useHost: () => ({ client: transport }),
}));
afterEach(() => {
  cleanup();
  transport.request.mockReset();
});
const cases = studioAdditionalCases.filter(
  (value) => value.before.kind !== "session-alerts",
);
const labels: Record<string, string> = {
  rowCount: text.rows,
  driverCarousel: text.carousel,
  showWeather: text.weather,
  showTyres: text.tyres,
  view: text.view,
  toggleKey: text.toggleKey,
  showAero: text.aero,
  reference: text.reference,
  windowSeconds: text.window,
  showPersonal: text.personal,
  showClass: text.class,
  showDriver: text.driver,
  durationSeconds: text.duration,
  target: text.target,
  historySeconds: text.history,
  showClutch: text.clutch,
  transparent: text.transparent,
  classMode: text.classes,
  showClassDivider: text.divider,
  steeringWheel: text.wheel,
  showPhrases: text.phrases,
  showSectorFlags: text.sectorFlags,
  hideWhenGreen: text.hideGreen,
  textColor: text.color,
  vertical: text.vertical,
};
const optionLabels: Record<string, string> = {
  numbers: text.views.numbers,
  leader: text.references.leader,
  behind: text.targets.behind,
  other: text.classModes.other,
  f12: "F12",
};
const behavior = new Set(["driverCarousel", "toggleKey", "hideWhenGreen"]);
function fixture(settings: WidgetSettings): StudioView {
  for (const message of corpus.host) {
    if (
      message.result &&
      "value" in message.result &&
      message.result.value.instances.length
    )
      return {
        ...(structuredClone(message.result.value) as StudioView),
        state: "ready",
        plan: "pro",
        revision: "a".repeat(64),
        instances: [
          {
            ...contentInstance(settings.kind),
            settings: structuredClone(settings),
          },
        ],
      };
  }
  throw Error("Studio fixture");
}
function Screen() {
  const state = useStudio();
  const item = state.view?.instances[0];
  return item ? <StudioSteps item={item} /> : null;
}
async function mount(initial: StudioView) {
  let accept!: (reply: Reply) => void;
  let reject!: (error: unknown) => void;
  transport.request.mockImplementation((request: Request) => {
    if (request.method === "studio.get")
      return Promise.resolve({ method: "studio.get", value: initial });
    return new Promise<Reply>((ok, fail) => {
      accept = ok;
      reject = fail;
    });
  });
  render(
    <CSPProvider disableStyleElements>
      <TooltipProvider>
        <UiProvider>
          <StudioProvider>
            <Screen />
          </StudioProvider>
        </UiProvider>
      </TooltipProvider>
    </CSPProvider>,
  );
  await screen.findByRole("tab", { name: studio.content });
  return {
    user: userEvent.setup(),
    accept: (reply: Reply) => accept(reply),
    reject: (error: unknown) => reject(error),
  };
}
function field(vector: (typeof cases)[number]) {
  const entry = Object.entries(vector.patch).find(([key]) => key !== "kind");
  if (!entry) throw Error("Missing native patch");
  return entry;
}
async function edit(vector: (typeof cases)[number]) {
  const initial = fixture(structuredClone(vector.before) as WidgetSettings);
  const actions = await mount(initial);
  const [key, value] = field(vector);
  await actions.user.click(
    screen.getByRole("tab", {
      name: behavior.has(key) ? studio.track : studio.content,
    }),
  );
  let control: HTMLElement;
  if (typeof value === "boolean") {
    control = screen.getByRole("switch", { name: labels[key] });
    await actions.user.click(control);
  } else if (
    (typeof value === "number" &&
      vector.patch.kind !== "multiclass-relative") ||
    key === "textColor"
  ) {
    control = screen.getByRole("textbox", { name: labels[key] });
    await actions.user.clear(control);
    await actions.user.type(control, `${value}{Enter}`);
  } else {
    control = screen.getByRole("combobox", { name: labels[key] });
    await actions.user.click(control);
    await actions.user.click(
      await screen.findByRole("option", {
        name: optionLabels[String(value)] ?? String(value),
      }),
    );
  }
  return { ...actions, initial, control, key, value };
}
it.each(cases)("writes and confirms the native case $patch", async (vector) => {
  const { initial, accept, control, key, value } = await edit(vector);
  expect(transport.request).toHaveBeenLastCalledWith({
    method: "studio.instance",
    id: initial.instances[0].id,
    baseRevision: initial.revision,
    patch: { field: "settings", value: vector.patch },
  });
  expect(screen.getByText(studio.saving)).toBeTruthy();
  expect(screen.queryByText(studio.autoSaved)).toBeNull();
  expect(control.hasAttribute("disabled")).toBe(false);
  if (typeof value === "boolean") {
    const before = Object.entries(vector.before).find(
      ([field]) => field === key,
    )?.[1];
    expect(control.getAttribute("aria-checked")).toBe(String(before));
  }
  const next = structuredClone(initial);
  next.revision = "b".repeat(64);
  next.instances[0].settings = structuredClone(vector.after) as WidgetSettings;
  await act(async () => accept({ method: "studio.instance", value: next }));
  expect(screen.getByText(studio.autoSaved)).toBeTruthy();
  const confirmed = Object.entries(vector.after).find(
    ([field]) => field === key,
  )?.[1];
  if (typeof confirmed === "boolean")
    expect(control.getAttribute("aria-checked")).toBe(String(confirmed));
  else if (control instanceof HTMLInputElement)
    expect(control.value).toBe(String(confirmed));
  else
    expect(control.textContent).toContain(
      optionLabels[String(confirmed)] ?? String(confirmed),
    );
  expect(document.activeElement).toBe(control);
  expect(
    transport.request.mock.calls.filter(
      ([r]) => r.method === "studio.instance",
    ),
  ).toHaveLength(1);
});
it.each(["Rejected", "Unknown", "Conflict"] as const)(
  "keeps the numeric draft unsaved after %s",
  async (kind) => {
    const vector = cases[0];
    const { initial, reject, control, user } = await edit(vector);
    await user.keyboard("{Enter}");
    const current = structuredClone(initial);
    current.revision = "c".repeat(64);
    const settings = current.instances[0].settings;
    if (settings?.kind !== "broadcast-tower") throw Error("Tower case");
    settings.rowCount = 5;
    const error: HostError =
      kind === "Conflict"
        ? { kind: "studioConflict", current }
        : { kind: kind === "Unknown" ? "coreUnavailable" : "rejected" };
    await act(async () => reject(new HostFailure(error)));
    expect((control as HTMLInputElement).value).toBe("3");
    expect(document.activeElement).toBe(control);
    expect(screen.getByText(studio.notSaved)).toBeTruthy();
    expect(screen.queryByText(studio.autoSaved)).toBeNull();
    expect(
      transport.request.mock.calls.filter(
        ([r]) => r.method === "studio.instance",
      ),
    ).toHaveLength(1);
  },
);
it("does not replace the edited color after a rejection, and validates after interaction", async () => {
  const vector = cases.find((value) => "textColor" in value.patch);
  if (!vector) throw Error("Color case");
  const { reject, control, user } = await edit(vector);
  await act(async () => reject(new HostFailure({ kind: "rejected" })));
  expect((control as HTMLInputElement).value).toBe("#A1B2C3");
  await user.clear(control);
  await user.type(control, "red");
  expect(screen.queryByText(text.invalidColor)).toBeNull();
  await user.tab();
  expect(screen.getByText(text.invalidColor)).toBeTruthy();
  expect(control.getAttribute("aria-invalid")).toBe("true");
  expect(control.getAttribute("aria-describedby")).toBeTruthy();
  expect(
    transport.request.mock.calls.filter(
      ([r]) => r.method === "studio.instance",
    ),
  ).toHaveLength(1);
});
it("blocks writes for an unverified plan and does not expose unsupported SOF", async () => {
  const initial = fixture(structuredClone(cases[0].before) as WidgetSettings);
  initial.plan = "unverified";
  const { user } = await mount(initial);
  await user.click(screen.getByRole("tab", { name: studio.content }));
  expect(
    (screen.getByRole("textbox", { name: text.rows }) as HTMLInputElement)
      .disabled,
  ).toBe(true);
  expect(screen.queryByRole("switch", { name: /SOF/ })).toBeNull();
  expect(transport.request).toHaveBeenCalledTimes(1);
});
it("rejects fractional DeltaTrace writes before sending the u8 field", async () => {
  const vector = cases.find((value) => value.before.kind === "delta-trace");
  if (!vector) throw Error("DeltaTrace case");
  const initial = fixture(structuredClone(vector.before) as WidgetSettings);
  const { user } = await mount(initial);
  await user.click(screen.getByRole("tab", { name: studio.content }));
  const input = screen.getByRole("textbox", { name: text.window });
  await user.clear(input);
  await user.type(input, "2.5{Enter}");
  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect(transport.request).toHaveBeenCalledTimes(1);
});
