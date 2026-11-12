// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import fixture from "../fixtures/calendar-alerts-reference.json";
import type { CalendarAlerts } from "../src/contract/generated/calendar";
import { calendarReference } from "../src/mock/calendar-reference";
import { calendarAlertsText as text } from "../src/renderer/i18n/calendarAlerts";
import { CalendarAlertsDialog } from "../src/renderer/ui/CalendarAlertsDialog";
import { TooltipProvider } from "../src/renderer/ui/Layers";

const schedule = calendarReference().official;
if (!schedule) throw new Error("public schedule missing");
const props = {
  schedule,
  alerts: fixture as CalendarAlerts,
  following: [schedule.series[0].id],
  now: Date.parse("2026-10-08T17:47:13Z"),
  utc: true,
  limit: 1000,
  profile: "Carrera LMU",
  canEdit: true,
  busy: false,
  onChange: vi.fn(),
  onClose: vi.fn(),
};
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function show(p = props) {
  return render(
    <TooltipProvider>
      <CalendarAlertsDialog {...p} />
    </TooltipProvider>,
  );
}
it("sends only the chosen lead or channel and closes without another write", () => {
  show();
  fireEvent.click(screen.getByRole("button", { name: "15 min" }));
  expect(props.onChange).toHaveBeenLastCalledWith({ kind: "lead", value: 15 });
  fireEvent.click(screen.getByRole("checkbox", { name: text.track }));
  expect(props.onChange).toHaveBeenLastCalledWith({
    kind: "channel",
    channel: "inTrack",
    value: false,
  });
  const writes = props.onChange.mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: text.save }));
  expect(props.onClose).toHaveBeenCalledOnce();
  expect(props.onChange).toHaveBeenCalledTimes(writes);
});
it("edits one bound through a patch and removes only the selected band", () => {
  const original = JSON.stringify(props.alerts);
  show();
  fireEvent.click(screen.getByRole("button", { name: text.edit }));
  fireEvent.click(
    screen.getByRole("button", { name: `${text.starts}: 20:30` }),
  );
  expect(props.onChange).toHaveBeenLastCalledWith({
    kind: "band",
    id: props.alerts.bands[0].seriesId,
    enabled: true,
    patch: { from: 1230 },
  });
  fireEvent.click(screen.getByRole("button", { name: text.removeBand }));
  expect(props.onChange).toHaveBeenLastCalledWith({
    kind: "band",
    id: props.alerts.bands[0].seriesId,
    enabled: false,
    patch: {},
  });
  expect(JSON.stringify(props.alerts)).toBe(original);
});
it("can remove retired alerts without a schedule but cannot create or modify one", () => {
  render(
    <TooltipProvider>
      <CalendarAlertsDialog {...props} schedule={null} />
    </TooltipProvider>,
  );
  expect(screen.getByRole("button", { name: text.edit })).toHaveProperty(
    "disabled",
    true,
  );
  fireEvent.click(screen.getByRole("button", { name: text.removeBand }));
  expect(props.onChange).toHaveBeenCalledOnce();
  expect(screen.getAllByRole("button", { name: text.removeSlot })).toHaveLength(
    props.alerts.slots.length,
  );
});
it("does not enable automatic launch and allows switching an old value off", () => {
  const { unmount } = show();
  const label = text.auto("Carrera LMU");
  expect(
    screen.getByRole("switch", { name: label }).getAttribute("aria-disabled"),
  ).toBe("true");
  unmount();
  show({ ...props, alerts: { ...props.alerts, autoLaunch: true } });
  fireEvent.click(screen.getByRole("switch", { name: label }));
  expect(props.onChange).toHaveBeenCalledWith({ kind: "autoLaunchOff" });
});
it("blocks protected and pending writes, and leaves the unavailable test inactive", () => {
  show({ ...props, canEdit: false, busy: true });
  for (const node of screen.getAllByRole("checkbox")) fireEvent.click(node);
  fireEvent.click(screen.getByRole("button", { name: "15 min" }));
  expect(props.onChange).not.toHaveBeenCalled();
  expect(
    screen
      .getByRole("button", { name: text.test })
      .getAttribute("aria-disabled"),
  ).toBe("true");
  expect(
    screen
      .getByRole("button", { name: text.save })
      .getAttribute("aria-disabled"),
  ).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: text.save }));
  expect(props.onClose).not.toHaveBeenCalled();
});
it("adds a missing favorite band by intent without overwriting a concurrent winner", () => {
  show({ ...props, alerts: { ...props.alerts, bands: [] } });
  fireEvent.click(screen.getByRole("button", { name: text.add }));
  expect(props.onChange).toHaveBeenCalledWith({
    kind: "band",
    id: props.following[0],
    enabled: true,
    patch: {},
  });
});

