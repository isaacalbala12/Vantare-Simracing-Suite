import type { HostToUi, UiToHost } from "../contract/generated/contract";
import { comparisonScene } from "./analysis-comparison-scene";
import type { MockContext } from "./context";
import { create } from "./modules/analysis";
export const analysisQaNow = Date.UTC(2026, 10, 17, 12);
/** QA-only fixture adapter. Keeps the contract mock untouched for C3. */
export function analysisScene(context: MockContext, clock = Date.now) {
  if (!context.sceneName.startsWith("analysis-qa-")) return undefined;
  const name = context.sceneName.slice("analysis-qa-".length);
  context.core.access = {
    ...context.core.access,
    verified: name !== "signin",
    blocked: false,
    analysis: name !== "denied",
  };
  context.core.rights = "connected";
  if (context.settingsData) {
    context.settingsData.general.analisisBeta = true;
    context.settingsData.general.grabacion =
      !name.startsWith("disabled") &&
      name !== "status-disabled" &&
      name !== "status-pendingOn";
  }
  const mock = create({ ...context, sceneName: "analysis-v1" });
  const crossSessions = name === "sessions-cross";
  const sessionsMock =
    name === "sessions" || crossSessions ? create(context) : undefined;
  let useSessionsMock = false;
  const compare = comparisonScene(context, mock);
  let pendingOpen: Extract<UiToHost, { kind: "request" }>["id"] | undefined;
  return (value: UiToHost): HostToUi | null | undefined => {
    if (
      name === "settings-protected" &&
      value.kind === "request" &&
      value.request.method === "settings.update" &&
      value.request.patch.field === "grabacion" &&
      context.settingsData
    ) {
      const settings = context.settingsData;
      settings.general.grabacion = value.request.patch.value;
      settings.protected = true;
      settings.revision = (BigInt(`0x${settings.revision}`) + 1n)
        .toString(16)
        .padStart(64, "0");
      return {
        kind: "response",
        id: value.id,
        result: { method: "settings.update", value: structuredClone(settings) },
      };
    }
    if (
      value.kind !== "request" ||
      !value.request.method.startsWith("analysis.")
    )
      return undefined;
    const { id, request } = value;
    if (request.method === "analysis.status") {
      const active = [
        "status-recording",
        "status-recordingPreviousDay",
        "status-quotaUnmet",
        "status-degraded",
        "status-stopped",
        "status-limit",
        "status-pendingOff",
      ].includes(name);
      const status = active
        ? {
            state:
              name === "status-stopped"
                ? ("stopped" as const)
                : name === "status-degraded" || name === "status-quotaUnmet"
                  ? ("degraded" as const)
                  : ("recording" as const),
            cause:
              name === "status-stopped"
                ? ("writerDown" as const)
                : name === "status-quotaUnmet"
                  ? ("quotaUnmet" as const)
                  : null,
            rowId: null,
            startedAtMs:
              clock() -
              20 * 60_000 -
              (name === "status-recordingPreviousDay" ? 86_400_000 : 0),
            durableWatermark: null,
            attempted: null,
            limits: { maxRecordings: 200, maxBytes: 5_000_000_000 },
            lastPrune: {
              atMs: clock() - 40 * 60_000,
              items:
                name === "status-limit"
                  ? [41_200_000, 18_700_000, 27_900_000].map(
                      (sizeBytes, index) => ({
                        name: `series-${index + 1}-2.duckdb`,
                        modifiedAtMs: clock() - (index + 2) * 86_400_000,
                        sizeBytes,
                        reason: "count" as const,
                        result: "deleted" as const,
                      }),
                    )
                  : [],
            },
          }
        : null;
      if (name === "status-unavailable")
        return { kind: "failure", id, error: { kind: "analysisUnreadable" } };
      return {
        kind: "response",
        id,
        result: { method: request.method, status },
      };
    }
    const comparison = useSessionsMock ? undefined : compare(value);
    if (comparison !== undefined) return comparison;
    if (request.method === "analysis.cancel" && pendingOpen !== undefined) {
      context.emit?.({
        kind: "failure",
        id: pendingOpen,
        error: { kind: "analysisCancelled" },
      });
      pendingOpen = undefined;
      return {
        kind: "response",
        id,
        result: { method: request.method, cancelled: true },
      };
    }
    if (request.method === "analysis.catalog") {
      mock(value);
      sessionsMock?.(value);
      if (name === "loading") return null;
      if (name === "catalog-error")
        return { kind: "failure", id, error: { kind: "analysisTooMany" } };
      return {
        kind: "response",
        id,
        result: {
          method: request.method,
          max: 256,
          recordings:
            name === "empty" || name === "disabled-empty"
              ? []
              : Array.from(
                  { length: name === "status-limit" ? 200 : 10 },
                  (_, index) => ({
                    id: String(index).padStart(64, "0"),
                    startedAtMs: (() => {
                      const [days, hour, minute] = [
                        [0, 18, 42],
                        [0, 16, 5],
                        [0, 15, 20],
                        [1, 21, 10],
                        [1, 20, 31],
                        [3, 17, 30],
                        [3, 16, 2],
                        [5, 22, 15],
                        [14, 19, 40],
                        [14, 19, 40],
                      ][index] ?? [index + 5, 16, 5];
                      const date = new Date(clock());
                      date.setUTCDate(date.getUTCDate() - days);
                      date.setUTCHours(hour, minute, 0, 0);
                      if (index === 9)
                        date.setUTCFullYear(date.getUTCFullYear() - 1);
                      return date.getTime();
                    })(),
                    sizeBytes:
                      name === "status-limit"
                        ? 24_500_000
                        : 22400000 - index * 1000000,
                    recording:
                      index === 0 &&
                      ![
                        "status-idle",
                        "status-stopped",
                        "status-disabled",
                        "status-unavailable",
                        "status-pendingOn",
                      ].includes(name),
                  }),
                ),
        },
      };
    }
    if (request.method === "analysis.inspect") {
      const index = Number(request.id);
      if (index === 1 && sessionsMock) {
        const answer = sessionsMock({
          ...value,
          request: { ...request, id: "a".repeat(64) },
        });
        if (
          answer?.kind === "response" &&
          answer.result.method === "analysis.inspect"
        ) {
          answer.result.sessions[0].bestLapMs = 112225;
          return answer;
        }
      }
      return {
        kind: "response",
        id,
        result: {
          method: request.method,
          state: (
            [
              "complete",
              "complete",
              "unconfirmed",
              "complete",
              "unreadable",
              "complete",
              "locked",
              "complete",
              "incompatible",
              "complete",
            ] as const
          )[index % 10],
          laps: 14,
          sessions: [],
          bestLapApproxMs: [1, 2, 3, 5, 7, 9].includes(index) ? 111600 : null,
        },
      };
    }
    if (request.method === "analysis.open") {
      useSessionsMock = Number(request.id) === 1 && !!sessionsMock;
      if (useSessionsMock && sessionsMock) {
        const answer = sessionsMock({
          ...value,
          request: { ...request, id: "a".repeat(64) },
        });
        if (
          answer?.kind === "response" &&
          answer.result.method === "analysis.open"
        ) {
          const { sessions, laps } = answer.result;
          Object.assign(sessions[0], {
            kind: "other",
            kindText: "Warm-up",
            bestLapMs: 112225,
          });
          Object.assign(laps[0], { lapTimeMs: null, sectorsMs: null });
          if (crossSessions) laps[0].session = 0;
        }
        return answer;
      }
      if (name === "opening") {
        pendingOpen = id;
        return null;
      }
      const error = (
        {
          unreadable: "analysisUnreadable",
          locked: "analysisLocked",
          incompatible: "analysisIncompatible",
          missing: "analysisNotFound",
          changed: "analysisChanged",
          large: "analysisTooLarge",
          timeout: "analysisTimeout",
        } as const
      )[name as "unreadable"];
      if (error) return { kind: "failure", id, error: { kind: error } };
      const original = mock({
        ...value,
        request: { method: "analysis.open", id: "a".repeat(64) },
      });
      if (
        original?.kind === "response" &&
        original.result.method === "analysis.open"
      ) {
        const base = original.result.laps;
        return {
          ...original,
          result: {
            ...original.result,
            watermark: "18446744073709551615",
            laps: Array.from({ length: 14 }, (_, i) => {
              const lap = base[i % base.length];
              return {
                ...lap,
                index: i,
                lap: i + 1,
                sealed: i !== 13,
                gap: i === 4,
                lapTimeApproxMs: [
                  null,
                  113904,
                  112881,
                  112410,
                  null,
                  112097,
                  111600,
                  112544,
                  111815,
                  112302,
                  null,
                  112733,
                  112661,
                  null,
                ][i],
                speed: {
                  ...lap.speed,
                  max: (i === 3 ? 276 : 274 + (i % 2)) / 3.6,
                  reliable: i === 11 ? 6975 : 7200,
                  estimated: i === 11 ? 225 : 0,
                },
              };
            }),
          },
        };
      }
      return original;
    }
    return useSessionsMock ? sessionsMock?.(value) : mock(value);
  };
}
