import pilotFixture from "../../../fixtures/pilot-base.json";
import visualPilot from "../../../fixtures/pilot-visual.json";
import type { HostToUi, UiToHost } from "../../contract/generated/contract";
import type { MockContext, MockHandler } from "../context";
export function create(context: MockContext): MockHandler {
  const { sceneName, core } = context;
  let pilot = structuredClone(
    pilotFixture,
  ) as import("../../contract/generated/contract").PilotView;
  if (context.visual) pilot.fields = structuredClone(visualPilot);
  let pilotConflicted = false;
  if (sceneName.startsWith("cuenta-") && sceneName !== "cuenta-desconectada")
    core.services = "connected";
  return (value: UiToHost): HostToUi | null | undefined => {
    if (value.kind !== "request") return undefined;
    const { id, request } = value;
    switch (request.method) {
      case "pilot.load":
        if (sceneName === "cuenta-desconectada")
          return { kind: "failure", id, error: { kind: "coreUnavailable" } };
        return {
          kind: "response",
          id,
          result: { method: request.method, value: structuredClone(pilot) },
        };
      case "pilot.save":
        if (sceneName === "cuenta-error")
          return { kind: "failure", id, error: { kind: "io" } };
        if (sceneName === "cuenta-ocupada")
          return { kind: "failure", id, error: { kind: "busy" } };
        if (sceneName === "cuenta-conflicto" && !pilotConflicted) {
          pilotConflicted = true;
          pilot = {
            ...pilot,
            revision: "2",
            fields: { ...pilot.fields, favoriteTeam: "Cambio concurrente QA" },
          };
          return { kind: "failure", id, error: { kind: "denied" } };
        }
        if (request.baseRevision !== pilot.revision)
          return { kind: "failure", id, error: { kind: "denied" } };
        pilot = {
          fields: structuredClone(request.fields),
          revision: String(BigInt(pilot.revision) + 1n),
          pending: false,
        };
        return {
          kind: "response",
          id,
          result: { method: request.method, value: structuredClone(pilot) },
        };

      default:
        return undefined;
    }
  };
}
