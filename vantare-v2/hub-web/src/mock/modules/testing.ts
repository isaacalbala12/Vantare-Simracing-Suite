import { testingMethods } from "../../contract/generated/testing";
import type { MockContext, MockHandler } from "../context";
import { createTestingMock } from "../testing";

export function create({ sceneName, core }: MockContext): MockHandler {
  if (sceneName.startsWith("testing-")) {
    core.access = { ...core.access, verified: true, blocked: false, tester: sceneName.startsWith("testing-tester") };
    core.services = sceneName === "testing-reference" ? "unavailable" : "connected";
  }
  const reply = createTestingMock(sceneName, core);
  return (value) => value.kind === "request" && testingMethods.some((method) => method === value.request.method)
    ? reply(value.id, value.request)
    : undefined;
}
