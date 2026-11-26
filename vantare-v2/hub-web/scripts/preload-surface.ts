import assert from "node:assert/strict";

/** Shared by the Windows smoke and a normal test of the actual preload. */
export function assertRendererIsolation(result: {
  node: string;
  bridge: string[];
}) {
  assert.equal(result.node, "undefined", "Node leaked into the renderer");
  assert.deepEqual(
    [...result.bridge].sort(),
    ["connect", "mounted", "platform", "reviewTrust", "viewport"],
    "Unexpected public preload surface",
  );
}

/**
 * The window client area and `screen` both use screen pixels; only the CSS
 * viewport changes with page zoom. Chromium reports subpixels after zoom, so
 * round the measured client area before comparing it with the screen.
 */
export function assertWindowFitsScreen(
  viewport: { width: number; height: number },
  available: { width: number; height: number },
) {
  const width = Math.round(viewport.width);
  const height = Math.round(viewport.height);
  assert.ok(
    width <= available.width,
    `Client area ${width}px is wider than the ${available.width}px screen`,
  );
  assert.ok(
    height <= available.height,
    `Client area ${height}px is taller than the ${available.height}px screen`,
  );
}
