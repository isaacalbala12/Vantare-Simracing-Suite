import assert from "node:assert/strict";

/** Shared by the Windows smoke and a normal test of the actual preload. */
export function assertRendererIsolation(result: {
  node: string;
  bridge: string[];
}) {
  assert.equal(result.node, "undefined", "Node leaked into the renderer");
  assert.deepEqual(
    [...result.bridge].sort(),
    ["connect", "platform", "viewport"],
    "Unexpected public preload surface",
  );
}
