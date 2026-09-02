import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./materialize-s3-redline-catalog.mjs", import.meta.url));

test("materializa exactamente los cinco perfiles Endurance Redline sin Delta", () => {
  const output = mkdtempSync(path.join(tmpdir(), "vantare-s3-redline-"));
  const head = "a".repeat(40);
  try {
    execFileSync(process.execPath, [script, "--head", head, "--out", output]);
    const index = JSON.parse(readFileSync(path.join(output, "redline-index.json"), "utf8"));
    assert.equal(index.candidateHead, head);
    assert.equal(index.count, 5);
    assert.deepEqual(index.profiles.map((entry) => entry.ordinal), [9, 13, 14, 15, 22]);
    assert.deepEqual(
      index.profiles.filter((entry) => entry.family === "relative").map((entry) => entry.templateId),
      ["relative-redline-mirror", "relative-redline-proximity", "relative-redline-traffic"],
    );
    assert.equal(index.profiles.some((entry) => entry.family === "delta"), false);
    for (const entry of index.profiles) {
      assert.match(entry.sha256, /^[0-9a-f]{64}$/);
      const profile = JSON.parse(readFileSync(path.join(output, entry.file), "utf8"));
      const [widget] = profile.layouts.general.widgets;
      assert.equal(widget.id, entry.widgetId);
      assert.equal(widget.visual.baseSettings.templateId, entry.templateId);
      assert.equal(entry.persistedFrameWidth, widget.layout.w);
      if (entry.ordinal === 9) {
        assert.equal(entry.persistedFrameWidth, 280);
        assert.equal(entry.expectedFrameWidth, 826);
      } else {
        assert.equal(entry.expectedFrameWidth, widget.layout.w);
      }
    }
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});

test("mantiene el ancho persistido estrecho de Standings para que el producto normalice el frame", () => {
  const output = mkdtempSync(path.join(tmpdir(), "vantare-s3-redline-"));
  try {
    execFileSync(process.execPath, [script, "--head", "a".repeat(40), "--out", output]);
    const index = JSON.parse(readFileSync(path.join(output, "redline-index.json"), "utf8"));
    const standings = index.profiles.find((entry) => entry.ordinal === 9);
    const profile = JSON.parse(readFileSync(path.join(output, standings.file), "utf8"));
    assert.equal(profile.layouts.general.widgets[0].layout.w, 280);
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});
