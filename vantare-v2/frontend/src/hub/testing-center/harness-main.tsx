import { createRoot } from "react-dom/client";
import "../../index.css";
import { I18nProvider } from "../../i18n/I18nProvider";
import { TestingCenterPage } from "./TestingCenterPage";
import type { ReportDraftFields } from "./contracts";
import type { TestingCenterClient } from "./testing-center-client";
import type { SubmitReportInput } from "./report-submission-client";

const payload = JSON.stringify({
  contractVersion: "testing-center.diagnostic.v1",
  generatedAtUtc: "2026-08-02T20:00:00Z",
  application: { version: "v0.1.0.5", channel: "nightly", os: "windows", arch: "amd64" },
  module: "launcher",
  errorCode: "tester.report",
  logs: [],
  sanitization: { inputLogs: 0, includedLogs: 0, omittedLogs: 0, redactedValues: 0, truncatedMessages: 0 },
}, null, 2);

const idempotencyKey = `draft_${"d".repeat(64)}`;
const reportId = `report_${"e".repeat(64)}`;

const client: TestingCenterClient = {
  async loadDraft() { return null; },
  async saveDraft(fields: ReportDraftFields) {
    return { schemaVersion: 1, idempotencyKey, ...fields };
  },
  async discardDraft() { document.documentElement.dataset.testingCenterDiscarded = "true"; },
  async prepareDiagnostic() {
    return {
      preview: {
        contractVersion: "testing-center.diagnostic.v1" as const,
        payload,
        sha256: "f".repeat(64),
        byteSize: new TextEncoder().encode(payload).byteLength,
      },
      environment: {
        appVersion: "v0.1.0.5",
        osFamily: "windows" as const,
        osVersion: "Windows 10.0.26100",
        arch: "amd64" as const,
        availableLogCount: 0,
        channel: "nightly" as const,
      },
    };
  },
};

async function submitReport(input: SubmitReportInput) {
  document.documentElement.dataset.testingCenterSubmittedPayload = input.diagnostic?.preview.payload ?? "";
  document.documentElement.dataset.testingCenterSubmittedKey = input.idempotencyKey;
  return {
    reportId,
    reportState: "submitted" as const,
    idempotent: false,
    createdAt: "2026-08-02T20:00:00Z",
  };
}

document.documentElement.classList.add("hub");
document.body.classList.add("hub");
document.documentElement.dataset.testingCenterExpectedPayload = payload;
document.documentElement.dataset.testingCenterExpectedKey = idempotencyKey;

const root = document.getElementById("root");
if (!root) throw new Error("Testing Center harness root missing");

createRoot(root).render(
  <I18nProvider>
    <main className="v52-shell-bg min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <TestingCenterPage channel="nightly" version="v0.1.0.5" client={client} submitReport={submitReport} />
    </main>
  </I18nProvider>,
);
