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
  studioAdditionalOptions,
  type WidgetSettings,
} from "../src/contract/generated/studio";
import { UiProvider } from "../src/renderer/app/UiState";
import { HostFailure } from "../src/renderer/bridge/client";
import { studioText as studio } from "../src/renderer/i18n/studio";
import { studioAlertFieldsText as text } from "../src/renderer/i18n/studio-alert-fields.es";
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
  (value) => value.before.kind === "session-alerts",
);
const behavior = new Set([
  "soundZero",
  "miniFinal",
  "sound",
  "mini",
  "miniSession",
  "miniCalendar",
  "miniStart",
]);
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
            ...contentInstance("session-alerts"),
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
  return (
    <>
      {item && <StudioSteps item={item} />}
      <output aria-label="Retry eligibility">{String(state.canRetry)}</output>
      <button type="button" onClick={() => state.retry()}>
        Retry probe
      </button>
    </>
  );
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
function nextView(initial: StudioView, after: WidgetSettings) {
  const next = structuredClone(initial);
  next.revision = "b".repeat(64);
  next.instances[0].settings = structuredClone(after);
  return next;
}
const writes = () =>
  transport.request.mock.calls.filter(
    ([request]) => request.method === "studio.instance",
  );
it.each(cases)(
  "uses the native session-alerts vector $patch",
  async (vector) => {
    const before = vector.before;
    if (before.kind !== "session-alerts") throw Error("Session alerts case");
    const initial = fixture(structuredClone(vector.before) as WidgetSettings);
    const { user, accept } = await mount(initial);
    const entry = Object.entries(vector.patch).find(
      ([field]) => field !== "kind",
    );
    if (!entry) throw Error("Missing patch");
    const [field, value] = entry;
    await user.click(
      screen.getByRole("tab", {
        name: behavior.has(field) ? studio.track : studio.content,
      }),
    );
    if (field === "starts" || field === "miniStart") {
      const toggle = screen.getByRole("switch", { name: text[field] });
      expect(toggle.getAttribute("aria-disabled")).toBe("true");
      expect(toggle.getAttribute("aria-describedby")).toBeTruthy();
      expect(screen.getByText(text.signalPending)).toBeTruthy();
      await user.click(toggle);
      expect(writes()).toHaveLength(0);
      return;
    }
    let control: HTMLElement;
    if (field === "threshold" && typeof value === "object") {
      control = screen.getByRole("textbox", {
        name: text.threshold(value.index),
      });
      await user.clear(control);
      await user.type(control, `${value.minutes}{Enter}`);
      if ((before.thresholds[value.index] ?? 0) === value.minutes) {
        expect(writes()).toHaveLength(0);
        return;
      }
    } else if (typeof value === "boolean") {
      control = screen.getByRole("switch", {
        name: text[field as keyof typeof text] as string,
      });
      await user.click(control);
    } else if (typeof value === "number") {
      control = screen.getByRole("textbox", {
        name: text[field as keyof typeof text] as string,
      });
      await user.clear(control);
      await user.type(control, `${value}{Enter}`);
    } else {
      control = screen.getByRole("combobox", {
        name: field === "miniSize" ? text.miniSize : text.style,
      });
      await user.click(control);
      await user.click(
        await screen.findByRole("option", {
          name:
            field === "miniSize"
              ? String(value).toUpperCase()
              : text.styles.transparente,
        }),
      );
    }
    expect(transport.request).toHaveBeenLastCalledWith({
      method: "studio.instance",
      id: initial.instances[0].id,
      baseRevision: initial.revision,
      patch: { field: "settings", value: vector.patch },
    });
    expect(screen.getByText(studio.saving)).toBeTruthy();
    expect(screen.queryByText(studio.autoSaved)).toBeNull();
    const next = nextView(
      initial,
      structuredClone(vector.after) as WidgetSettings,
    );
    await act(async () => accept({ method: "studio.instance", value: next }));
    expect(screen.getByText(studio.autoSaved)).toBeTruthy();
    if (field === "threshold") {
      const settings = next.instances[0].settings;
      if (settings?.kind !== "session-alerts") throw Error("Session alerts");
      for (
        let index = 0;
        index < studioAdditionalOptions.sessionAlerts.thresholdSlots;
        index++
      ) {
        expect(
          (
            screen.getByRole("textbox", {
              name: text.threshold(index),
            }) as HTMLInputElement
          ).value,
        ).toBe(String(settings.thresholds[index] ?? 0));
      }
      expect(document.activeElement).toBe(
        screen.getByRole("textbox", {
          name: (control as HTMLInputElement).labels?.[0]?.textContent ?? "",
        }),
      );
    } else expect(document.activeElement).toBe(control);
    expect(writes()).toHaveLength(1);
  },
);
it.each(["Rejected", "Unknown", "Conflict"] as const)(
  "requires an explicit fresh read after an uncertain threshold (%s), never replaying its index",
  async (kind) => {
    const vector = cases.find(
      (value) =>
        "threshold" in value.patch &&
        value.patch.threshold.index === 1 &&
        value.patch.threshold.minutes === 30,
    );
    if (!vector) throw Error("Threshold fixture");
    const initial = fixture(structuredClone(vector.before) as WidgetSettings);
    const { user, reject } = await mount(initial);
    await user.click(screen.getByRole("tab", { name: studio.content }));
    const control = screen.getByRole("textbox", {
      name: text.threshold(1),
    }) as HTMLInputElement;
    await user.clear(control);
    await user.type(control, "30{Enter}{Enter}");
    const fresh = nextView(
      initial,
      structuredClone(vector.after) as WidgetSettings,
    );
    const error: HostError =
      kind === "Conflict"
        ? { kind: "studioConflict", current: fresh }
        : { kind: kind === "Rejected" ? "rejected" : "coreUnavailable" };
    await act(async () => reject(new HostFailure(error)));
    expect(control.value).toBe("30");
    expect(control.readOnly).toBe(true);
    expect(document.activeElement).toBe(control);
    expect(screen.getByText(studio.notSaved)).toBeTruthy();
    expect(screen.getByText(text.thresholdUncertain)).toBeTruthy();
    expect(
      screen.getByRole("status", { name: "Retry eligibility" }).textContent,
    ).toBe("false");
    await user.click(screen.getByRole("button", { name: "Retry probe" }));
    expect(writes()).toHaveLength(1);
    transport.request.mockImplementation((request: Request) => {
      if (request.method !== "studio.get") throw Error("No replay");
      return Promise.resolve({ method: "studio.get", value: fresh });
    });
    await user.click(screen.getByRole("button", { name: text.reload }));
    const reloaded = screen.getByRole("textbox", {
      name: text.threshold(1),
    }) as HTMLInputElement;
    expect(reloaded.value).toBe("5");
    expect(reloaded.readOnly).toBe(false);
    expect(screen.queryByText(text.thresholdUncertain)).toBeNull();
  },
);
it("rejects a volume outside the native step without sending, and keeps pending controls focusable", async () => {
  const initial = fixture(structuredClone(cases[0].before) as WidgetSettings);
  const { user } = await mount(initial);
  await user.click(screen.getByRole("tab", { name: studio.content }));
  const volume = screen.getByRole("textbox", { name: text.volume });
  await user.clear(volume);
  await user.type(volume, "73{Enter}");
  expect(volume.getAttribute("aria-invalid")).toBe("true");
  expect(writes()).toHaveLength(0);
  await user.clear(volume);
  await user.type(volume, "75{Enter}{Enter}");
  expect(writes()).toHaveLength(1);
  expect((volume as HTMLInputElement).readOnly).toBe(true);
  expect(volume.getAttribute("aria-busy")).toBe("true");
  expect(volume.hasAttribute("disabled")).toBe(false);
  expect(document.activeElement).toBe(volume);
});
it("keeps a threshold blocked if the explicit reload also fails", async () => {
  const initial = fixture(structuredClone(cases[0].before) as WidgetSettings);
  const { user, reject } = await mount(initial);
  await user.click(screen.getByRole("tab", { name: studio.content }));
  const input = screen.getByRole("textbox", {
    name: text.threshold(0),
  }) as HTMLInputElement;
  await user.clear(input);
  await user.type(input, "20{Enter}");
  await act(async () => reject(new HostFailure({ kind: "coreUnavailable" })));
  transport.request.mockRejectedValue(
    new HostFailure({ kind: "coreUnavailable" }),
  );
  await user.click(screen.getByRole("button", { name: text.reload }));
  expect(input.readOnly).toBe(true);
  expect(input.value).toBe("20");
  expect(screen.getByText(text.thresholdUncertain)).toBeTruthy();
});
it("does not steal focus after native normalization when the user moved to another control", async () => {
  const vector = cases.find(
    (value) =>
      "threshold" in value.patch &&
      value.patch.threshold.index === 1 &&
      value.patch.threshold.minutes === 30,
  );
  if (!vector) throw Error("Threshold fixture");
  const initial = fixture(structuredClone(vector.before) as WidgetSettings);
  const { user, accept } = await mount(initial);
  await user.click(screen.getByRole("tab", { name: studio.content }));
  const input = screen.getByRole("textbox", { name: text.threshold(1) });
  await user.clear(input);
  await user.type(input, "30{Enter}");
  const other = screen.getByRole("switch", { name: text.calendar });
  await user.click(other);
  expect(writes()).toHaveLength(1);
  await act(async () =>
    accept({
      method: "studio.instance",
      value: nextView(initial, structuredClone(vector.after) as WidgetSettings),
    }),
  );
  expect(document.activeElement).toBe(other);
  expect(
    (
      screen.getByRole("textbox", {
        name: text.threshold(1),
      }) as HTMLInputElement
    ).value,
  ).toBe("5");
});

