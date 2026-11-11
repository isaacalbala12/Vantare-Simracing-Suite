import { testingMethods } from "../../contract/generated/testing";
import type { MockContext, MockHandler } from "../context";
import { createTestingMock } from "../testing";

export function create(context: MockContext): MockHandler {
  const { sceneName, core, emit } = context;
  if (sceneName.startsWith("testing-")) {
    core.access = {
      ...core.access,
      verified: true,
      blocked: false,
      tester: sceneName.startsWith("testing-tester"),
      calendar: [
        "testing-tester-reference",
        "testing-tester-questionnaires-reference",
      ].includes(sceneName)
        ? true
        : core.access.calendar,
    };
    core.services = ["testing-reference", "testing-tester-reference"].includes(
      sceneName,
    )
      ? "unavailable"
      : "connected";
  }
  context.testingData ??= { reports: [], questionnaires: [] };
  const reply = createTestingMock(sceneName, core, context.testingData);
  return (value) => {
    if (
      value.kind !== "request" ||
      !testingMethods.some((method) => method === value.request.method)
    )
      return undefined;
    const result = reply(value.id, value.request);
    // Reproduce GPUI's cached QA participation with the service subsequently offline.
    // The initial refresh still passes the same rights/connection checks as every request.
    if (
      sceneName === "testing-tester-questionnaires-reference" &&
      result.kind === "response" &&
      result.result.method === "testing.refresh"
    ) {
      core.services = "unavailable";
      queueMicrotask(() =>
        emit?.({
          kind: "event",
          event: { topic: "core", value: structuredClone(core) },
        }),
      );
    }
    return result;
  };
}
