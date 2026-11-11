import { expect, it } from "vitest";
import {
  type CalendarAlerts,
  calendarDefaultAlerts,
} from "../src/contract/generated/calendar";
import {
  applyAlertChange,
  bandChange,
  defaultBand,
} from "../src/renderer/screens/calendar/AlertChange";

const defaults = (): CalendarAlerts => ({
  ...calendarDefaultAlerts,
  channels: { ...calendarDefaultAlerts.channels },
  bands: [],
  slots: [],
});
it("reapplies only the edited endpoint over the winner's other fields", () => {
  const before = defaults();
  before.bands = [defaultBand("qa")];
  const change = bandChange(before, "qa", { ...before.bands[0], from: 1230 });
  const winner = structuredClone(before);
  winner.bands[0].to = 1410;
  winner.channels.sound = true;
  winner.leadMin = 15;
  winner.slots = [{ seriesId: "another", at: 123 }];
  const original = JSON.stringify(winner);
  const result = applyAlertChange(winner, change);
  expect(result.bands[0]).toEqual({ ...winner.bands[0], from: 1230 });
  expect(result.channels.sound).toBe(true);
  expect(result.leadMin).toBe(15);
  expect(result.slots).toEqual(winner.slots);
  expect(JSON.stringify(winner)).toBe(original);
});
it("enabling a band preserves a winner already created by another Hub", () => {
  const before = defaults(),
    change = bandChange(before, "qa", defaultBand("qa"));
  const winner = defaults();
  winner.bands = [{ ...defaultBand("qa"), from: 1080, to: 1260 }];
  expect(applyAlertChange(winner, change).bands).toEqual(winner.bands);
});
it("removes only the selected band and keeps unrelated slots", () => {
  const before = defaults();
  before.bands = [defaultBand("retired"), defaultBand("other")];
  before.slots = [{ seriesId: "other", at: 123 }];
  const result = applyAlertChange(
    before,
    bandChange(before, "retired", undefined),
  );
  expect(result.bands).toEqual([defaultBand("other")]);
  expect(result.slots).toEqual(before.slots);
});
it("does not duplicate a slot and removes only its exact identity", () => {
  const before = defaults();
  before.slots = [
    { seriesId: "qa", at: 100 },
    { seriesId: "other", at: 100 },
  ];
  const enabled = applyAlertChange(before, {
    kind: "slot",
    id: "qa",
    at: 100,
    enabled: true,
  });
  expect(enabled.slots).toEqual(before.slots);
  expect(
    applyAlertChange(enabled, {
      kind: "slot",
      id: "qa",
      at: 100,
      enabled: false,
    }).slots,
  ).toEqual([{ seriesId: "other", at: 100 }]);
});
it("keeps channels when clearing alerts and only allows switching auto launch off", () => {
  const before = defaults();
  before.autoLaunch = true;
  before.notifyWeek = false;
  before.bands = [defaultBand("qa")];
  before.slots = [{ seriesId: "qa", at: 100 }];
  const channel = applyAlertChange(before, {
    kind: "channel",
    channel: "sound",
    value: true,
  });
  const cleared = applyAlertChange(channel, { kind: "clear" });
  expect(cleared.bands).toEqual([]);
  expect(cleared.slots).toEqual([]);
  expect(cleared.channels.sound).toBe(true);
  expect(cleared.notifyWeek).toBe(false);
  expect(applyAlertChange(cleared, { kind: "autoLaunchOff" }).autoLaunch).toBe(
    false,
  );
  expect(applyAlertChange(cleared, { kind: "lead", value: 15 }).leadMin).toBe(
    15,
  );
});
