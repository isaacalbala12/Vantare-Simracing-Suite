import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const frontendRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = join(frontendRoot, "src");
const adrPath = join(frontendRoot, "../docs/adr/0009-qt-redline-ingame-runtime.md");

async function source(path) {
  return readFile(join(sourceRoot, path), "utf8");
}

test("Qt Redline remains a desktop-window exception to the shared WidgetVisualHost boundary", async () => {
  const [studio, workshop, desktop, obs, surface, frame, adr] = await Promise.all([
    source("hub/overlay-studio/canvas/StudioWidgetFrame.tsx"),
    source("overlay/authoring/OverlayWorkshopDevRoute.tsx"),
    source("overlay/runtime/DesktopOverlayRuntime.tsx"),
    source("overlay/runtime/ObsOverlayRuntime.tsx"),
    source("overlay/runtime/RuntimeOverlaySurface.tsx"),
    source("overlay/runtime/RuntimeWidgetFrame.tsx"),
    readFile(adrPath, "utf8"),
  ]);

  assert.match(studio, /<(?:(?:Memo)?WidgetVisualHost)\b/);
  assert.match(workshop, /<WidgetVisualHost\b/);
  assert.match(desktop, /<RuntimeOverlaySurface[\s\S]*renderMode="desktop"/);
  assert.match(obs, /<RuntimeOverlaySurface[\s\S]*renderMode="obs"/);
  assert.match(surface, /<RuntimeWidgetFrame\b/);
  assert.match(frame, /<WidgetVisualHost\b/);

  assert.match(adr, /no sustituye (?:a )?Studio, Workshop ni OBS/i);
  assert.match(adr, /antes de crear la ventana ingame/i);
  assert.match(adr, /WidgetVisualHost/);
});
