// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { onboardingKits } from "../src/contract/generated/onboarding";
import { KitArt } from "../src/renderer/ui/onboarding/KitArt";

afterEach(cleanup);
it("combines selected native kits without repeated widgets and counts Pro accurately", () => {
  render(<KitArt kit={[...onboardingKits[0], ...onboardingKits[1]]} />);
  expect(screen.getAllByRole("img")).toHaveLength(6);
  expect(screen.getByText("6 WIDGETS · 2 PRO")).toBeTruthy();
  expect(screen.getAllByText("PRO")).toHaveLength(2);
  expect(screen.getByText("Pedals")).toBeTruthy();
});
it("uses the exact versioned native geometry rather than a second size table", () => {
  expect(
    readFileSync(resolve("src/renderer/assets/onboarding/previews.json")),
  ).toEqual(
    readFileSync(resolve("../native/ui/fixtures/onboarding-previews.json")),
  );
});
