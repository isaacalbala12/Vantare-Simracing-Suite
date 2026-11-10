import scene from "../../fixtures/ajustes-base.json";
import core from "../../fixtures/core-offline.json";
import type { HostToUi } from "../contract/generated/contract";
import { isUiMessage } from "../contract/validation";
export const hello: Extract<HostToUi, { kind: "hello" }> = scene as Extract<
  HostToUi,
  { kind: "hello" }
>;
export function mockReply(value: unknown): HostToUi | null {
  if (!isUiMessage(value)) return null;
  switch (value.kind) {
    case "hello":
      return value.version === 1 ? hello : null;
    case "request":
      return value.request.method === "core.get"
        ? {
            kind: "response",
            id: value.id,
            result: {
              method: "core.get",
              value: core as Extract<
                HostToUi,
                { kind: "response" }
              >["result"]["value"],
            },
          }
        : { kind: "closeRequested", reason: "window" };
    case "subscribe":
      return value.topic === "core"
        ? {
            kind: "event",
            event: {
              topic: "core",
              value: core as Extract<
                HostToUi,
                { kind: "response" }
              >["result"]["value"],
            },
          }
        : { kind: "event", event: { topic: "simStatus", live: false } };
    default:
      return null;
  }
}
