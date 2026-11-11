import shortcuts from "../../../fixtures/shortcuts-base.json";
import type { HostToUi, UiToHost } from "../../contract/generated/contract";
import type { MockContext, MockHandler } from "../context";
export function create(context: MockContext): MockHandler {
  const { sceneName } = context;
  return (value: UiToHost): HostToUi | null | undefined => {
    if (value.kind !== "request") return undefined;
    const { id, request } = value;
    switch (request.method) {
      case "shortcuts.get":
        if (sceneName === "atajos-error")
          return { kind: "failure", id, error: { kind: "io" } };
        return {
          kind: "response",
          id,
          result: {
            method: "shortcuts.get",
            value: context.visual
              ? { profiles: [], protected: false }
              : (shortcuts as import("../../contract/generated/contract").ShortcutsView),
          },
        };

      default:
        return undefined;
    }
  };
}