it("shows legacy duplicate alerts safely and lets the user remove an unrepresentable date", () => {
  const band = props.alerts.bands[0];
  const slot = { seriesId: "retired", at: 2 ** 63 };
  const alerts = { ...props.alerts, bands: [band, band], slots: [slot, slot] };
  const before = JSON.stringify(alerts);
  show({ ...props, alerts });
  expect(screen.getByText(text.duplicates)).toBeTruthy();
  expect(screen.getByText(text.invalidSlot)).toBeTruthy();
  expect(screen.getAllByRole("button", { name: text.removeSlot })).toHaveLength(
    1,
  );
  fireEvent.click(screen.getByRole("button", { name: text.removeSlot }));
  expect(props.onChange).toHaveBeenLastCalledWith({
    kind: "slot",
    id: slot.seriesId,
    at: slot.at,
    enabled: false,
  });
  expect(JSON.stringify(alerts)).toBe(before);
});

it("preserves the focused checkbox while saving and reports its blocked second click", () => {
  const result = show();
  const checkbox = screen.getByRole("checkbox", { name: text.track });
  checkbox.focus();
  fireEvent.click(checkbox);
  expect(props.onChange).toHaveBeenCalledOnce();
  result.rerender(
    <TooltipProvider>
      <CalendarAlertsDialog {...props} busy />
    </TooltipProvider>,
  );
  expect(document.activeElement).toBe(checkbox);
  expect(checkbox.getAttribute("aria-disabled")).toBe("true");
  fireEvent.click(checkbox);
  expect(props.onChange).toHaveBeenCalledOnce();
  expect(
    screen
      .getAllByRole("status")
      .some((node) => node.textContent === text.saving),
  ).toBe(true);
});
it("blocks global edits for legacy duplicates but allows their removal", () => {
  const band = props.alerts.bands[0];
  show({ ...props, alerts: { ...props.alerts, bands: [band, band] } });
  fireEvent.click(screen.getByRole("button", { name: "15 min" }));
  fireEvent.click(screen.getByRole("checkbox", { name: text.sound }));
  expect(props.onChange).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: text.removeBand }));
  expect(props.onChange).toHaveBeenCalledOnce();
});
it("keeps retired series visible and removable when the publication disappears", () => {
  const result = show();
  result.rerender(
    <TooltipProvider>
      <CalendarAlertsDialog
        {...props}
        schedule={{ ...props.schedule, series: [] }}
      />
    </TooltipProvider>,
  );
  expect(
    screen.getByText(text.missing(props.alerts.bands[0].seriesId)),
  ).toBeTruthy();
  expect(screen.getByRole("button", { name: text.edit })).toHaveProperty(
    "disabled",
    true,
  );
  fireEvent.click(screen.getByRole("button", { name: text.removeBand }));
  expect(props.onChange).toHaveBeenCalledOnce();
});

it.each([false, true])(
  "preserves saved desktop channels (%s) as read only and labels the future preview",
  (saved) => {
    const alerts = structuredClone(props.alerts);
    alerts.channels.windows = saved;
    alerts.channels.sound = saved;
    const before = JSON.stringify(alerts);
    show({ ...props, alerts });
    expect(screen.getByText(text.deliveryPending)).toBeTruthy();
    expect(screen.getByText(text.previewPending)).toBeTruthy();
    expect(screen.getByRole("heading", { name: text.sample })).toBeTruthy();
    for (const label of [text.windows, text.sound]) {
      const node = screen.getByRole("checkbox", { name: label });
      expect(node.getAttribute("aria-checked")).toBe(String(saved));
      expect(node.getAttribute("aria-disabled")).toBe("true");
      const hint = document.getElementById(
        node.getAttribute("aria-describedby") ?? "",
      );
      expect(hint?.textContent).toContain("solo lectura");
      fireEvent.click(node);
      fireEvent.keyDown(node, { key: " " });
    }
    expect(props.onChange).not.toHaveBeenCalled();
    expect(JSON.stringify(alerts)).toBe(before);
    fireEvent.click(screen.getByRole("checkbox", { name: text.track }));
    expect(props.onChange).toHaveBeenCalledWith({
      kind: "channel",
      channel: "inTrack",
      value: false,
    });
    expect(JSON.stringify(alerts)).toBe(before);
  },
);

it("explains that lead time belongs to ICS and not to the overlay thresholds", () => {
  show();
  expect(screen.getByText(text.leadScope)).toBeTruthy();
  expect(
    screen.getByRole("group", { name: `${text.lead}. ${text.leadScope}` }),
  ).toBeTruthy();
});
