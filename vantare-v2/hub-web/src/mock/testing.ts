import type {
  CoreStatus,
  HostToUi,
  ReportDraftView,
  ReportPreviewView,
  Request,
  TestingView,
} from "../contract/generated/contract";
import {
  reportScreenshotsAvailable,
  testingIdLimits,
} from "../contract/generated/contract";

export function createTestingMock(
  scene: string,
  core: CoreStatus,
  participation: TestingView = { reports: [], questionnaires: [] },
) {
  const empty = (): ReportDraftView => ({
    fields: {
      module: "unknown",
      actionText: "",
      expectedText: "",
      observedText: "",
      contextText: "",
    },
    exists: false,
    legacy: "none",
    screenshots: [],
    message: "",
  });
  let draft = empty();
  if (scene === "testing-legacy-archived") draft.legacy = "archived";
  if (scene === "testing-legacy-imported") draft.legacy = "imported";
  if (scene === "testing-legacy-trimmed") draft.legacy = "importedTrimmed";
  if (scene === "testing-legacy-preserved") draft.legacy = "preserved";

  let preview: ReportPreviewView | undefined;
  let previewSequence = 0;
  let busy = scene === "testing-busy";
  if (core.access.tester)
    participation.questionnaires.push({
      id: "15350000-0000-0000-0000-000000000001",
      version: "0.0.0",
      title: "Cuestionario local de QA",
      question: "¿Cómo funciona el Hub?",
      score: null,
    });
  if (
    [
      "testing-tester-questionnaires-reference",
      "testing-tester-community-reference",
    ].includes(scene)
  ) {
    participation.questionnaires = [
      {
        id: "15350000-0000-0000-0000-000000000001",
        version: "0.0.974",
        title: "QA · experiencia del Hub",
        question:
          "¿Cómo ha sido tu experiencia al configurar y lanzar los overlays?",
        score: null,
      },
    ];
  }
  if (scene === "testing-tester-community-reference")
    participation.reports.push({
      id: "15350000-0000-0000-0000-000000000002",
      title: "QA · documentación de una prueba",
      state: "reviewing",
      credit: false,
      updatedAt: null,
      fixedVersion: null,
      notice: false,
    });
  return (id: number, request: Request): HostToUi => {
    if (!core.access.verified || core.access.blocked)
      return { kind: "failure", id, error: { kind: "denied" } };
    if (core.services !== "connected" || scene === "testing-offline")
      return { kind: "failure", id, error: { kind: "coreUnavailable" } };
    if (
      ([
        "testing.refresh",
        "testing.answer",
        "testing.credit",
        "testing.noticeRead",
      ].includes(request.method) &&
        !core.access.tester) ||
      (request.method === "testing.contribute" && core.access.tester)
    )
      return { kind: "failure", id, error: { kind: "denied" } };
    if (busy) {
      busy = false;
      return { kind: "failure", id, error: { kind: "busy" } };
    }
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
          legacy: draft.legacy,
          screenshots: [],
          message: "",
        };
        preview = undefined;
        return {
          kind: "response",
          id,
          result: { method: request.method, value: structuredClone(draft) },
        };
      case "draft.discard":
        draft = { ...empty(), legacy: draft.legacy };
        preview = undefined;
        return {
          kind: "response",
          id,
          result: { method: request.method, value: structuredClone(draft) },
        };
      case "report.capture":
        return {
          kind: "failure",
          id,
          error: {
            kind: reportScreenshotsAvailable
              ? "unsupported"
              : "evidencePending",
          },
        };
      case "report.removeScreenshot":
        draft.screenshots = draft.screenshots.filter(
          (screenshot) => screenshot.id !== request.id,
        );
        draft.fields = structuredClone(request.fields);
        preview = undefined;
        return {
          kind: "response",
          id,
          result: { method: request.method, value: structuredClone(draft) },
        };
      case "testing.answer": {
        const questionnaire = participation.questionnaires.find(
          (item) => item.id === request.id,
        );
        if (!questionnaire)
          return { kind: "failure", id, error: { kind: "rejected" } };
        questionnaire.score = request.score;
        return {
          kind: "response",
          id,
          result: {
            method: request.method,
            value: structuredClone(participation),
          },
        };
      }
      case "report.prepare":
      case "report.retryPrepare":
        if (!draft.exists)
          return { kind: "failure", id, error: { kind: "rejected" } };
        preview = {
          id: (++previewSequence)
            .toString(16)
            .padStart(testingIdLimits.previewId, "0"),
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
          return { kind: "failure", id, error: { kind: "rejected" } };
        if (scene === "testing-send-error")
          return { kind: "failure", id, error: { kind: "rejected" } };
        draft = empty();
        preview = undefined;
        return {
          kind: "response",
          id,
          result: {
            method: request.method,
            value: {
              id: "15350000-0000-0000-0000-000000000002",
              state: "received",
              createdAt: "2026-11-10T12:00:00Z",
              draftState: "cleared",
            },
          },
        };
      case "testing.contribute":
        if (!request.consent)
          return { kind: "failure", id, error: { kind: "rejected" } };
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
        if (!report)
          return { kind: "failure", id, error: { kind: "rejected" } };
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
        if (!report)
          return { kind: "failure", id, error: { kind: "rejected" } };
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
