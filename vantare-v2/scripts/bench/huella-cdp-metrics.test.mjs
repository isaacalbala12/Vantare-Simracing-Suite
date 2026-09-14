import assert from "node:assert/strict";
import test from "node:test";
import {selectPageMemoryMetrics} from "./huella-cdp-metrics.mjs";

test("extracts bounded JS heap diagnostics per CDP target", () => {
  assert.deepEqual(selectPageMemoryMetrics([
    {name: "JSHeapUsedSize", value: 12_345},
    {name: "JSHeapTotalSize", value: 65_536},
    {name: "Documents", value: 2},
    {name: "Nodes", value: 900},
    {name: "JSEventListeners", value: 42},
    {name: "Unrelated", value: 1},
  ]), {
    jsHeapUsedBytes: 12_345,
    jsHeapTotalBytes: 65_536,
    documents: 2,
    nodes: 900,
    jsEventListeners: 42,
  });
});

test("fails visibly with nulls when CDP omits a metric", () => {
  assert.deepEqual(selectPageMemoryMetrics([]), {
    jsHeapUsedBytes: null,
    jsHeapTotalBytes: null,
    documents: null,
    nodes: null,
    jsEventListeners: null,
  });
});
