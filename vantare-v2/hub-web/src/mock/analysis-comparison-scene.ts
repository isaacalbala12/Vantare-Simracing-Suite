import type { HostToUi, UiToHost } from "../contract/generated/contract";
import type { MockContext } from "./context";
/** QA adapter only: exercise the native mock's traces with the 14-lap fixture. */
export function comparisonScene(
  context: MockContext,
  mock: (v: UiToHost) => HostToUi | null | undefined,
) {
  let pending: { id: number; session: string } | undefined;
  let count = 0;
  return (value: UiToHost): HostToUi | null | undefined => {
    if (value.kind !== "request") return undefined;
    const { request, id } = value;
    const name = context.sceneName.replace("analysis-qa-", "");
    if (request.method === "analysis.cancel" && pending) {
      mock({
        ...value,
        request: { method: "analysis.close", session: pending.session },
      });
      context.emit?.({
        kind: "failure",
        id: pending.id,
        error: { kind: "analysisCancelled" },
      });
      pending = undefined;
      return {
        kind: "response",
        id,
        result: { method: request.method, cancelled: true },
      };
    }
    if (request.method !== "analysis.compare") return undefined;
    count++;
    if (
      (name === "compare-loading" && count > 1) ||
      name === "compare-initial-loading"
    ) {
      pending = { id, session: request.session };
      return null;
    }
    const error = (
      {
        "compare-error": "analysisIncomparable",
        "compare-timeout": "analysisTimeout",
        "compare-cancelled": "analysisCancelled",
        "compare-changed": "analysisChanged",
        "compare-large": "analysisTooLarge",
      } as const
    )[
      name as
        | "compare-error"
        | "compare-timeout"
        | "compare-cancelled"
        | "compare-changed"
        | "compare-large"
    ];
    if (error && count === 1) {
      if (error === "analysisTimeout" || error === "analysisCancelled")
        mock({
          ...value,
          request: { method: "analysis.close", session: request.session },
        });
      return { kind: "failure", id, error: { kind: error } };
    }
    const original = mock({
      ...value,
      request: {
        ...request,
        a: request.a === 4 ? 2 : 0,
        b: request.b === 4 ? 2 : 1,
      },
    });
    if (
      original?.kind !== "response" ||
      original.result.method !== "analysis.compare"
    )
      return original;
    const result = original.result;
    const times = [
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
    ];
    for (const signal of ["speed", "throttle", "brake"] as const)
      for (const side of ["a", "b"] as const)
        result[signal][side] = result[signal][side].map((p) => ({
          ...p,
          value: signal === "throttle" && p.distance === 5000 ? 100 : p.value,
          elapsed:
            ((p.distance / 5000) * (times[request[side]] ?? 112000)) / 1000,
        }));
    if (result.delta)
      result.delta = result.delta.map((p) => ({
        ...p,
        elapsed: ((p.distance / 5000) * (times[request.a] ?? 112000)) / 1000,
        value:
          ((p.distance / 5000) *
            ((times[request.a] ?? 112000) - (times[request.b] ?? 112000))) /
          1000,
      }));
    if (name === "compare-no-delta") {
      result.delta = null;
      result.deltaUnavailable = "noCommonRange";
    }
    return original;
  };
}
