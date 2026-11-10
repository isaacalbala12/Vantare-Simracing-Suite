import type { HostToUi, UiToHost } from "../../contract/generated/contract";
import type { MockContext, MockHandler } from "../context";
export function create(context: MockContext): MockHandler {
  const { sceneName, core } = context;
  if (sceneName === "notificaciones-base") {
    core.access.verified = true;
    core.access.tester = true;
  }
  return (value: UiToHost): HostToUi | null | undefined => {
    if (value.kind !== "request") return undefined;
    const { id, request } = value;
    switch (request.method) {
      case "notifications.test":
        return {
          kind: "response",
          id,
          result: { method: "notifications.test", accepted: false },
        };

      default:
        return undefined;
    }
  };
}
