import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import { useHubSuspendBlocker } from "../hub-suspend-guard";
import {
  Accordion,
  Button,
  Check,
  Field,
  Note,
  Select,
  SubtleStatus,
  Surface,
  Textarea,
  UnderlineTabs,
} from "../../ui/orbit";
import { formatMessage } from "../orbit/format-message";
import {
  TESTING_CENTER_MODULES,
  type PreparedReportDiagnostic,
  type ReportDraftFields,
  type SubmittedReport,
  type TestingCenterChannel,
  type TestingCenterModule,
} from "../testing-center/contracts";
import {
  TestingCenterClientError,
  type TestingCenterClient,
} from "../testing-center/testing-center-client";
import { wailsTestingCenterClient } from "../testing-center/wails-testing-center-client";
import {
  submitTestingCenterReport,
  type SubmitReportInput,
} from "../testing-center/report-submission-client";
import {
  hasReportFieldErrors,
  normalizedReportFields,
  validateReportFields,
  type ReportFieldErrors,
} from "../testing-center/validation";
import {
  testingCenterFeedbackClient,
  type TestingCenterFeedbackClient,
} from "../testing-center/candidate-feedback-client";
import { ValidateOrbitPanel } from "./ValidateOrbitPanel";
import "../../styles/orbit-testing.css";

/** Canal que la shell resuelve; `stable` no llega nunca a esta pantalla. */
export type TestingOrbitChannel = TestingCenterChannel;

/** Las tres cosas que un tester hace aquí (briefing 12 ampliado, D-R3-E-3). */
type TestingTab = "report" | "validate" | "mine";

const FORM_ID = "orbit-testing-form";

const EMPTY_FIELDS: ReportDraftFields = {
  actionText: "",
  expectedText: "",
  observedText: "",
  contextText: "",
  module: "unknown",
};

/** Nombres propios de los módulos: no se traducen (`14-i18n.md`). */
const MODULE_LABELS: Record<Exclude<TestingCenterModule, "unknown">, string> = {
  hub: "Hub",
  launcher: "Launcher",
  settings: "Settings",
  overlay_studio: "Overlay Studio",
  overlay_runtime: "Overlay Runtime",
  telemetry: "Telemetry",
  telemetry_analysis: "Telemetry Analysis",
  engineer: "Engineer",
  strategy: "Strategy",
  calendar: "Calendar",
  billing: "Billing",
  account: "Account",
  updater: "Updater",
  testing_center: "Testing Center",
};

function safeVersion(value: string | null | undefined): string {
  return value && /^[A-Za-z0-9][A-Za-z0-9._+-]{0,31}$/u.test(value) ? value : "unknown";
}

function userMessage(code: string, t: (key: string) => string): string {
  if (code === "testing_center_membership_required" || code.endsWith("_role_required")) {
    return t("testing.error.permission");
  }
  if (code === "testing_center_auth_required") return t("testing.error.auth");
  if (code === "testing_center_idempotency_conflict") return t("testing.error.conflict");
  return t("testing.error.generic");
}

export interface TestingCenterOrbitPageProps {
  channel: TestingOrbitChannel;
  version?: string | null;
  /** Mismo cliente y mismo servicio que la pantalla v5.2: aquí solo cambia la piel. */
  client?: TestingCenterClient;
  submitReport?: (input: SubmitReportInput) => Promise<SubmittedReport>;
  /** Mismo servicio de validación que la pantalla v5.2 (`testing-center-feedback`). */
  feedbackClient?: TestingCenterFeedbackClient;
}

/**
 * Testing Center de Command Orbit (`15-briefings/12-testing-center.md`).
 *
 * El flujo no cambia: el borrador lo guarda y lo borra el mismo cliente de
 * eventos (`testing-center-client`), la validación es la del contrato real
 * (`validation.ts`) y el envío es el RPC real (`report-submission-client`).
 * Lo único propio de este briefing es la composición: cabecera, formulario y
 * tarjeta de consentimiento sobre el kit Orbit.
 */
