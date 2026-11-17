import type { HostToUi, UiToHost } from "../contract/generated/contract";
import type { MockContext } from "./context";
import { create } from "./modules/analysis";
/** QA-only fixture adapter. Keeps the contract mock untouched for C3. */
export function analysisScene(context: MockContext) {
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
  return (value: UiToHost): HostToUi | null | undefined => {
    if (
      value.kind !== "request" ||
      !value.request.method.startsWith("analysis.")
    )
      return undefined;
    const { id, request } = value;
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
                    const date = new Date();
                    date.setDate(date.getDate() - days);
                    date.setHours(hour, minute, 0, 0);
                    if (index === 9) date.setFullYear(date.getFullYear() - 1);
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
    return mock(value);
  };
}
