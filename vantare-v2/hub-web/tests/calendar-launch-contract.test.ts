import { expect, it } from "vitest";
import {
  isCalendarLaunchArm,
  isCalendarLaunchCancel,
  isCalendarLaunchView,
} from "../src/contract/calendar-launch-validation";
import type { ProfilePolicy } from "../src/contract/generated/contract";
import { calendarDecisionRequired } from "../src/mock/calendar-launch";

const arm = {
  method: "calendar.launchArm",
  profile: "lmu",
  baseRevision: "a".repeat(64),
  armedGeneration: "b".repeat(64),
  mode: { kind: "once", seriesId: "s", startAt: 1800000180000 },
};
it("accepts only closed identifiers and fixed scope, rejecting paths, invalid tokens and extra fields", () => {
  expect(isCalendarLaunchArm(arm)).toBe(true);
  for (const patch of [
    { path: "C:/x" },
    { baseRevision: "x".repeat(64) },
    { armedGeneration: "a" },
    { profile: "" },
    { profile: "a".repeat(257) },
    { mode: { ...arm.mode, startAt: -1 } },
    { mode: { ...arm.mode, command: "run" } },
    { mode: { kind: "alerts", expectedRevision: "bad" } },
  ])
    expect(isCalendarLaunchArm({ ...arm, ...patch })).toBe(false);
  expect(
    isCalendarLaunchCancel({
      method: "calendar.launchCancel",
      armId: "c".repeat(64),
    }),
  ).toBe(true);
  expect(
    isCalendarLaunchCancel({
      method: "calendar.launchCancel",
      armId: "C".repeat(64),
    }),
  ).toBe(false);
});
it("separates queued, running, typed completion and unknown without allowing free messages", () => {
  const base = { armed: null, automatic: null, latest: null, change: null };
  const attempt = {
    armId: "a".repeat(64),
    profileName: "LMU",
    seriesId: "s",
    startAt: 1800000180000,
  };
  for (const progress of [
    { kind: "queued", request: "a".repeat(32) },
    { kind: "running", request: "a".repeat(32), run: "1" },
    {
      kind: "finished",
      request: "a".repeat(32),
      run: "1",
      outcome: { kind: "completed" },
    },
    { kind: "unknown", request: null, reason: "noReceipt" },
  ])
    expect(
      isCalendarLaunchView({ ...base, latest: { ...attempt, progress } }),
    ).toBe(true);
  for (const progress of [
    { kind: "queued", request: "a".repeat(31) },
    { kind: "running", request: "a".repeat(32), run: "0" },
    { kind: "unknown", request: null, reason: "free message" },
    {
      kind: "finished",
      request: "a".repeat(32),
      run: "1",
      outcome: { kind: "completed", message: "ok" },
    },
  ])
    expect(
      isCalendarLaunchView({ ...base, latest: { ...attempt, progress } }),
    ).toBe(false);
});

it("the mock mirrors all five Rust Ask policy checks", () => {
  const policy: ProfilePolicy = {
    alreadyRunning: "reuse",
    failure: "stop",
    cancel: "leave",
    exit: "leave",
    retry: "failed",
    retries: 0,
    firstStepDelay: 0,
  };
  expect(calendarDecisionRequired(policy)).toBe(false);
  for (const field of [
    "alreadyRunning",
    "failure",
    "cancel",
    "exit",
    "retry",
  ] as const)
    expect(calendarDecisionRequired({ ...policy, [field]: "ask" })).toBe(true);
});
