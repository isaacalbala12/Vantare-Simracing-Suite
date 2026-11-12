import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PNG } from "pngjs";

export function captureOnlyMode({
  enabled,
  scene,
  current,
  invalidReason,
  themes,
}: {
  enabled: boolean;
  scene?: string;
  current?: string;
  invalidReason?: string;
  themes: number;
}) {
  if (!enabled) {
    assert.ok(
      !invalidReason,
      "--invalid-reference-reason requires --capture-only",
    );
    return "compare";
  }
  assert.ok(scene, "Capture-only requires a named scene");
  if (invalidReason !== undefined) {
    assert.ok(
      invalidReason.trim() && themes === 1,
      "Invalid-reference capture requires one theme and a reason",
    );
    return "invalid";
  }
  assert.ok(
    !current,
    "A live sweep cannot use --current without an invalid-reference reason",
  );
  return "live";
}

/** A live sweep has no reference dependency; an invalid reference remains explicit. */
export async function captureUncompared({
  scene,
  scheme,
  destination,
  capture,
  invalidReason,
  suppliedCapture = false,
  dimensions = [1440, 900],
}: {
  scene: string;
  scheme: string;
  destination: string;
  capture: () => Promise<Buffer>;
  invalidReason?: string;
  suppliedCapture?: boolean;
  dimensions?: readonly [number, number];
}) {
  await mkdir(destination, { recursive: true });
  const current = await capture();
  const png = PNG.sync.read(current);
  assert.deepEqual([png.width, png.height], dimensions);
  await writeFile(join(destination, "current.png"), current);
  return {
    scene,
    scheme,
    status: invalidReason ? "captured" : "captured-without-comparison",
    currentPngSha256: createHash("sha256").update(current).digest("hex"),
    ...(invalidReason
      ? { referenceStatus: "invalid", reason: invalidReason, suppliedCapture }
      : {}),
  };
}
