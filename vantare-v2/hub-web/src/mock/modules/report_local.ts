import { reportBinaryNames } from "../../contract/generated/report_local";
import { reportDigest } from "../../contract/report-digest";
import type { MockContext, MockHandler } from "../context";
export function create({ core, emit }: MockContext): MockHandler {
  const binaries = reportBinaryNames.map((name) => ({
    name,
    state: "unavailable" as const,
    sha256: null,
  }));
  return (value) => {
    if (value.kind !== "request") return undefined;
    const { id, request } = value;
    switch (request.method) {
      case "report.localPrepare": {
        if (!core.access.verified || core.access.blocked)
          return { kind: "failure", id, error: { kind: "denied" } };
        const report = JSON.stringify(
          {
            schemaVersion: 1,
            module: request.fields.module,
            privateFieldsPresent: [
              request.fields.actionText,
              request.fields.expectedText,
              request.fields.observedText,
              request.fields.contextText,
            ].map((text) => text.length > 0),
            privateText: "omitted_for_privacy",
            diagnostic: {
              schemaVersion: 1,
              channel: "nightly",
              version: "0.0.0",
              os: "windows",
              arch: "x86_64",
              core: core.photos,
              sectionErrors: [],
              binaries,
              uninstrumentedSections: ["studio", "analysis"],
            },
          },
          null,
          2,
        );
        void reportDigest(report)
          .then((preparedHash) =>
            emit?.({
              kind: "response",
              id,
              result: {
                method: request.method,
                value: {
                  core: core.photos,
                  binaries,
                  report,
                  preparedHash,
                },
              },
            }),
          )
          .catch(() => emit?.({ kind: "failure", id, error: { kind: "io" } }));
        return null;
      }
      case "report.localExport":
        return { kind: "failure", id, error: { kind: "unsupported" } };
      default:
        return undefined;
    }
  };
}
