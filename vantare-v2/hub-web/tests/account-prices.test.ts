import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { accountText, foundersCopy } from "../src/renderer/i18n/account.es";

const source = await readFile(
  resolve(
    import.meta.dirname,
    "../../native/hub/src/services/view/founders.rs",
  ),
  "utf8",
);
it("keeps Pro display prices equal to the frozen GPUI source", () => {
  const prices = [...source.matchAll(/"(Pro · [^"]+)"/g)].map(
    (match) => match[1],
  );
  expect([accountText.monthly, accountText.annual]).toEqual(prices);
});
it("keeps every Founders price and language equal to the frozen GPUI source", () => {
  const prices = [...source.matchAll(/button: "([^"]+)"/g)].map(
    (match) => match[1],
  );
  expect(Object.values(foundersCopy).map((copy) => copy.button)).toEqual(
    prices,
  );
});
