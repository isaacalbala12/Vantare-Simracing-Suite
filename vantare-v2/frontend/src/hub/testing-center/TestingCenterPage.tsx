import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import { V52SectionHeader } from "../components/V52SectionHeader";
import {
  TESTING_CENTER_MODULES,
  type PreparedReportDiagnostic,
  type ReportDraftFields,
  type SubmittedReport,
  type TestingCenterChannel,
  type TestingCenterModule,
} from "./contracts";
import {
  TestingCenterClientError,
  type TestingCenterClient,
} from "./testing-center-client";
import type { SubmitReportInput } from "./report-submission-client";
import { DiagnosticPreviewPanel } from "./DiagnosticPreviewPanel";
import { hasReportFieldErrors, normalizedReportFields, validateReportFields } from "./validation";
import { CandidateFeedbackPanel } from "./CandidateFeedbackPanel";
import type { TestingCenterFeedbackClient } from "./candidate-feedback-client";

const EMPTY_FIELDS: ReportDraftFields = {
  actionText: "",
  expectedText: "",
  observedText: "",
  contextText: "",
  module: "unknown",
};

type TestingCenterPageProps = {
  channel: TestingCenterChannel;
  version: string | null;
  client: TestingCenterClient;
  submitReport: (input: SubmitReportInput) => Promise<SubmittedReport>;
  feedbackClient: TestingCenterFeedbackClient;
};

const MODULE_LABELS: Record<TestingCenterModule, string> = {
  hub: "Hub", launcher: "Launcher", settings: "Settings", overlay_studio: "Overlay Studio",
  overlay_runtime: "Overlay Runtime", telemetry: "Telemetry", telemetry_analysis: "Telemetry Analysis",
  engineer: "Engineer", strategy: "Strategy", calendar: "Calendar", billing: "Billing",
  account: "Account", updater: "Updater", testing_center: "Testing Center", unknown: "Unknown",
};

function safeVersion(value: string | null): string {
  return value && /^[A-Za-z0-9][A-Za-z0-9._+-]{0,31}$/u.test(value) ? value : "unknown";
}

function userMessage(code: string, t: (key: string) => string): string {
  if (code === "testing_center_membership_required" || code.endsWith("_role_required")) {
    return t("testingCenter.error.permission");
  }
  if (code === "testing_center_auth_required") return t("testingCenter.error.auth");
  if (code === "testing_center_idempotency_conflict") return t("testingCenter.error.conflict");
  return t("testingCenter.error.generic");
}

