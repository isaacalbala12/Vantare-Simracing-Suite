import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertReadableCpuProfile,
  summarizeCpuProfile,
} from "./isa-912-cpuprofile-summary.mjs";

function profile(functions, samples, timeDeltas) {
  return {
    nodes: functions.map((callFrame, index) => ({ id: index + 1, callFrame })),
    samples,
    timeDeltas,
  };
}

test("aggregates self time and keeps special runtime nodes separate", () => {
  const summary = summarizeCpuProfile(profile([
    { functionName: "(idle)", url: "", lineNumber: -1, columnNumber: -1 },
    { functionName: "decodeProjection", url: "http://wails.localhost/assets/index.js", lineNumber: 9, columnNumber: 3 },
  ], [1, 2, 2], [1_000, 2_000, 3_000]));

  assert.equal(summary.totalTimeUs, 6_000);
  assert.equal(summary.topFunctions[0].functionName, "decodeProjection");
  assert.equal(summary.topFunctions[0].selfTimeUs, 5_000);
  assert.equal(summary.topFunctions[0].line, 10);
  assert.equal(summary.special[0].functionName, "(idle)");
});

test("sanitizes query strings and absolute paths from reported locations", () => {
  const summary = summarizeCpuProfile(profile([
    { functionName: "renderOverlay", url: "http://wails.localhost/assets/index.js?profile=Secret#token", lineNumber: 0, columnNumber: 0 },
    { functionName: "decodeTelemetry", url: "C:\\Users\\isaac\\work\\telemetry.js?secret=value", lineNumber: 4, columnNumber: 2 },
  ], [1, 2], [4_000, 6_000]));

  assert.deepEqual(summary.topFunctions.map(({ file }) => file), ["telemetry.js", "index.js"]);
  assert.equal(JSON.stringify(summary).includes("Secret"), false);
  assert.equal(JSON.stringify(summary).includes("Users"), false);
  assert.equal(JSON.stringify(summary).includes("secret"), false);
});

test("rejects profiles dominated by minified function names", () => {
  const minified = summarizeCpuProfile(profile([
    { functionName: "a", url: "http://wails.localhost/assets/index.js", lineNumber: 0, columnNumber: 0 },
    { functionName: "renderOverlay", url: "http://wails.localhost/assets/index.js", lineNumber: 1, columnNumber: 0 },
  ], [1, 2], [6_000, 4_000]));
  assert.throws(() => assertReadableCpuProfile(minified), /minification disabled/);

  const readable = summarizeCpuProfile(profile([
    { functionName: "a", url: "http://wails.localhost/assets/index.js", lineNumber: 0, columnNumber: 0 },
    { functionName: "renderOverlay", url: "http://wails.localhost/assets/index.js", lineNumber: 1, columnNumber: 0 },
  ], [1, 2], [4_000, 6_000]));
  assert.doesNotThrow(() => assertReadableCpuProfile(readable));
});
