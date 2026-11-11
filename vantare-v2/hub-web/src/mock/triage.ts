import type {
  CoreStatus,
  HostToUi,
  Request,
  TestingView,
} from "../contract/generated/contract";
import { testingIdLimits } from "../contract/generated/contract";

export function createTriageMock(
  scene: string,
  core: CoreStatus,
  participation: TestingView = { reports: [], questionnaires: [] },
) {
  let sequence = 0;
  let preview: string | undefined;
  let reportId: string | undefined;
  let busy = scene === "testing-tester-triage-busy";
  return (
    id: number,
    request: Extract<Request, { method: "triage.prepare" | "triage.send" }>,
  ): HostToUi => {
    const fail = (
      kind: "denied" | "coreUnavailable" | "rejected" | "busy",
    ): HostToUi => ({ kind: "failure", id, error: { kind } });
    if (!core.access.verified || core.access.blocked || !core.access.tester)
      return fail("denied");
    if (core.services !== "connected" || scene.endsWith("-offline"))
      return fail("coreUnavailable");
    if (busy) {
      busy = false;
      return fail("busy");
    }
    if (!request.consent) return fail("rejected");
    if (request.method === "triage.prepare") {
      preview = (++sequence)
        .toString(16)
        .padStart(testingIdLimits.previewId, "0");
      reportId = `15350000-0000-0000-0000-${sequence.toString(16).padStart(12, "0")}`;
      return {
        kind: "response",
        id,
        result: {
          method: request.method,
          value: {
            id: preview,
            payload: JSON.stringify(
              {
                p_id: reportId,
                p_channel: "nightly",
                p_title: "[contenido retirado por privacidad]",
                p_body: "[contenido retirado por privacidad]",
                p_context: {
                  app_version: "0.0.0",
                  app_channel: "nightly",
                  game: "none",
                  game_version: null,
                  system: {},
                  telemetry_summary: null,
                  posthog_session_id: null,
                  consent: {
                    version: "triage-v2",
                    items: request.selection.items.map((item) =>
                      item === "session" ? "telemetry_summary" : item,
                    ),
                    accepted_at: "2026-11-10T12:00:00Z",
                  },
                },
                p_attachments: [],
              },
              null,
              2,
            ),
          },
        },
      };
    }
    if (request.previewId !== preview || !reportId) return fail("rejected");
    preview = undefined;
    participation.reports = [
      ...participation.reports,
      {
        id: reportId,
        title: "[contenido retirado por privacidad]",
        state: "received",
        credit: false,
        updatedAt: null,
        fixedVersion: null,
        notice: false,
      },
    ].slice(-20);
    reportId = undefined;
    return {
      kind: "response",
      id,
      result: {
        method: request.method,
        value: structuredClone(participation),
      },
    };
  };
}