export function TestingCenterPage({
  channel,
  version,
  client,
  submitReport,
  feedbackClient,
}: TestingCenterPageProps) {
  const { t } = useI18n();
  const [fields, setFields] = useState<ReportDraftFields>(EMPTY_FIELDS);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [fieldErrors, setFieldErrors] = useState<ReturnType<typeof validateReportFields>>({});
  const [includeDiagnostic, setIncludeDiagnostic] = useState(false);
  const [includeLogs, setIncludeLogs] = useState(false);
  const [diagnostic, setDiagnostic] = useState<PreparedReportDiagnostic | null>(null);
  const [diagnosticState, setDiagnosticState] = useState<"idle" | "loading" | "error">("idle");
  const [draftState, setDraftState] = useState<"loading" | "idle" | "saving" | "saved" | "error">("loading");
  const [online, setOnline] = useState(() => navigator.onLine);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitted, setSubmitted] = useState<SubmittedReport | null>(null);
  const [discardWarning, setDiscardWarning] = useState(false);
  const [activeView, setActiveView] = useState<"report" | "validate">("report");
  const edited = useRef(false);
  const draftReady = useRef(false);
  const saveChain = useRef<Promise<unknown>>(Promise.resolve());

  const saveDraftSequentially = useCallback((nextFields: ReportDraftFields) => {
    const operation = saveChain.current
      .catch(() => undefined)
      .then(() => client.saveDraft(nextFields));
    saveChain.current = operation.catch(() => undefined);
    return operation;
  }, [client]);

  useEffect(() => {
    const setOnlineState = () => setOnline(navigator.onLine);
    window.addEventListener("online", setOnlineState);
    window.addEventListener("offline", setOnlineState);
    return () => {
      window.removeEventListener("online", setOnlineState);
      window.removeEventListener("offline", setOnlineState);
    };
  }, []);

  useEffect(() => {
    let active = true;
    client.loadDraft().then((draft) => {
      if (!active) return;
      if (draft) {
        const restored = {
          actionText: draft.actionText,
          expectedText: draft.expectedText,
          observedText: draft.observedText,
          contextText: draft.contextText,
          module: draft.module,
        };
        setFields(restored);
        setIdempotencyKey(draft.idempotencyKey);
        setFieldErrors({});
      }
      draftReady.current = true;
      setDraftState("idle");
    }).catch(() => {
      if (active) {
        draftReady.current = true;
        setDraftState("error");
      }
    });
    return () => { active = false; };
  }, [client]);

  useEffect(() => {
    if (!draftReady.current || !edited.current || submitted || submitting) return;
    const timer = window.setTimeout(() => {
      setDraftState("saving");
      saveDraftSequentially(fields).then((draft) => {
        setIdempotencyKey(draft.idempotencyKey);
        setDraftState("saved");
      }).catch(() => setDraftState("error"));
    }, 600);
    return () => window.clearTimeout(timer);
  }, [fields, saveDraftSequentially, submitted, submitting]);

  useEffect(() => {
    if (!includeDiagnostic) return;
    let active = true;
    client.prepareDiagnostic({ module: fields.module, includeLogs }).then((prepared) => {
      if (!active) return;
      if (prepared.environment.channel !== channel) {
        setDiagnostic(null);
        setDiagnosticState("error");
        return;
      }
      setDiagnostic(prepared);
      setDiagnosticState("idle");
      if (prepared.environment.availableLogCount === 0) setIncludeLogs(false);
    }).catch(() => {
      if (active) setDiagnosticState("error");
    });
    return () => { active = false; };
  }, [channel, client, fields.module, includeDiagnostic, includeLogs]);

  const changeField = useCallback((field: keyof ReportDraftFields, value: string) => {
    edited.current = true;
    setSubmitted(null);
    setSubmitError("");
    if (field === "module" && includeDiagnostic) {
      setDiagnostic(null);
      setDiagnosticState("loading");
    }
    const next = { ...fields, [field]: value } as ReportDraftFields;
    setFields(next);
    if (fieldErrors[field]) {
      const nextError = validateReportFields(next)[field];
      setFieldErrors((currentErrors) => ({ ...currentErrors, [field]: nextError }));
    }
  }, [fieldErrors, fields, includeDiagnostic]);

  const changeDiagnosticConsent = useCallback((enabled: boolean) => {
    setIncludeDiagnostic(enabled);
    setIncludeLogs(false);
    setDiagnostic(null);
    setDiagnosticState(enabled ? "loading" : "idle");
  }, []);

  const changeLogsConsent = useCallback((enabled: boolean) => {
    setIncludeLogs(enabled);
    setDiagnostic(null);
    setDiagnosticState("loading");
  }, []);

  const resetLocalState = useCallback(() => {
    edited.current = false;
    setFields(EMPTY_FIELDS);
    setFieldErrors({});
    setIdempotencyKey("");
    setIncludeDiagnostic(false);
    setIncludeLogs(false);
    setDiagnostic(null);
    setDraftState("idle");
    setDiscardWarning(false);
  }, []);

  const discardDraft = useCallback(async () => {
    try {
      await saveChain.current.catch(() => undefined);
      await client.discardDraft();
      resetLocalState();
    } catch {
      setDiscardWarning(true);
    }
  }, [client, resetLocalState]);

  const onSubmit = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    const errors = validateReportFields(fields);
    setFieldErrors(errors);
    if (hasReportFieldErrors(errors) || !online || submitted) return;
    if (includeDiagnostic && !diagnostic) {
      setSubmitError(t("testingCenter.preview.error"));
      return;
    }
    setSubmitting(true);
    setSubmitError("");
    try {
      const normalized = normalizedReportFields(fields);
      const saved = await saveDraftSequentially(normalized);
      setIdempotencyKey(saved.idempotencyKey);
      const result = await submitReport({
        channel,
        fields: normalized,
        appVersion: diagnostic?.environment.appVersion ?? safeVersion(version),
        osVersion: diagnostic?.environment.osVersion ?? "Windows",
        includeDiagnostic,
        includeLogs,
        diagnostic,
        idempotencyKey: saved.idempotencyKey,
      });
      setSubmitted(result);
      try {
        // A debounce that already fired while the RPC was in flight must
        // finish before deletion or it could recreate the draft afterwards.
        await saveChain.current.catch(() => undefined);
        await client.discardDraft();
        resetLocalState();
        setSubmitted(result);
      } catch {
        setDiscardWarning(true);
      }
    } catch (error) {
      const code = error instanceof TestingCenterClientError ? error.code : "submission_failed";
      setSubmitError(userMessage(code, t));
    } finally {
      setSubmitting(false);
    }
  }, [channel, client, diagnostic, fields, includeDiagnostic, includeLogs, online, resetLocalState, saveDraftSequentially, submitReport, submitted, t, version]);

  const logsUnavailable = !diagnostic || diagnostic.environment.availableLogCount === 0;
  const statusText = useMemo(() => {
    if (draftState === "saving") return t("testingCenter.draft.saving");
    if (draftState === "saved") return t("testingCenter.draft.saved");
    if (draftState === "error") return t("testingCenter.draft.error");
    return "";
  }, [draftState, t]);

  return (
    <div data-testid="testing-center-page" className="mx-auto flex w-full max-w-6xl flex-col gap-5 pb-8">
      <V52SectionHeader title={t("testingCenter.title")} description={t("testingCenter.description")} />
      <div className="flex flex-wrap items-center gap-2 text-sm" role="status" aria-live="polite">
        <span className="rounded border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-xs uppercase text-vantare-textMuted">{channel}</span>
        <span className={online ? "text-green-300" : "text-amber-300"}>
          {online ? t("testingCenter.online") : t("testingCenter.offline")}
        </span>
        {statusText && <span className="text-vantare-textMuted">{statusText}</span>}
      </div>

      <div className="grid grid-cols-1 gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-2 sm:grid-cols-2" role="tablist" aria-label={t("testingCenter.views.label")}>
        <button
          type="button"
          role="tab"
          id="testing-center-report-tab"
          aria-controls="testing-center-report-panel"
          aria-selected={activeView === "report"}
          className={`min-h-11 rounded-lg px-4 text-sm font-semibold ${activeView === "report" ? "bg-vantare-red-600 text-white" : "text-vantare-textMuted hover:bg-white/5 hover:text-white"}`}
          onClick={() => setActiveView("report")}
        >
          {t("testingCenter.views.report")}
        </button>
        <button
          type="button"
          role="tab"
          id="testing-center-validate-tab"
          aria-controls="testing-center-validate-panel"
          aria-selected={activeView === "validate"}
          className={`min-h-11 rounded-lg px-4 text-sm font-semibold ${activeView === "validate" ? "bg-vantare-red-600 text-white" : "text-vantare-textMuted hover:bg-white/5 hover:text-white"}`}
          onClick={() => setActiveView("validate")}
        >
          {t("testingCenter.views.validate")}
        </button>
      </div>

      {activeView === "report" && submitted && (
        <section className="rounded-xl border border-green-500/30 bg-green-500/10 p-4" role="status">
          <h2 className="font-semibold text-green-200">{t("testingCenter.success.title")}</h2>
          <p className="mt-1 text-sm text-green-100">{t("testingCenter.success.description")}</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="min-w-0 break-all rounded bg-black/30 px-3 py-2 text-xs text-white">{submitted.reportId}</code>
            <button type="button" className="btn-secondary min-h-11 px-4 text-sm" onClick={() => navigator.clipboard?.writeText(submitted.reportId)}>
              {t("testingCenter.success.copy")}
            </button>
          </div>
        </section>
      )}

      {activeView === "report" && <form id="testing-center-report-panel" role="tabpanel" aria-labelledby="testing-center-report-tab" className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]" onSubmit={onSubmit} noValidate>
        <section className="flex min-w-0 flex-col gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:p-6">
          <h2 className="text-lg font-semibold text-white">{t("testingCenter.form.title")}</h2>
          <p className="text-sm leading-relaxed text-vantare-textMuted">{t("testingCenter.form.privacy")}</p>
          <ReportTextarea id="tc-action" label={t("testingCenter.field.action")} value={fields.actionText} error={fieldErrors.actionText} onChange={(value) => changeField("actionText", value)} t={t} disabled={submitting} />
          <ReportTextarea id="tc-expected" label={t("testingCenter.field.expected")} value={fields.expectedText} error={fieldErrors.expectedText} onChange={(value) => changeField("expectedText", value)} t={t} disabled={submitting} />
          <ReportTextarea id="tc-observed" label={t("testingCenter.field.observed")} value={fields.observedText} error={fieldErrors.observedText} onChange={(value) => changeField("observedText", value)} t={t} disabled={submitting} />
          <ReportTextarea id="tc-context" label={t("testingCenter.field.context")} value={fields.contextText} error={fieldErrors.contextText} onChange={(value) => changeField("contextText", value)} t={t} optional disabled={submitting} />
          <label className="flex flex-col gap-2 text-sm font-medium text-white" htmlFor="tc-module">
            {t("testingCenter.field.module")}
            <select id="tc-module" value={fields.module} disabled={submitting} onChange={(event) => changeField("module", event.target.value)} className="min-h-11 rounded-lg border border-white/10 bg-[#111] px-3 text-base text-white disabled:opacity-60">
              {TESTING_CENTER_MODULES.map((module) => (
                <option key={module} value={module}>
                  {module === "unknown" ? t("testingCenter.module.unknown") : MODULE_LABELS[module]}
                </option>
              ))}
            </select>
          </label>
        </section>

        <aside className="flex min-w-0 flex-col gap-5">
          <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
            <h2 className="text-base font-semibold text-white">{t("testingCenter.consent.title")}</h2>
            <label className="mt-4 flex min-h-11 cursor-pointer items-start gap-3 text-sm text-white">
              <input type="checkbox" className="mt-1 h-5 w-5" checked={includeDiagnostic} disabled={submitting} onChange={(event) => changeDiagnosticConsent(event.target.checked)} />
              <span><strong>{t("testingCenter.consent.diagnostic")}</strong><small className="mt-1 block leading-relaxed text-vantare-textMuted">{t("testingCenter.consent.diagnosticHelp")}</small></span>
            </label>
            <label className="mt-3 flex min-h-11 cursor-not-allowed items-start gap-3 text-sm text-vantare-textMuted">
              <input type="checkbox" className="mt-1 h-5 w-5" checked={false} disabled />
              <span><strong>{t("testingCenter.consent.replay")}</strong><small className="mt-1 block leading-relaxed">{t("testingCenter.consent.replayUnavailable")}</small></span>
            </label>
            <label className={`mt-3 flex min-h-11 items-start gap-3 text-sm ${logsUnavailable || !includeDiagnostic ? "cursor-not-allowed text-vantare-textMuted" : "cursor-pointer text-white"}`}>
              <input type="checkbox" className="mt-1 h-5 w-5" checked={includeLogs} disabled={submitting || !includeDiagnostic || logsUnavailable} onChange={(event) => changeLogsConsent(event.target.checked)} />
              <span><strong>{t("testingCenter.consent.logs")}</strong><small className="mt-1 block leading-relaxed text-vantare-textMuted">{diagnostic && logsUnavailable ? t("testingCenter.consent.noLogs") : t("testingCenter.consent.logsHelp")}</small></span>
            </label>
          </section>
          {includeDiagnostic && <DiagnosticPreviewPanel diagnostic={diagnostic} loading={diagnosticState === "loading"} error={diagnosticState === "error"} t={t} />}
          <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
            {!online && <p className="mb-3 text-sm text-amber-300" role="alert">{t("testingCenter.offlineHelp")}</p>}
            {submitError && <p className="mb-3 text-sm text-red-300" role="alert">{submitError}</p>}
            {discardWarning && <p className="mb-3 text-sm text-amber-300" role="alert">{t("testingCenter.discard.warning")}</p>}
            <div className="flex flex-col gap-3 sm:flex-row">
              <button type="submit" className="btn-primary min-h-11 flex-1 px-5 text-sm font-semibold" disabled={!online || submitting || draftState === "loading" || Boolean(submitted)}>
                {submitting ? t("testingCenter.submit.sending") : t("testingCenter.submit")}
              </button>
              <button type="button" className="btn-secondary min-h-11 px-5 text-sm" onClick={discardDraft} disabled={submitting}>
                {t("testingCenter.discard")}
              </button>
            </div>
            {idempotencyKey && !submitted && <p className="mt-3 text-xs text-vantare-textMuted">{t("testingCenter.retry.safe")}</p>}
          </section>
        </aside>
      </form>}
      {activeView === "validate" && (
        <div id="testing-center-validate-panel" role="tabpanel" aria-labelledby="testing-center-validate-tab">
          <CandidateFeedbackPanel channel={channel} client={feedbackClient} />
        </div>
      )}
    </div>
  );
}

function ReportTextarea({ id, label, value, error, onChange, t, optional = false, disabled = false }: {
  id: string; label: string; value: string; error?: string; onChange: (value: string) => void;
  t: (key: string) => string; optional?: boolean; disabled?: boolean;
}) {
  const errorId = `${id}-error`;
  return (
    <label className="flex flex-col gap-2 text-sm font-medium text-white" htmlFor={id}>
      <span>{label}{optional && <span className="ml-2 font-normal text-vantare-textMuted">{t("testingCenter.optional")}</span>}</span>
      <textarea id={id} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} rows={3} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} className="min-h-24 resize-y rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-base leading-relaxed text-white outline-none focus:border-vantare-red-500 disabled:opacity-60" />
      {error && <span id={errorId} className="text-sm font-normal text-red-300">{t(`testingCenter.validation.${error}`)}</span>}
    </label>
  );
}
