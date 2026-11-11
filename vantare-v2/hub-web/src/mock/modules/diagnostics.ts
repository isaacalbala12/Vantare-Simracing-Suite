import diagnosticFixture from "../../../fixtures/diagnostics-base.json";
import type { HostToUi, UiToHost } from "../../contract/generated/contract";
import type { MockContext, MockHandler } from "../context";
export function create(context: MockContext): MockHandler {
  const { sceneName } = context;
  let diagnostic = structuredClone(
    diagnosticFixture,
  ) as import("../../contract/generated/contract").DiagnosticView;
  if (sceneName === "diagnostico-observado")
    diagnostic.events = [
      { section: "services", code: "unavailable", sequence: 1 },
      { section: "privacy", code: "conflict", sequence: 2 },
    ];
  const initialEvents = structuredClone(diagnostic.events);
  return (value: UiToHost): HostToUi | null | undefined => {
    if (value.kind !== "request") return undefined;
    const { id, request } = value;
    diagnostic = {
      ...diagnostic,
      events: [
        ...initialEvents,
        ...context.notes.map((entry, index) => ({
          ...entry,
          sequence: initialEvents.length + index + 1,
        })),
      ],
    };
    switch (request.method) {
      case "diagnostics.get":
        return {
          kind: "response",
          id,
          result: { method: request.method, value: diagnostic },
        };
      case "diagnostics.prepare": {
        if (sceneName === "cierre-live-pendiente")
          return { kind: "closeRequested", reason: "live" };
        diagnostic = {
          ...diagnostic,
          report: JSON.stringify({
            schemaVersion: 1,
            observed: { ...diagnostic, report: null },
          }),
        };
        return {
          kind: "response",
          id,
          result: { method: request.method, value: diagnostic },
        };
      }
      case "diagnostics.copy":
        return diagnostic.report
          ? {
              kind: "response",
              id,
              result: { method: request.method, text: diagnostic.report },
            }
          : { kind: "failure", id, error: { kind: "unsupported" } };

      default:
        return undefined;
    }
  };
}
