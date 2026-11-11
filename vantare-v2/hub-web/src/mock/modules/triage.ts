import { triageMethods } from "../../contract/generated/triage";
import type { MockContext, MockHandler } from "../context";
import { createTriageMock } from "../triage";
export function create(context: MockContext): MockHandler {
  context.testingData ??= { reports: [], questionnaires: [] };
  const reply = createTriageMock(
    context.sceneName,
    context.core,
    context.testingData,
  );
  return (value) =>
    value.kind === "request" &&
    triageMethods.some((method) => method === value.request.method) &&
    (value.request.method === "triage.prepare" ||
      value.request.method === "triage.send")
      ? reply(value.id, value.request)
      : undefined;
}
