import { expect, it, vi } from "vitest";
import { externalPages, publicDocumentUrl } from "../src/main/external-pages";

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
  await Promise.resolve();
  expect(open).toHaveBeenCalledWith("https://vantare.app/#precios");
  time = 5000;
  expect(await page("privacy.policy")).toBe(false);
  finish();
  expect(await first).toBe(true);
  const second = page("privacy.policy");
  await Promise.resolve();
  finish();
  expect(await second).toBe(true);
  expect(await page("onboarding.prices")).toBe(false);
  time += 2000;
  const third = page("onboarding.prices");
  await Promise.resolve();
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

it("checks HTTPS and the exact host before allowing an external document", () => {
  expect(publicDocumentUrl("https://vantare.app/#precios")).toBe(true);
  expect(publicDocumentUrl("https://vantare.app/privacidad")).toBe(true);
  for (const url of [
    "http://vantare.app/",
    "https://www.vantare.app/",
    "https://vantare.app.evil.test/",
    "https://vantare.app@evil.test/",
    "https://evil@vantare.app/",
    "https://vantare.app:8080/",
    "file:///etc/passwd",
    "garbage",
  ])
    expect(publicDocumentUrl(url)).toBe(false);
});

it("acknowledges the same document without another open, including concurrent ports", async () => {
  let finish!: () => void;
  const open = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const page = externalPages(open, () => 0);
  const first = page("onboarding.prices");
  const duplicate = page("onboarding.prices");
  await Promise.resolve();
  expect(open).toHaveBeenCalledOnce();
  finish();
  expect(await first).toBe(true);
  expect(await duplicate).toBe(true);
  expect(await page("onboarding.prices")).toBe(true);
  expect(open).toHaveBeenCalledOnce();
});
