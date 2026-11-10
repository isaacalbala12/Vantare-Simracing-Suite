import type {
  CoreStatus,
  HostToUi,
  ReportDraftView,
  ReportPreviewView,
  Request,
  TestingView,
} from "../contract/generated/contract";

export function createTestingMock(scene: string, core: CoreStatus) {
  const empty = (): ReportDraftView => ({
    fields: {
      module: "unknown",
      actionText: "",
      expectedText: "",
      observedText: "",
      contextText: "",
    },
    exists: false,
    screenshots: [],
  });
  let draft = empty();
  let preview: ReportPreviewView | undefined;
  const participation: TestingView = { reports: [], questionnaires: [] };
  return (id: number, request: Request): HostToUi => {
    if (!core.access.verified || core.access.blocked)
      return { kind: "failure", id, error: { kind: "denied" } };
    if (core.services !== "connected" || scene === "testing-offline")
      return { kind: "failure", id, error: { kind: "coreUnavailable" } };
    if (scene === "testing-busy")
      return { kind: "failure", id, error: { kind: "busy" } };
    switch (request.method) {
      case "draft.load":
        return {
          kind: "response",
          id,
          result: { method: request.method, value: structuredClone(draft) },
        };
      case "draft.save":
        if (scene === "testing-save-error")
          return { kind: "failure", id, error: { kind: "io" } };
        draft = {
          fields: structuredClone(request.fields),
          exists: true,
          screenshots: [],
        };
        preview = undefined;
        return {
          kind: "response",
          id,
          result: { method: request.method, value: structuredClone(draft) },
        };
      case "draft.discard":
        draft = empty();
        preview = undefined;
        return {
          kind: "response",
          id,
          result: { method: request.method, value: structuredClone(draft) },
        };
      case "report.prepare":
      case "report.retryPrepare":
        if (!draft.exists)
          return { kind: "failure", id, error: { kind: "denied" } };
        preview = {
          id: "a".repeat(64),
          digest: "b".repeat(64),
          fields: structuredClone(draft.fields),
          appVersion: "0.0.0",
          osVersion: "Windows",
          channel: "nightly",
          retry: request.method === "report.retryPrepare",
          screenshots: [],
        };
        return {
          kind: "response",
          id,
          result: { method: request.method, value: structuredClone(preview) },
        };
      case "report.send":
        if (!request.consent || !preview || preview.id !== request.previewId)
          return { kind: "failure", id, error: { kind: "denied" } };
        draft = empty();
        preview = undefined;
        return {
          kind: "response",
          id,
          result: {
            method: request.method,
            value: {
              id: "15350000-0000-0000-0000-000000000002",
              state: "submitted",
              createdAt: "2026-11-10T12:00:00Z",
              draftCleared: true,
            },
          },
        };
      case "testing.contribute":
        if (!request.consent)
          return { kind: "failure", id, error: { kind: "denied" } };
        if (!participation.reports.some((report) => report.id === request.id))
          participation.reports.push({
            id: request.id,
            title: "Informe estructurado",
            state: "received",
            credit: false,
            updatedAt: null,
            fixedVersion: null,
            notice: false,
          });
        return {
          kind: "response",
          id,
          result: {
            method: request.method,
            value: structuredClone(participation),
          },
        };
      case "testing.credit": {
        const report = participation.reports.find(
          (report) => report.id === request.id,
        );
        if (!report) return { kind: "failure", id, error: { kind: "denied" } };
        report.credit = request.consent;
        return {
          kind: "response",
          id,
          result: {
            method: request.method,
            value: structuredClone(participation),
          },
        };
      }
      case "testing.noticeRead": {
        const report = participation.reports.find(
          (report) =>
            report.id === request.id && report.updatedAt === request.updatedAt,
        );
        if (!report) return { kind: "failure", id, error: { kind: "denied" } };
        report.notice = false;
        return {
          kind: "response",
          id,
          result: {
            method: request.method,
            value: structuredClone(participation),
          },
        };
      }
      case "testing.refresh":
        return {
          kind: "response",
          id,
          result: {
            method: request.method,
            value: structuredClone(participation),
          },
        };
      default:
        return { kind: "failure", id, error: { kind: "unsupported" } };
    }
  };
}
