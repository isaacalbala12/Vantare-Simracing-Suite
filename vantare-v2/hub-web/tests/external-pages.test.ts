import { expect, it, vi } from "vitest";
import { externalPages } from "../src/main/external-pages";

it("shares one in-flight operation and a two-second clock across public documents", async () => {
  let time = 0;
  let finish!: () => void;
  const open = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const page = externalPages(open, () => time);
  const first = page("onboarding.prices");
  expect(open).toHaveBeenCalledWith("https://vantare.app/#precios");
  time = 5000;
  expect(await page("privacy.policy")).toBe(false);
  finish();
  expect(await first).toBe(true);
  const second = page("privacy.policy");
  finish();
  expect(await second).toBe(true);
  expect(await page("onboarding.prices")).toBe(false);
  time += 2000;
  const third = page("onboarding.prices");
  finish();
  expect(await third).toBe(true);
});
it("releases the shared gate after a failed external open without bypassing cadence", async () => {
  let time = 0;
  const open = vi.fn().mockRejectedValue(new Error("offline"));
  const page = externalPages(open, () => time);
  expect(await page("privacy.policy")).toBe(false);
  expect(await page("onboarding.prices")).toBe(false);
  expect(open).toHaveBeenCalledTimes(1);
  time = 2000;
  expect(await page("onboarding.prices")).toBe(false);
  expect(open).toHaveBeenCalledTimes(2);
});
