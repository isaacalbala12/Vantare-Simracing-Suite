import { useCallback, useEffect, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import type {
  CandidateDecision,
  CandidateFeedbackResult,
  CandidateReview,
  RejectionCategory,
  RejectionDetails,
  RejectionFrequency,
} from "./candidate-feedback-contracts";
import type { TestingCenterFeedbackClient } from "./candidate-feedback-client";
import type { TestingCenterChannel } from "./contracts";

type CandidateFeedbackPanelProps = {
  channel: TestingCenterChannel;
  client: TestingCenterFeedbackClient;
};

const EMPTY_REJECTION: RejectionDetails = {
  category: "issue_persists",
  description: "",
  steps: "",
  expected: "",
  observed: "",
  frequency: "always",
  blocking: true,
  diagnosticsConsent: false,
  logsConsent: false,
};

function validRejection(details: RejectionDetails): boolean {
  return [details.description, details.steps, details.expected, details.observed]
    .every((value) => {
      const bytes = new TextEncoder().encode(value.trim()).length;
      return bytes >= 3 && bytes <= 2048;
    });
}

function shortId(value: string): string {
  return value.slice(-8);
}

export function CandidateFeedbackPanel({
  channel,
  client,
}: CandidateFeedbackPanelProps) {
  const { t } = useI18n();
  const [candidates, setCandidates] = useState<CandidateReview[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [active, setActive] = useState<CandidateReview | null>(null);
  const [rejection, setRejection] = useState<RejectionDetails>(EMPTY_REJECTION);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<"incomplete" | "submit" | null>(null);
  const [result, setResult] = useState<CandidateFeedbackResult | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    try {
      setCandidates(await client.listCandidates(channel));
      setState("ready");
    } catch {
      setState("error");
    }
  }, [channel, client]);

  useEffect(() => {
    let mounted = true;
    client.listCandidates(channel).then((items) => {
      if (!mounted) return;
      setCandidates(items);
      setState("ready");
    }).catch(() => {
      if (mounted) setState("error");
    });
    return () => {
      mounted = false;
    };
  }, [channel, client]);

  const submit = useCallback(async (
    candidate: CandidateReview,
    decision: CandidateDecision,
    details?: RejectionDetails,
  ) => {
    if (!candidate.canValidate || submitting) return;
    if (decision === "rejected" && (!details || !validRejection(details))) {
      setFormError("incomplete");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const next = await client.submitFeedback({
        candidateId: candidate.candidateId,
        candidateSha: candidate.candidateSha,
        decision,
        ...(details ? { details } : {}),
      });
      setResult(next);
      setActive(null);
      setRejection(EMPTY_REJECTION);
      setCandidates((current) =>
        current.filter((item) => item.candidateId !== candidate.candidateId)
      );
    } catch {
      setFormError("submit");
    } finally {
      setSubmitting(false);
    }
  }, [client, submitting]);

  return (
    <section data-testid="testing-center-feedback" className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">
            {t("testingCenter.feedback.title")}
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-vantare-textMuted">
            {t("testingCenter.feedback.description")}
          </p>
        </div>
        <button
          type="button"
          className="btn-secondary min-h-11 shrink-0 px-4 text-sm"
          onClick={() => void load()}
          disabled={state === "loading" || submitting}
        >
          {t("testingCenter.feedback.refresh")}
        </button>
      </div>

      {result && (
        <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-4" role="status">
          <p className="font-semibold text-green-200">
            {t(`testingCenter.feedback.result.${result.decision}`)}
          </p>
          <p className="mt-1 text-sm text-green-100">
            {result.decision === "rejected"
              ? t("testingCenter.feedback.result.correction")
              : t("testingCenter.feedback.result.saved")}
          </p>
        </div>
      )}

      {state === "loading" && (
        <p className="rounded-xl border border-white/10 bg-white/[0.03] p-5 text-sm text-vantare-textMuted" role="status">
          {t("testingCenter.feedback.loading")}
        </p>
      )}
      {state === "error" && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-5 text-sm text-amber-200" role="alert">
          {t("testingCenter.feedback.unavailable")}
        </p>
      )}
      {state === "ready" && candidates.length === 0 && (
        <p className="rounded-xl border border-white/10 bg-white/[0.03] p-5 text-sm text-vantare-textMuted" role="status">
          {t("testingCenter.feedback.empty")}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {candidates.map((candidate) => (
          <article
            key={`${candidate.candidateId}:${candidate.candidateSha}`}
            className="flex min-w-0 flex-col rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:p-5"
          >
            <div className="flex flex-wrap items-center gap-2 text-xs text-vantare-textMuted">
              <span className="rounded border border-white/10 bg-black/20 px-2 py-1 font-mono uppercase">
                {candidate.channel}
              </span>
              <span>{candidate.appVersion}</span>
              <span className="font-mono">{candidate.candidateSha.slice(0, 8)}</span>
            </div>
            <h3 className="mt-3 text-base font-semibold text-white">
              {candidate.module} · {shortId(candidate.issueId)}
            </h3>
            <p className="mt-2 break-words text-sm leading-relaxed text-vantare-textMuted">
              {candidate.summary}
            </p>
            <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-3">
              <h4 className="text-sm font-semibold text-white">
                {t("testingCenter.feedback.criteria")}
              </h4>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-vantare-textMuted">
                {candidate.criteria.map((criterion) => <li key={criterion}>{criterion}</li>)}
              </ul>
            </div>
            {candidate.knownFailure && (
              <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                <h4 className="text-sm font-semibold text-amber-100">
                  {t("testingCenter.feedback.knownFailure")}
                </h4>
                <p className="mt-1 break-words text-sm leading-relaxed text-vantare-textMuted">
                  {candidate.knownFailure}
                </p>
              </div>
            )}
            {!candidate.canValidate && (
              <p className="mt-4 text-sm text-amber-300" role="status">
                {t("testingCenter.feedback.notAllowed")}
              </p>
            )}
            <div className="mt-auto grid grid-cols-1 gap-2 pt-4 sm:grid-cols-3">
              <button
                type="button"
                className="btn-primary min-h-11 px-3 text-sm"
                disabled={!candidate.canValidate || submitting}
                onClick={() => void submit(candidate, "accepted")}
              >
                {t("testingCenter.feedback.accept")}
              </button>
              <button
                type="button"
                className="btn-secondary min-h-11 px-3 text-sm"
                disabled={!candidate.canValidate || submitting}
                onClick={() => {
                  setActive(candidate);
                  setResult(null);
                  setFormError(null);
                }}
              >
                {t("testingCenter.feedback.reject")}
              </button>
              <button
                type="button"
                className="btn-secondary min-h-11 px-3 text-sm"
                disabled={!candidate.canValidate || submitting}
                onClick={() => void submit(candidate, "cannot_verify")}
              >
                {t("testingCenter.feedback.cannotVerify")}
              </button>
            </div>
          </article>
        ))}
      </div>

      {active && (
        <RejectionForm
          details={rejection}
          disabled={submitting}
          error={formError}
          onChange={setRejection}
          onCancel={() => {
            setActive(null);
            setFormError(null);
          }}
          onSubmit={() => void submit(active, "rejected", rejection)}
        />
      )}
    </section>
  );
}

function RejectionForm({
  details,
  disabled,
  error,
  onChange,
  onCancel,
  onSubmit,
}: {
  details: RejectionDetails;
  disabled: boolean;
  error: "incomplete" | "submit" | null;
  onChange: (details: RejectionDetails) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const { t } = useI18n();
  const update = <K extends keyof RejectionDetails>(
    key: K,
    value: RejectionDetails[K],
  ) => onChange({ ...details, [key]: value });
  return (
    <form
      className="rounded-xl border border-vantare-red-500/30 bg-white/[0.03] p-4 sm:p-6"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      noValidate
    >
      <h3 className="text-lg font-semibold text-white">
        {t("testingCenter.rejection.title")}
      </h3>
      <p className="mt-1 text-sm text-vantare-textMuted">
        {t("testingCenter.rejection.help")}
      </p>
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <SelectField
          id="tc-rejection-category"
          label={t("testingCenter.rejection.category")}
          value={details.category}
          options={CATEGORIES}
          onChange={(value) => update("category", value as RejectionCategory)}
          t={t}
          disabled={disabled}
        />
        <SelectField
          id="tc-rejection-frequency"
          label={t("testingCenter.rejection.frequency")}
          value={details.frequency}
          options={FREQUENCIES}
          onChange={(value) => update("frequency", value as RejectionFrequency)}
          t={t}
          disabled={disabled}
        />
        {(["description", "steps", "expected", "observed"] as const).map((field) => (
          <label key={field} className="flex flex-col gap-2 text-sm font-medium text-white" htmlFor={`tc-rejection-${field}`}>
            {t(`testingCenter.rejection.${field}`)}
            <textarea
              id={`tc-rejection-${field}`}
              rows={3}
              value={details[field]}
              disabled={disabled}
              onChange={(event) => update(field, event.target.value)}
              className="min-h-24 resize-y rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-base leading-relaxed text-white outline-none focus:border-vantare-red-500"
            />
          </label>
        ))}
      </div>
      <fieldset className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <legend className="sr-only">{t("testingCenter.rejection.options")}</legend>
        <CheckField
          checked={details.blocking}
          disabled={disabled}
          label={t("testingCenter.rejection.blocking")}
          onChange={(value) => update("blocking", value)}
        />
        <CheckField
          checked={details.diagnosticsConsent}
          disabled={disabled}
          label={t("testingCenter.rejection.diagnostics")}
          onChange={(value) => update("diagnosticsConsent", value)}
        />
        <CheckField
          checked={false}
          disabled
          label={t("testingCenter.rejection.logsUnavailable")}
          onChange={() => undefined}
        />
      </fieldset>
      {error && (
        <p className="mt-4 text-sm text-red-300" role="alert">
          {t(error === "incomplete"
            ? "testingCenter.rejection.incomplete"
            : "testingCenter.rejection.submitError")}
        </p>
      )}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
        <button type="button" className="btn-secondary min-h-11 px-5 text-sm" disabled={disabled} onClick={onCancel}>
          {t("testingCenter.rejection.cancel")}
        </button>
        <button type="submit" className="btn-primary min-h-11 px-5 text-sm" disabled={disabled}>
          {disabled ? t("testingCenter.rejection.sending") : t("testingCenter.rejection.submit")}
        </button>
      </div>
    </form>
  );
}

const CATEGORIES: RejectionCategory[] = [
  "issue_persists",
  "new_regression",
  "crash",
  "different_behavior",
  "other",
];
const FREQUENCIES: RejectionFrequency[] = ["always", "frequent", "once"];

function SelectField({ id, label, value, options, onChange, t, disabled }: {
  id: string;
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  t: (key: string) => string;
  disabled: boolean;
}) {
  return (
    <label className="flex flex-col gap-2 text-sm font-medium text-white" htmlFor={id}>
      {label}
      <select id={id} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="min-h-11 rounded-lg border border-white/10 bg-[#111] px-3 text-base text-white">
        {options.map((option) => <option key={option} value={option}>{t(`testingCenter.rejection.value.${option}`)}</option>)}
      </select>
    </label>
  );
}

function CheckField({ checked, disabled, label, onChange }: {
  checked: boolean;
  disabled: boolean;
  label: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className={`flex min-h-11 items-start gap-3 text-sm ${disabled ? "cursor-not-allowed text-vantare-textMuted" : "cursor-pointer text-white"}`}>
      <input type="checkbox" className="mt-1 h-5 w-5" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      <span className="leading-relaxed">{label}</span>
    </label>
  );
}