export function TestingCenterOrbitPage({
  channel,
  version = null,
  client = wailsTestingCenterClient,
  submitReport = submitTestingCenterReport,
  feedbackClient = testingCenterFeedbackClient,
}: TestingCenterOrbitPageProps) {
  const { t } = useI18n();

  const [tab, setTab] = useState<TestingTab>("report");
  const [fields, setFields] = useState<ReportDraftFields>(EMPTY_FIELDS);
  const [fieldErrors, setFieldErrors] = useState<ReportFieldErrors>({});
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [draftState, setDraftState] = useState<"loading" | "idle" | "saving" | "saved" | "error">(
    "loading",
  );
  const [includeDiagnostic, setIncludeDiagnostic] = useState(false);
  const [diagnostic, setDiagnostic] = useState<PreparedReportDiagnostic | null>(null);
  const [diagnosticState, setDiagnosticState] = useState<"idle" | "loading" | "error">("idle");
  const [online, setOnline] = useState(() => navigator.onLine);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitted, setSubmitted] = useState<SubmittedReport | null>(null);
  /**
   * Lo enviado en esta sesión. El servicio no publica ninguna operación de
   * historial (`testing-center-client` solo abre, guarda y descarta el
   * borrador), así que «Mis reportes» no puede leer lo de días anteriores: se
   * queda con lo de esta sesión y lo dice sin disimulo (D-R3-E-4).
   */
  const [sent, setSent] = useState<SubmittedReport[]>([]);
  const [discardWarning, setDiscardWarning] = useState(false);
  const [draftDirty, setDraftDirty] = useState(false);

  const draftReady = useRef(false);
  const draftRevision = useRef(0);
  const saveChain = useRef<Promise<unknown>>(Promise.resolve());
  useHubSuspendBlocker(
    "testing-center-draft",
    "Testing Center tiene un borrador pendiente de guardar",
    draftDirty && (draftState !== "saved" || submitting),
  );

  const saveDraftSequentially = useCallback(
    (next: ReportDraftFields) => {
      const operation = saveChain.current.catch(() => undefined).then(() => client.saveDraft(next));
      saveChain.current = operation.catch(() => undefined);
      return operation;
    },
    [client],
  );

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  // El borrador vive en disco: se abre al montar y se restaura tal cual.
  useEffect(() => {
    let active = true;
    client
      .loadDraft()
      .then((draft) => {
        if (!active) return;
        if (draft) {
          setFields({
            actionText: draft.actionText,
            expectedText: draft.expectedText,
            observedText: draft.observedText,
            contextText: draft.contextText,
            module: draft.module,
          });
          setIdempotencyKey(draft.idempotencyKey);
        }
        draftReady.current = true;
        setDraftState("idle");
      })
      .catch(() => {
        if (!active) return;
        draftReady.current = true;
        setDraftState("error");
      });
    return () => {
      active = false;
    };
  }, [client]);

  useEffect(() => {
    if (!draftReady.current || !draftDirty || submitted || submitting) return;
    const timer = window.setTimeout(() => {
      const revision = draftRevision.current;
      setDraftState("saving");
      saveDraftSequentially(fields)
        .then((draft) => {
          setIdempotencyKey(draft.idempotencyKey);
          if (revision === draftRevision.current) setDraftState("saved");
        })
        .catch(() => {
          if (revision === draftRevision.current) setDraftState("error");
        });
    }, 600);
    return () => window.clearTimeout(timer);
  }, [draftDirty, fields, saveDraftSequentially, submitted, submitting]);

  // Vista previa del diagnóstico: solo se pide cuando el usuario lo marca.
  useEffect(() => {
    if (!includeDiagnostic) return;
    let active = true;
    client
      .prepareDiagnostic({ module: fields.module, includeLogs: false })
      .then((prepared) => {
        if (!active) return;
        if (prepared.environment.channel !== channel) {
          setDiagnostic(null);
          setDiagnosticState("error");
          return;
        }
        setDiagnostic(prepared);
        setDiagnosticState("idle");
      })
      .catch(() => {
        if (active) setDiagnosticState("error");
      });
    return () => {
      active = false;
    };
  }, [channel, client, fields.module, includeDiagnostic]);

  const changeField = useCallback(
    (field: keyof ReportDraftFields, value: string) => {
      draftRevision.current += 1;
      setDraftDirty(true);
      setDraftState("idle");
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
        setFieldErrors((current) => ({ ...current, [field]: nextError }));
      }
    },
    [fieldErrors, fields, includeDiagnostic],
  );

  const changeDiagnosticConsent = useCallback((enabled: boolean) => {
    setIncludeDiagnostic(enabled);
    setDiagnostic(null);
    setDiagnosticState(enabled ? "loading" : "idle");
  }, []);

  const resetLocalState = useCallback(() => {
    draftRevision.current += 1;
    setDraftDirty(false);
    setFields(EMPTY_FIELDS);
    setFieldErrors({});
    setIdempotencyKey("");
    setIncludeDiagnostic(false);
    setDiagnostic(null);
    setDiagnosticState("idle");
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

  const onSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      const errors = validateReportFields(fields);
      setFieldErrors(errors);
      if (hasReportFieldErrors(errors) || !online || submitted) return;
      if (includeDiagnostic && !diagnostic) {
        setSubmitError(t("testing.preview.error"));
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
          includeLogs: false,
          diagnostic,
          idempotencyKey: saved.idempotencyKey,
        });
        try {
          // Un debounce que saltó durante el RPC tiene que terminar antes de
          // borrar, o volvería a escribir el borrador justo después.
          await saveChain.current.catch(() => undefined);
          await client.discardDraft();
          resetLocalState();
        } catch {
          setDiscardWarning(true);
        }
        setSubmitted(result);
        setSent((current) => [result, ...current]);
      } catch (error) {
        const code = error instanceof TestingCenterClientError ? error.code : "submission_failed";
        setSubmitError(userMessage(code, t));
      } finally {
        setSubmitting(false);
      }
    },
    [
      channel,
      client,
      diagnostic,
      fields,
      includeDiagnostic,
      online,
      resetLocalState,
      saveDraftSequentially,
      submitReport,
      submitted,
      t,
      version,
    ],
  );

  const moduleOptions = useMemo(
    () =>
      TESTING_CENTER_MODULES.map((module) => ({
        value: module,
        label: module === "unknown" ? t("testing.module.unknown") : MODULE_LABELS[module],
      })),
    [t],
  );

  const status = useMemo(() => {
    if (draftState === "saving") return { tone: "neutral" as const, text: t("testing.draft.saving") };
    if (draftState === "error") return { tone: "attn" as const, text: t("testing.draft.error") };
    if (draftState === "saved") return { tone: "ok" as const, text: t("testing.draft.saved") };
    return { tone: "ok" as const, text: t("testing.draft.local") };
  }, [draftState, t]);

  return (
    <div className="orbit-tc" data-testid="orbit-testing">
      <header className="orbit-tc__head">
        <div className="orbit-tc__head-copy">
          <span className="orbit-eyebrow" data-testid="orbit-testing-channel">
            {t(`testing.channel.${channel}`)}
          </span>
          <h2>{t("testing.title")}</h2>
          <p>{t("testing.lead")}</p>
        </div>
        <span data-testid="orbit-testing-status">
          <SubtleStatus tone={status.tone}>{status.text}</SubtleStatus>
        </span>
      </header>

      <UnderlineTabs<TestingTab>
        className="orbit-tc__tabs"
        label={t("testing.tabs.label")}
        onChange={setTab}
        tabs={[
          { id: "report", label: t("testing.tabs.report") },
          { id: "validate", label: t("testing.tabs.validate") },
          { id: "mine", label: t("testing.tabs.mine") },
        ]}
        value={tab}
      />

      {tab === "validate" ? (
        <div className="orbit-tc__pane">
          <ValidateOrbitPanel channel={channel} client={feedbackClient} />
        </div>
      ) : tab === "mine" ? (
        <div className="orbit-tc__pane" data-testid="orbit-testing-mine">
          <Surface
            aria-label={t("testing.mine.title")}
            meta={t("testing.mine.meta")}
            title={t("testing.mine.title")}
          >
            {/* El servicio no expone historial: lo honesto es decirlo. */}
            <Note className="orbit-tc__note" title={t("testing.mine.emptyTitle")}>
              {t("testing.mine.empty")}
            </Note>
            {sent.length > 0 ? (
              <div className="orbit-tc__mine" data-testid="orbit-testing-mine-list">
                {sent.map((report) => (
                  <p className="orbit-tc__sent" key={report.reportId}>
                    <b>{t("testing.success.title")}</b>
                    <span>{report.reportState}</span>
                    <code>{report.reportId}</code>
                  </p>
                ))}
              </div>
            ) : null}
          </Surface>
        </div>
      ) : (
      <div className="orbit-tc__layout">
        <Surface aria-label={t("testing.form.title")} className="orbit-tc__form">
          <form id={FORM_ID} className="orbit-tc__fields" noValidate onSubmit={onSubmit}>
            <Field
              className="orbit-tc__field orbit-tc__field--wide"
              htmlFor="orbit-tc-module"
              label={t("testing.field.module")}
            >
              <Select
                className="orbit-tc__select"
                disabled={submitting}
                id="orbit-tc-module"
                label={t("testing.field.module")}
                onChange={(value) => changeField("module", value)}
                options={moduleOptions}
                value={fields.module}
              />
            </Field>

            <ReportField
              error={fieldErrors.actionText}
              id="orbit-tc-action"
              label={t("testing.field.didWhat")}
              disabled={submitting}
              onChange={(value) => changeField("actionText", value)}
              t={t}
              value={fields.actionText}
            />
            <ReportField
              error={fieldErrors.expectedText}
              id="orbit-tc-expected"
              label={t("testing.field.expected")}
              disabled={submitting}
              onChange={(value) => changeField("expectedText", value)}
              t={t}
              value={fields.expectedText}
            />
            <ReportField
              error={fieldErrors.observedText}
              id="orbit-tc-observed"
              label={t("testing.field.observed")}
              disabled={submitting}
              onChange={(value) => changeField("observedText", value)}
              t={t}
              value={fields.observedText}
              wide
            />
            <ReportField
              error={fieldErrors.contextText}
              id="orbit-tc-context"
              label={t("testing.field.context")}
              disabled={submitting}
              onChange={(value) => changeField("contextText", value)}
              t={t}
              value={fields.contextText}
              wide
            />
          </form>
        </Surface>

        <Surface
          aria-label={t("testing.consent.eyebrow")}
          as="aside"
          className="orbit-tc__consent"
        >
          <span className="orbit-eyebrow">{t("testing.consent.eyebrow")}</span>
          <h3 className="orbit-tc__consent-title">{t("testing.consent.title")}</h3>
          <p className="orbit-tc__consent-lead">{t("testing.consent.lead")}</p>

          <Check
            checked={includeDiagnostic}
            className="orbit-tc__consent-row"
            data-testid="orbit-testing-consent-diagnostic"
            disabled={submitting}
            label={t("testing.consent.diagnostic")}
            onChange={changeDiagnosticConsent}
          >
            <b>{t("testing.consent.diagnostic")}</b>
            <span>{t("testing.consent.diagnosticHelp")}</span>
          </Check>
          <Check
            checked={false}
            className="orbit-tc__consent-row"
            disabled
            label={t("testing.consent.replay")}
          >
            <b>{t("testing.consent.replay")}</b>
            <span>{t("testing.consent.replayUnavailable")}</span>
          </Check>
          <Check
            checked={false}
            className="orbit-tc__consent-row"
            disabled
            label={t("testing.consent.logs")}
          >
            <b>{t("testing.consent.logs")}</b>
            <span>{t("testing.consent.logsUnavailable")}</span>
          </Check>

          {includeDiagnostic ? (
            <p className="orbit-tc__preview" data-testid="orbit-testing-preview">
              {diagnosticState === "error"
                ? t("testing.preview.error")
                : diagnostic
                  ? formatMessage(t("testing.preview.ready"), {
                      bytes: diagnostic.preview.byteSize,
                      digest: diagnostic.preview.sha256.slice(0, 12),
                    })
                  : t("testing.preview.loading")}
            </p>
          ) : null}

          {!online ? <Note className="orbit-tc__note">{t("testing.offline")}</Note> : null}
          {submitError ? (
            <span data-testid="orbit-testing-error">
              <Note className="orbit-tc__note">{submitError}</Note>
            </span>
          ) : null}
          {discardWarning ? (
            <Note className="orbit-tc__note">{t("testing.discard.warning")}</Note>
          ) : null}
          {submitted ? (
            <p className="orbit-tc__sent" data-testid="orbit-testing-sent">
              <b>{t("testing.success.title")}</b>
              <span>{t("testing.success.description")}</span>
              <code>{submitted.reportId}</code>
            </p>
          ) : null}

          <div className="orbit-tc__actions">
            <Button
              className="orbit-tc__send"
              data-testid="orbit-testing-send"
              disabled={!online || submitting || draftState === "loading" || Boolean(submitted)}
              form={FORM_ID}
              type="submit"
              variant="primary"
            >
              {submitting ? t("testing.sending") : t("testing.send")}
            </Button>
            <Button
              className="orbit-tc__discard"
              data-testid="orbit-testing-discard"
              disabled={submitting}
              onClick={discardDraft}
              variant="ghost"
            >
              {t("testing.discard")}
            </Button>
          </div>
          {idempotencyKey && !submitted ? (
            <p className="orbit-tc__retry">{t("testing.retry.safe")}</p>
          ) : null}
        </Surface>

        {/* Vista previa del diagnóstico: los bytes exactos que se enviarán,
            plegados para no empujar el formulario (briefing 12 ampliado). */}
        {includeDiagnostic ? (
          <Surface
            aria-label={t("testing.preview.title")}
            className="orbit-tc__preview-card"
            data-testid="orbit-testing-preview-card"
          >
            <Accordion
              summary={
                diagnostic ? `${diagnostic.preview.byteSize} B · ${diagnostic.preview.sha256.slice(0, 12)}` : undefined
              }
              title={t("testing.preview.title")}
            >
              <p className="orbit-tc__preview">{t("testing.preview.description")}</p>
              {diagnosticState === "error" ? (
                <Note className="orbit-tc__note">{t("testing.preview.error")}</Note>
              ) : diagnostic ? (
                <>
                  <dl className="orbit-tc__preview-facts">
                    <dt>SHA-256</dt>
                    <dd>{diagnostic.preview.sha256}</dd>
                    <dt>Bytes</dt>
                    <dd>{diagnostic.preview.byteSize}</dd>
                    <dt>Logs</dt>
                    <dd>{diagnostic.environment.availableLogCount}</dd>
                  </dl>
                  <pre
                    className="orbit-tc__preview-payload"
                    data-testid="orbit-testing-preview-payload"
                  >
                    {diagnostic.preview.payload}
                  </pre>
                </>
              ) : (
                <p className="orbit-tc__preview">{t("testing.preview.loading")}</p>
              )}
            </Accordion>
          </Surface>
        ) : null}
      </div>
      )}
    </div>
  );
}

function ReportField({
  id,
  label,
  value,
  error,
  disabled,
  wide,
  onChange,
  t,
}: {
  id: string;
  label: string;
  value: string;
  error?: string;
  disabled?: boolean;
  wide?: boolean;
  onChange(value: string): void;
  t(key: string): string;
}) {
  const errorId = `${id}-error`;
  return (
    <Field
      className={wide ? "orbit-tc__field orbit-tc__field--wide" : "orbit-tc__field"}
      htmlFor={id}
      label={label}
    >
      <Textarea
        aria-describedby={error ? errorId : undefined}
        aria-invalid={error ? true : undefined}
        disabled={disabled}
        id={id}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        value={value}
      />
      {error ? (
        <span className="orbit-tc__error" id={errorId} role="alert">
          {t(`testing.validation.${error}`)}
        </span>
      ) : null}
    </Field>
  );
}
