import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ANIMATION_SCENES } from "./animation-scenes";
import { materializeRedlineViewModelReplay } from "./redline-viewmodel-replay";

const repositoryRoot = join(process.cwd(), "..");
const replayPath = join(
  repositoryRoot,
  "tools/benchmarks/isa370-overlay-renderers/replay/redline-viewmodels-v1.jsonl",
);
const manifestPath = join(
  repositoryRoot,
  "tools/benchmarks/isa370-overlay-renderers/replay/redline-viewmodels-v1.manifest.json",
);

describe("materialized Redline ViewModel replay", () => {
  it("reproduces the committed 15-scene corpus byte for byte", () => {
    const first = materializeRedlineViewModelReplay(repositoryRoot);
    const second = materializeRedlineViewModelReplay(repositoryRoot);

    expect(first.jsonl.equals(second.jsonl)).toBe(true);
    expect(first.manifestBytes.equals(second.manifestBytes)).toBe(true);
    expect(first.jsonl.equals(readFileSync(replayPath))).toBe(true);
    expect(first.manifestBytes.equals(readFileSync(manifestPath))).toBe(true);
    expect(first.records).toHaveLength(2466);
    expect(first.records.map((record) => record.sequence)).toEqual(
      first.records.map((_, index) => index),
    );
    expect(first.manifest.scenes.map((scene) => scene.id)).toEqual(
      ANIMATION_SCENES.map((scene) => scene.id),
    );
    expect(first.jsonl.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))).toBe(false);
    expect(first.jsonl.toString("utf8")).not.toContain("\r");
  });
});
