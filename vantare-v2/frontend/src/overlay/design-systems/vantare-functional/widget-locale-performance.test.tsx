import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const bridge = vi.hoisted(() => ({ on: vi.fn(() => () => undefined), emit: vi.fn() }));
vi.mock("@wailsio/runtime", () => ({ Events: { On: bridge.on, Emit: bridge.emit } }));
import { I18nProvider, useI18n } from "../../../i18n/I18nProvider";
import * as i18n from "../../../i18n/i18n";
import { WidgetVisualHost } from "../../core/WidgetVisualHost";
import { buildWorkshopFrameV2, createScenarioWidget } from "../../authoring/fixtures/authoring-v2-workshop-frame";
import * as labels from "./labels";

afterEach(async () => { await act(() => vi.dynamicImportSettled()); cleanup(); vi.restoreAllMocks(); localStorage.clear(); });

function ChangeLanguage() {
  const { setLocale } = useI18n();
  return <button onClick={() => setLocale("en")}>English</button>;
}

it("keeps one real widget mounted and does no locale work across 100 telemetry frames", async () => {
  localStorage.clear();
  const session = vi.spyOn(labels, "sessionDisplayLabel");
  const dictionaryLoads = vi.spyOn(i18n, "loadDictionary");
  const reads = vi.spyOn(Storage.prototype, "getItem");
  const writes = vi.spyOn(Storage.prototype, "setItem");
  const scenario = { widget: "relative", system: "vantare-functional", variant: "default", state: "ready", session: "practice", location: "track" } as const;
  const widget = createScenarioWidget({ ...scenario, designId: "relative-functional-signature" });
  const base = buildWorkshopFrameV2(scenario);
  const mount = (sequence: number) => <I18nProvider mode="browser"><ChangeLanguage /><WidgetVisualHost widget={widget} runtime={{ ...base, overlayV2Frame: { ...base.overlayV2Frame!, sequence } }} renderMode="harness" /></I18nProvider>;
  const view = render(mount(1));
  const root = view.container.querySelector(".vf-relative");
  expect(root).not.toBeNull();
  expect(view.container.querySelector(".vf-footer .vf-footer-item")?.textContent).toContain("PRÁCTICA");
  expect(session.mock.calls.length).toBeGreaterThan(0);
  const before = { session: session.mock.calls.length, loads: dictionaryLoads.mock.calls.length, reads: reads.mock.calls.length, writes: writes.mock.calls.length };
  for (let tick = 2; tick <= 101; tick++) view.rerender(mount(tick));
  expect(view.container.querySelector(".vf-relative")).toBe(root);
  expect(session.mock.calls.length).toBe(before.session);
  expect(dictionaryLoads.mock.calls.length).toBe(before.loads);
  expect(reads.mock.calls.length).toBe(before.reads);
  expect(writes.mock.calls.length).toBe(before.writes);
  fireEvent.click(screen.getByText("English"));
  await waitFor(() => expect(view.container.querySelector(".vf-footer .vf-footer-item")?.textContent).toContain("PRACTICE"));
  expect(view.container.querySelector(".vf-relative")).toBe(root);
  expect(session.mock.calls.length).toBe(before.session + 1);
});

it("does not resubscribe or send native locale messages for telemetry frames", async () => {
  bridge.on.mockClear(); bridge.emit.mockClear();
  const scenario = { widget: "relative", system: "vantare-functional", variant: "default", state: "ready", session: "practice", location: "track" } as const;
  const widget = createScenarioWidget({ ...scenario, designId: "relative-functional-signature" });
  const base = buildWorkshopFrameV2(scenario);
  const mount = (sequence: number) => <I18nProvider mode="native-consumer"><WidgetVisualHost widget={widget} runtime={{ ...base, overlayV2Frame: { ...base.overlayV2Frame!, sequence } }} renderMode="desktop" /></I18nProvider>;
  const view = render(mount(1));
  await act(async () => { await Promise.resolve(); });
  const root = view.container.querySelector(".vf-relative");
  expect(root).not.toBeNull();
  const subscriptions = bridge.on.mock.calls.length;
  const messages = bridge.emit.mock.calls.length;
  expect(subscriptions).toBeGreaterThan(0);
  expect(messages).toBe(1); // initial snapshot request only
  for (let tick = 2; tick <= 101; tick++) view.rerender(mount(tick));
  expect(view.container.querySelector(".vf-relative")).toBe(root);
  expect(bridge.on.mock.calls.length).toBe(subscriptions);
  expect(bridge.emit.mock.calls.length).toBe(messages);
});
