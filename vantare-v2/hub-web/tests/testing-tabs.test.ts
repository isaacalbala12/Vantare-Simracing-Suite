import { expect, it } from "vitest";
import type { AccessView } from "../src/contract/generated/contract";
import { testingTabs } from "../src/renderer/screens/testing/TestingTabs";

it("derives visible sections from verified core rights", () => {
  const access: AccessView = {
    verified: true,
    blocked: false,
    tester: false,
    calendar: false,
    engineer: false,
    strategy: false,
  };
  const visible = (rights: AccessView) =>
    testingTabs(rights)
      .filter((tab) => tab.visible)
      .map((tab) => tab.id);
  expect(visible(access)).toEqual(["reports"]);
  expect(visible({ ...access, tester: true })).toEqual([
    "summary",
    "questionnaires",
    "reports",
    "community",
  ]);
  expect(visible({ ...access, tester: true, verified: false })).toEqual([]);
  expect(visible({ ...access, tester: true, blocked: true })).toEqual([]);
});
