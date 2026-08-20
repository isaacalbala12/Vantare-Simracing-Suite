/// <reference types="node" />

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ANIMATION_SCENES } from "./animation-scenes";
import {
  buildAuthoringFixtureTelemetry,
  buildAuthoringFixtureViewModel,
  buildAuthoringFixtureWidget,
} from "./authoring-fixtures";
import { interpolateSceneAt, sampleAtRate, sceneDurationMs } from "./scene-interpolation";

export const REDLINE_VIEWMODEL_REPLAY_VERSION = "redline-viewmodels-v1" as const;

const STABLE_LEAD_MS = 2_000;
const STABLE_TAIL_MS = 2_000;
const REPLAY_PATH =
  "tools/benchmarks/isa370-overlay-renderers/replay/redline-viewmodels-v1.jsonl";
const MANIFEST_PATH =
  "tools/benchmarks/isa370-overlay-renderers/replay/redline-viewmodels-v1.manifest.json";
const AUTHORITY_PATHS = [
  "frontend/src/overlay/authoring/fixtures/animation-scenes.ts",
  "frontend/src/overlay/authoring/fixtures/authoring-fixtures.ts",
  "frontend/src/overlay/authoring/fixtures/redline-viewmodel-replay.ts",
  "frontend/src/overlay/authoring/fixtures/scene-interpolation.ts",
  "frontend/src/overlay/core/widget-registry.ts",
  "frontend/src/overlay/widget-types/delta/delta-definition.ts",
  "frontend/src/overlay/widget-types/delta/delta-view-model.ts",
  "frontend/src/overlay/widget-types/pedals/pedals-definition.ts",
  "frontend/src/overlay/widget-types/pedals/pedals-view-model.ts",
  "frontend/src/overlay/widget-types/relative/relative-definition.ts",
  "frontend/src/overlay/widget-types/relative/relative-view-model.ts",
  "frontend/src/overlay/widget-types/standings/standings-definition.ts",
  "frontend/src/overlay/widget-types/standings/standings-view-model.ts",
] as const;

function sha256(bytes: string | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function roundLogicalMs(value: number): number {
  return Number(value.toFixed(6));
}

export type RedlineViewModelReplayRecord = {
  contractVersion: typeof REDLINE_VIEWMODEL_REPLAY_VERSION;
  sequence: number;
  sceneId: string;
  widget: string;
  updateHz: number;
  logicalMs: number;
  viewModel: unknown;
};

export type RedlineViewModelSceneManifest = {
  id: string;
  widget: string;
  updateHz: number;
  records: number;
  firstSequence: number;
  lastSequence: number;
  sha256: string;
};

export type RedlineViewModelReplayManifest = {
  manifestVersion: "redline-viewmodels-manifest-v1";
  contractVersion: typeof REDLINE_VIEWMODEL_REPLAY_VERSION;
  encoding: "UTF-8";
  lineEnding: "LF";
  bom: false;
  replay: {
    path: typeof REPLAY_PATH;
    sha256: string;
    records: number;
  };
  authorities: Record<(typeof AUTHORITY_PATHS)[number], string>;
  scenes: RedlineViewModelSceneManifest[];
};

export type MaterializedRedlineViewModelReplay = {
  records: RedlineViewModelReplayRecord[];
  jsonl: Buffer;
  manifest: RedlineViewModelReplayManifest;
  manifestBytes: Buffer;
};

/**
 * Freezes the exact productive ViewModels seen by Redline at their configured
 * telemetry rates. Lead and tail samples deliberately reuse the first and last
 * interpolated scene states; renderer layout, visual config and derived motion
 * events are outside this transport fixture.
 */
export function materializeRedlineViewModelReplay(
  repositoryRoot: string,
): MaterializedRedlineViewModelReplay {
  const records: RedlineViewModelReplayRecord[] = [];
  const sceneManifests: RedlineViewModelSceneManifest[] = [];

  for (const scene of ANIMATION_SCENES) {
    const scenario = {
      session: "race",
      location: "track",
      state: "ready",
      widget: scene.widget,
      system: "vantare-endurance",
      surface: "harness",
      sceneId: scene.id,
    } as const;
    const widget = buildAuthoringFixtureWidget(scenario);
    const updateHz = widget.behavior.updateHz;
    const durationMs = sceneDurationMs(scene);
    const sampleCount = Math.floor(((STABLE_LEAD_MS + durationMs + STABLE_TAIL_MS) * updateHz) / 1_000) + 1;
    const firstSequence = records.length;
    const sceneLines: string[] = [];

    for (let sceneSample = 0; sceneSample < sampleCount; sceneSample += 1) {
      const exactLogicalMs = -STABLE_LEAD_MS + (sceneSample * 1_000) / updateHz;
      const logicalMs = roundLogicalMs(exactLogicalMs);
      const sceneElapsedMs = Math.min(durationMs, Math.max(0, exactLogicalMs));
      const playhead = interpolateSceneAt(scene, sampleAtRate(sceneElapsedMs, updateHz), false);
      const snapshot = buildAuthoringFixtureTelemetry({
        ...scenario,
        sceneState: playhead.frame,
      });
      const record: RedlineViewModelReplayRecord = {
        contractVersion: REDLINE_VIEWMODEL_REPLAY_VERSION,
        sequence: records.length,
        sceneId: scene.id,
        widget: scene.widget,
        updateHz,
        logicalMs,
        viewModel: buildAuthoringFixtureViewModel(widget, snapshot),
      };
      records.push(record);
      sceneLines.push(`${JSON.stringify(record)}\n`);
    }

    sceneManifests.push({
      id: scene.id,
      widget: scene.widget,
      updateHz,
      records: sampleCount,
      firstSequence,
      lastSequence: records.length - 1,
      sha256: sha256(sceneLines.join("")),
    });
  }

  const jsonl = Buffer.from(records.map((record) => `${JSON.stringify(record)}\n`).join(""), "utf8");
  const authorities = Object.fromEntries(
    AUTHORITY_PATHS.map((path) => [path, sha256(readFileSync(join(repositoryRoot, path)))]),
  ) as RedlineViewModelReplayManifest["authorities"];
  const manifest: RedlineViewModelReplayManifest = {
    manifestVersion: "redline-viewmodels-manifest-v1",
    contractVersion: REDLINE_VIEWMODEL_REPLAY_VERSION,
    encoding: "UTF-8",
    lineEnding: "LF",
    bom: false,
    replay: {
      path: REPLAY_PATH,
      sha256: sha256(jsonl),
      records: records.length,
    },
    authorities,
    scenes: sceneManifests,
  };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  return { records, jsonl, manifest, manifestBytes };
}

export const REDLINE_VIEWMODEL_MANIFEST_PATH = MANIFEST_PATH;
