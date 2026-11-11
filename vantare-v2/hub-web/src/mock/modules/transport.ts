import type { HostToUi, UiToHost } from "../../contract/generated/contract";
import type { MockContext, MockHandler } from "../context";
export function create(context: MockContext): MockHandler {
  const { sceneName, core } = context;
  return (value: UiToHost): HostToUi | null | undefined => {
    if (value.kind === "closeAnswer" && sceneName === "cierre-live-pendiente")
      return {
        kind: "event",
        event: { topic: "simStatus", live: value.allow },
      };
    if (
      value.kind === "subscribe" &&
      (value.topic === "core" || value.topic === "simStatus")
    )
      return value.topic === "core"
        ? { kind: "event", event: { topic: "core", value: core } }
        : { kind: "event", event: { topic: "simStatus", live: false } };
    if (value.kind !== "request") return undefined;
    const { id, request } = value;
    switch (request.method) {
      case "core.get":
        return {
          kind: "response",
          id,
          result: { method: "core.get", value: core },
        };
      case "window.close":
        return { kind: "closeRequested", reason: "window" };

      default:
        return undefined;
    }
  };
}
