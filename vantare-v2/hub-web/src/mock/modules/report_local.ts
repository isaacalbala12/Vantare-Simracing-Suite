import { reportBinaryNames } from "../../contract/generated/report_local";
import type { MockContext, MockHandler } from "../context";
export function create({ core }: MockContext): MockHandler {
  const binaries = reportBinaryNames.map((name) => ({
    name,
    state: "unavailable" as const,
    sha256: null,
  }));
  return (value) => {
    if (value.kind !== "request") return undefined;
    const { id, request } = value;
    switch (request.method) {
      case "report.localPrepare":
        if (!core.access.verified || core.access.blocked)
          return { kind: "failure", id, error: { kind: "denied" } };
        return {
          kind: "response",
          id,
          result: {
            method: request.method,
            value: {
              core: core.photos,
              binaries,
              report: JSON.stringify({
                schemaVersion: 1,
                module: request.fields.module,
                privateFieldsPresent: [
                  request.fields.actionText,
                  request.fields.expectedText,
                  request.fields.observedText,
                  request.fields.contextText,
                ].map((text) => text.length > 0),
                privateText: "omitted_for_privacy",
                diagnostic: { core: core.photos, binaries },
              }),
            },
          },
        };
      case "report.localExport":
        return { kind: "failure", id, error: { kind: "unsupported" } };
      default:
        return undefined;
    }
  };
}
