import { triageMethods } from "../../contract/generated/triage";
import type { MockContext, MockHandler } from "../context";
import { createTriageMock } from "../triage";
export function create({ sceneName, core }: MockContext): MockHandler {
  const reply = createTriageMock(sceneName, core);
  return (value) => value.kind === "request" && triageMethods.some((method) => method === value.request.method) && (value.request.method === "triage.prepare" || value.request.method === "triage.send") ? reply(value.id, value.request) : undefined;
}
