import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const cdpHelper = await readFile(new URL("./huella-cdp.mjs", import.meta.url), "utf8");
const bench = await readFile(new URL("./huella.ps1", import.meta.url), "utf8");

test("reconoce la entrada overlay dedicada", () => {
  assert.match(cdpHelper, /wails\.localhost\/overlay\.html/);
  assert.doesNotMatch(cdpHelper, /window\.location\.href === "http:\/\/wails\.localhost\/"/);
});

test("HubMin actúa sobre el target Wails y no sobre un HWND ambiguo", () => {
  assert.match(bench, /--action hub-minimise/);
  assert.match(cdpHelper, /requestedAction === "hub-minimise"/);
  assert.match(cdpHelper, /Window\.Minimise\(\)/);
  assert.doesNotMatch(bench, /ShowWindowAsync/);
});

test("el cierre limpio sobrevive a la destrucción del Hub", () => {
  assert.match(cdpHelper, /pages\.find\(\(\{ description \}\) => description\.hub\)\?\.page/);
  assert.match(cdpHelper, /pages\.find\(\(\{ description \}\) => description\.overlay\)\?\.page/);
  assert.match(cdpHelper, /Events\.Emit\("hub:open"\)/);
});
