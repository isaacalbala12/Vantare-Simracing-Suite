import type { HostToUi, UiToHost } from "../contract/generated/contract";
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
  if (context.settingsData)
    context.settingsData.general.grabacion = !name.startsWith("disabled");
  const mock = create(context);
  let pendingOpen: Extract<UiToHost, { kind: "request" }>["id"] | undefined;
  return (value: UiToHost): HostToUi | null | undefined => {
    if (
      value.kind !== "request" ||
      !value.request.method.startsWith("analysis.")
    )
      return undefined;
    const { id, request } = value;
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
              : Array.from({ length: 10 }, (_, index) => ({
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
                    ][index];
                    const date = new Date(clock());
                    date.setUTCDate(date.getUTCDate() - days);
                    date.setUTCHours(hour, minute, 0, 0);
                    if (index === 9)
                      date.setUTCFullYear(date.getUTCFullYear() - 1);
                    return date.getTime();
                  })(),
                  sizeBytes: 22400000 - index * 1000000,
                  recording: index === 0,
                })),
        },
      };
    }
    if (request.method === "analysis.inspect") {
      const index = Number(request.id);
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
          bestLapApproxMs: [1, 2, 3, 5, 7, 9].includes(index) ? 111600 : null,
        },
      };
    }
    if (request.method === "analysis.open") {
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
            laps: Array.from({ length: 14 }, (_, i) => ({
              ...base[i % base.length],
              index: i,
              lap: i + 1,
              sealed: i !== 13,
              gap: i === 4,
              lapTimeApproxMs:
                i === 0 || i === 4 || i === 13 ? null : 111600 + (i % 7) * 199,
            })),
          },
        };
      }
      return original;
    }
    return mock(value);
  };
}
