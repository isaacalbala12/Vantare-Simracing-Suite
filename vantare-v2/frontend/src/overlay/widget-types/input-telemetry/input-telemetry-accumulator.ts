import type { TelemetrySnapshot } from "../../core/telemetry-snapshot";
import { readNonNegativeNumber, readNormalizedInput } from "../shared/input-readers";

export type InputTelemetrySample = { capturedAt: number; throttle: number; brake: number; clutch: number; speedKph?: number; rpm?: number; gear?: number };
type HistoryState = { sessionKey: string; epoch?: number; samples: InputTelemetrySample[] };
const histories = new Map<string, HistoryState>();
const MAX_SAMPLES = 120;
function sessionKey(snapshot: TelemetrySnapshot): string { return `${snapshot.session.key ?? snapshot.session.type}:${snapshot.session.epoch ?? "unknown"}`; }
function sample(snapshot: TelemetrySnapshot): InputTelemetrySample { return { capturedAt: snapshot.capturedAt, throttle: readNormalizedInput(snapshot.player.throttle) ?? 0, brake: readNormalizedInput(snapshot.player.brake) ?? 0, clutch: readNormalizedInput(snapshot.player.clutch) ?? 0, speedKph: readNonNegativeNumber(snapshot.player.speedKph), rpm: readNonNegativeNumber(snapshot.player.rpm), gear: readNonNegativeNumber(snapshot.player.gear) }; }
export function recordInputTelemetrySample(widgetId: string, snapshot: TelemetrySnapshot): void { if (snapshot.status !== "ready" && snapshot.status !== "stale") return; const key = sessionKey(snapshot); const current = histories.get(widgetId); if (!current || current.sessionKey !== key || current.epoch !== snapshot.session.epoch) histories.set(widgetId, { sessionKey: key, epoch: snapshot.session.epoch, samples: [sample(snapshot)] }); else if (current.samples.at(-1)?.capturedAt !== snapshot.capturedAt) current.samples.push(sample(snapshot)); const next = histories.get(widgetId); if (next && next.samples.length > MAX_SAMPLES) next.samples.splice(0, next.samples.length - MAX_SAMPLES); }
export function readInputTelemetryHistory(widgetId: string, snapshot: TelemetrySnapshot, historySeconds: number): readonly InputTelemetrySample[] { const current = histories.get(widgetId); if (!current || current.sessionKey !== sessionKey(snapshot)) return []; const cutoff = snapshot.capturedAt - Math.max(1, Math.min(8, historySeconds)) * 1000; return current.samples.filter((item) => item.capturedAt >= cutoff); }
export function resetInputTelemetryHistory(): void { histories.clear(); }
