import type { HostToUi, UiToHost } from "../../contract/generated/contract";
import type { MockContext, MockHandler } from "../context";
export function create(context: MockContext): MockHandler {
  const { sceneName, core } = context;
  let draft: import("../../contract/generated/contract").ReportDraftView = {
    fields: {
      module: "unknown",
      actionText: "",
      expectedText: "",
      observedText: "",
      contextText: "",
    },
    legacy: "none",
    exists: false,
    screenshots: [],
  };
  const testing: import("../../contract/generated/contract").TestingView = {
    reports: [],
    questionnaires: [],
  };
  if (sceneName.startsWith("testing-")) {
    core.access = {
      ...core.access,
      verified: true,
      blocked: false,
      tester: sceneName.startsWith("testing-tester"),
    };
    core.services = "connected";
  }
  return (value: UiToHost): HostToUi | null | undefined => {
    if (value.kind !== "request") return undefined;
    const { id, request } = value;
    switch (request.method) {
      case "testing.answer":
      case "testing.contribute":
      case "testing.credit":
      case "testing.noticeRead":
        return { kind: "failure", id, error: { kind: "unsupported" } };
      case "report.capture":
      case "report.removeScreenshot":
        return { kind: "failure", id, error: { kind: "unsupported" } };
      case "report.prepare":
      case "report.retryPrepare":
        return {
          kind: "response",
          id,
          result: {
            method: request.method,
            value: {
              id: "a".repeat(64),
              digest: "b".repeat(64),
              fields: structuredClone(draft.fields),
              appVersion: "QA",
              osVersion: "Windows",
              channel: "nightly",
              retry: request.method === "report.retryPrepare",
              screenshots: [],
            },
          },
        };
      case "report.send":
        return { kind: "failure", id, error: { kind: "unsupported" } };
      case "testing.refresh":
      case "draft.load":
      case "draft.save":
      case "draft.discard": {
        if (!core.access.verified || core.access.blocked)
          return { kind: "failure", id, error: { kind: "denied" } };
        if (core.services !== "connected" || sceneName === "testing-offline")
          return { kind: "failure", id, error: { kind: "coreUnavailable" } };
        if (request.method === "testing.refresh")
          return {
            kind: "response",
            id,
            result: { method: request.method, value: structuredClone(testing) },
          };
        if (request.method === "draft.save")
          draft = {
            fields: structuredClone(request.fields),
            legacy: "none",
            exists: true,
            screenshots: [],
          };
        if (request.method === "draft.discard")
          draft = {
            fields: {
              module: "unknown",
              actionText: "",
              expectedText: "",
              observedText: "",
              contextText: "",
            },
            legacy: "none",
            exists: false,
            screenshots: [],
          };
        return {
          kind: "response",
          id,
          result: { method: request.method, value: structuredClone(draft) },
        };
      }

      default:
        return undefined;
    }
  };
}