it("preserves the next threshold's focus and draft while the previous slot confirms", async () => {
  const initial = fixture(structuredClone(cases[0].before) as WidgetSettings);
  const settings = initial.instances[0].settings;
  if (settings?.kind !== "session-alerts") throw Error("Alerts fixture");
  settings.thresholds = [5, 1];
  const { user, accept } = await mount(initial);
  await user.click(screen.getByRole("tab", { name: studio.content }));
  const first = screen.getByRole("textbox", {
    name: text.threshold(0),
  }) as HTMLInputElement;
  const second = screen.getByRole("textbox", {
    name: text.threshold(1),
  }) as HTMLInputElement;
  await user.clear(first);
  await user.type(first, "10");
  await user.tab();
  expect(document.activeElement).toBe(second);
  await user.clear(second);
  await user.type(second, "7");
  expect(second.value).toBe("7");
  expect(first.getAttribute("aria-busy")).toBe("true");
  const next = nextView(initial, { ...settings, thresholds: [10, 1] });
  await act(async () => accept({ method: "studio.instance", value: next }));
  expect(screen.getByRole("textbox", { name: text.threshold(1) })).toBe(second);
  expect(document.activeElement).toBe(second);
  expect(second.value).toBe("7");
  await user.tab();
  expect(transport.request).toHaveBeenLastCalledWith({
    method: "studio.instance",
    id: initial.instances[0].id,
    baseRevision: next.revision,
    patch: {
      field: "settings",
      value: { kind: "session-alerts", threshold: { index: 1, minutes: 7 } },
    },
  });
});
it("shows unknown mini size and style as preserved without writing", async () => {
  const initial = fixture(structuredClone(cases[0].before) as WidgetSettings);
  const settings = initial.instances[0].settings;
  if (settings?.kind !== "session-alerts") throw Error("Alerts fixture");
  settings.miniSize = "legacy-size";
  settings.style = "legacy-style";
  await mount(initial);
  await userEvent
    .setup()
    .click(screen.getByRole("tab", { name: studio.content }));
  expect(
    screen.getByRole("combobox", { name: text.miniSize }).textContent,
  ).toContain("legacy-size");
  expect(
    screen.getByRole("combobox", { name: text.style }).textContent,
  ).toContain("legacy-style");
  expect(
    screen.getByRole("combobox", { name: text.style }).textContent,
  ).toContain("conservado");
  expect(writes()).toHaveLength(0);
});
