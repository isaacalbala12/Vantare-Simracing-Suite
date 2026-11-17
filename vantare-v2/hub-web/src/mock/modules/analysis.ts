import { methods } from "../../contract/modules/analysis";
import type { MockContext, MockHandler } from "../context";
export function create({ core }: MockContext): MockHandler {
  return (message) => {
    if (
      message.kind !== "request" ||
      !methods.some((method) => method === message.request.method)
    )
      return undefined;
    const { id, request } = message;
    if (!core.access.verified || core.access.blocked || !core.access.analysis)
      return { kind: "failure", id, error: { kind: "denied" } };
    if (request.method === "analysis.catalog")
      return {
        kind: "response",
        id,
        result: { method: request.method, recordings: [], max: 256 },
      };
    // C2b-2 implements the worker and reader lifetime.
    return { kind: "failure", id, error: { kind: "unsupported" } };
  };
}
