import { expect, test } from "vitest";
import { hasMeasurementSourceChanges } from "../scripts/measurement-build";

test("the active Vite config bundle does not make tracked measurement sources dirty", () => {
  expect(hasMeasurementSourceChanges("")).toBe(false);
  expect(
    hasMeasurementSourceChanges(
      "?? vantare-v2/hub-web/electron.vite.config.ts.1794545637308-63e560812cdd98.mjs",
    ),
  ).toBe(false);
});

test("tracked changes and other untracked files still block the build", () => {
  for (const status of [
    " M vantare-v2/hub-web/src/measurement.ts",
    "?? vantare-v2/hub-web/scripts/uncommitted.ts",
    "?? vantare-v2/hub-web/electron.vite.config.ts",
    "?? vantare-v2/hub-web/not-the-config.1794545637308-63e560812cdd98.mjs",
    " M vantare-v2/hub-web/electron.vite.config.ts.1794545637308-63e560812cdd98.mjs",
    "?? vantare-v2/hub-web/electron.vite.config.ts.1794545637308-63e560812cdd98.mjs\n M AGENTS.md",
  ]) {
    expect(hasMeasurementSourceChanges(status)).toBe(true);
  }
});
