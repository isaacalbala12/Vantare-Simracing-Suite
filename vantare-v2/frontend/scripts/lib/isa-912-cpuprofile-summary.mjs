import path from "node:path";

const SPECIAL_FUNCTIONS = new Set([
  "(root)",
  "(program)",
  "(idle)",
  "(garbage collector)",
]);

function safeBasename(rawUrl) {
  if (typeof rawUrl !== "string" || rawUrl.length === 0) return "(native)";
  let pathname = rawUrl.split(/[?#]/, 1)[0];
  try {
    pathname = new URL(rawUrl).pathname;
  } catch {
    // CDP can also return Windows paths and synthetic script identifiers.
  }
  const normalized = pathname.replaceAll("\\", "/");
  return path.posix.basename(normalized) || "(native)";
}

function locationFor(callFrame = {}) {
  const file = safeBasename(callFrame.url);
  const line = Number.isInteger(callFrame.lineNumber) && callFrame.lineNumber >= 0
    ? callFrame.lineNumber + 1
    : null;
  const column = Number.isInteger(callFrame.columnNumber) && callFrame.columnNumber >= 0
    ? callFrame.columnNumber + 1
    : null;
  return { file, line, column };
}

function functionNameFor(callFrame = {}) {
  return typeof callFrame.functionName === "string" && callFrame.functionName.length > 0
    ? callFrame.functionName
    : "(anonymous)";
}

function profileEntry(node, selfTimeUs, totalTimeUs) {
  const functionName = functionNameFor(node.callFrame);
  const location = locationFor(node.callFrame);
  const durationSeconds = totalTimeUs / 1_000_000;
  return {
    functionName,
    ...location,
    selfTimeUs,
    selfTimeMs: selfTimeUs / 1_000,
    selfTimeMsPerSecond: durationSeconds > 0 ? (selfTimeUs / 1_000) / durationSeconds : 0,
    sharePercent: totalTimeUs > 0 ? (selfTimeUs / totalTimeUs) * 100 : 0,
  };
}

export function summarizeCpuProfile(profile, { top = 20 } = {}) {
  const nodes = Array.isArray(profile?.nodes) ? profile.nodes : [];
  const samples = Array.isArray(profile?.samples) ? profile.samples : [];
  const timeDeltas = Array.isArray(profile?.timeDeltas) ? profile.timeDeltas : [];
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const selfTimeByNode = new Map();
  let totalTimeUs = 0;

  for (let index = 0; index < samples.length; index += 1) {
    const delta = timeDeltas[index];
    if (!Number.isFinite(delta) || delta < 0) continue;
    totalTimeUs += delta;
    const nodeId = samples[index];
    if (!nodesById.has(nodeId)) continue;
    selfTimeByNode.set(nodeId, (selfTimeByNode.get(nodeId) ?? 0) + delta);
  }

  const entries = [...selfTimeByNode.entries()]
    .map(([nodeId, selfTimeUs]) => profileEntry(nodesById.get(nodeId), selfTimeUs, totalTimeUs))
    .sort((left, right) => right.selfTimeUs - left.selfTimeUs);
  const special = entries.filter((entry) => SPECIAL_FUNCTIONS.has(entry.functionName));
  const functions = entries.filter((entry) => !SPECIAL_FUNCTIONS.has(entry.functionName));
  const namedScriptFunctions = functions.filter((entry) =>
    entry.file !== "(native)" && entry.functionName !== "(anonymous)",
  );
  const namedSelfTimeUs = namedScriptFunctions.reduce((total, entry) => total + entry.selfTimeUs, 0);
  const shortNameSelfTimeUs = namedScriptFunctions
    .filter((entry) => entry.functionName.length <= 2)
    .reduce((total, entry) => total + entry.selfTimeUs, 0);

  return {
    sampleCount: samples.length,
    totalTimeUs,
    durationMs: totalTimeUs / 1_000,
    topFunctions: functions.slice(0, top),
    special,
    readability: {
      namedSelfTimeUs,
      shortNameSelfTimeUs,
      shortNameFraction: namedSelfTimeUs > 0 ? shortNameSelfTimeUs / namedSelfTimeUs : 1,
    },
  };
}

export function assertReadableCpuProfile(summary, { maximumShortNameFraction = 0.5 } = {}) {
  const { namedSelfTimeUs, shortNameFraction } = summary.readability;
  if (namedSelfTimeUs === 0 || shortNameFraction > maximumShortNameFraction) {
    throw new Error(
      "CPU profile is not readable enough; rebuild the diagnostic frontend with Vite minification disabled",
    );
  }
}
