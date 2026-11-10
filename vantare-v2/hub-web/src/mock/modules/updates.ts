import updatesBase from "../../../fixtures/updates-base.json";
import updatesReady from "../../../fixtures/updates-ready.json";
import type { HostToUi, UiToHost } from "../../contract/generated/contract";
import type { MockContext, MockHandler } from "../context";
export function create(context: MockContext): MockHandler {
  const { sceneName } = context;
  return (value: UiToHost): HostToUi | null | undefined => {
    if (value.kind === "subscribe" && value.topic === "updates")
      return {
        kind: "event",
        event: {
          topic: "updates",
          value: (sceneName === "actualizacion-lista"
            ? updatesReady
            : updatesBase) as import("../../contract/generated/contract").UpdatesView,
        },
      };
    if (value.kind !== "request") return undefined;
    const { id, request } = value;
    switch (request.method) {
      case "updates.get":
        if (sceneName === "actualizacion-error")
          return { kind: "failure", id, error: { kind: "io" } };
        return {
          kind: "response",
          id,
          result: {
            method: "updates.get",
            value: (sceneName === "actualizacion-lista"
              ? updatesReady
              : updatesBase) as import("../../contract/generated/contract").UpdatesView,
          },
        };
      case "updates.restart":
        return {
          kind: "response",
          id,
          result: {
            method: "updates.restart",
            accepted: sceneName === "actualizacion-lista",
          },
        };

      default:
        return undefined;
    }
  };
}
