import { useCallback, useEffect, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import {
  Button,
  Check,
  Chip,
  Field,
  Note,
  Select,
  StateChip,
  Surface,
  Textarea,
} from "../../ui/orbit";
import type {
  CandidateDecision,
  CandidateFeedbackResult,
  CandidateReview,
  RejectionCategory,
  RejectionDetails,
  RejectionFrequency,
} from "../testing-center/candidate-feedback-contracts";
import type { TestingCenterFeedbackClient } from "../testing-center/candidate-feedback-client";
import type { TestingCenterChannel } from "../testing-center/contracts";

/**
 * Pestaña **Validar** del Testing Center de Orbit (briefing 12, ampliación
 * D-R3-E-3).
 *
 * Es el porte del `CandidateFeedbackPanel` de la pantalla v5.2: mismo cliente
 * (`testing-center-feedback`), mismo contrato de rechazo y misma regla de
 * validez de 3–2048 bytes por campo. Aquí solo cambia la piel: el kit Orbit en
 * lugar de las utilidades de Tailwind.
 */

const CATEGORIES: RejectionCategory[] = [
  "issue_persists",
  "new_regression",
  "crash",
  "different_behavior",
  "other",
];
const FREQUENCIES: RejectionFrequency[] = ["always", "frequent", "once"];
const REJECTION_TEXTS = ["description", "steps", "expected", "observed"] as const;

function emptyRejection(): RejectionDetails {
  return {
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
}

/** Misma regla que la pantalla v5.2: 3–2048 bytes UTF-8 en los cuatro textos. */
function validRejection(details: RejectionDetails): boolean {
  return REJECTION_TEXTS.every((field) => {
    const bytes = new TextEncoder().encode(details[field].trim()).length;
    return bytes >= 3 && bytes <= 2048;
  });
}

function shortId(value: string): string {
  return value.slice(-8);
}

export interface ValidateOrbitPanelProps {
  channel: TestingCenterChannel;
  client: TestingCenterFeedbackClient;
}

export function ValidateOrbitPanel({ channel, client }: ValidateOrbitPanelProps) {
  const { t } = useI18n();
  const [candidates, setCandidates] = useState<CandidateReview[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [active, setActive] = useState<CandidateReview | null>(null);
  const [rejection, setRejection] = useState<RejectionDetails>(emptyRejection);
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
    client
      .listCandidates(channel)
      .then((items) => {
        if (!mounted) return;
        setCandidates(items);
        setState("ready");
      })
      .catch(() => {
        if (mounted) setState("error");
      });
    return () => {
      mounted = false;
    };
  }, [channel, client]);

  const submit = useCallback(
    async (
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
        setRejection(emptyRejection());
        setCandidates((current) =>
          current.filter((item) => item.candidateId !== candidate.candidateId),
        );
      } catch {
        setFormError("submit");
      } finally {
        setSubmitting(false);
      }
    },
    [client, submitting],
  );

  return (
    <div className="orbit-tc__validate" data-testid="orbit-testing-validate">
      <Surface
        actions={
          <Button
            data-testid="orbit-testing-validate-refresh"
            disabled={state === "loading" || submitting}
            onClick={() => void load()}
            size="sm"
            variant="ghost"
          >
            {t("testing.validate.refresh")}
          </Button>
        }
        aria-label={t("testing.validate.title")}
        meta={t("testing.validate.meta")}
        title={t("testing.validate.title")}
      >
        <p className="orbit-tc__validate-lead">{t("testing.validate.lead")}</p>

        {result ? (
          <p className="orbit-tc__sent" data-testid="orbit-testing-validate-result" role="status">
            <b>{t(`testing.validate.result.${result.decision}`)}</b>
            <span>
              {result.decision === "rejected"
                ? t("testing.validate.result.correction")
                : t("testing.validate.result.saved")}
            </span>
            <code>{result.validationId}</code>
          </p>
        ) : null}

        {state === "loading" ? (
          <p className="orbit-tc__validate-state" role="status">
            {t("testing.validate.loading")}
          </p>
        ) : null}
        {state === "error" ? (
          <span data-testid="orbit-testing-validate-error">
            <Note className="orbit-tc__note">{t("testing.validate.unavailable")}</Note>
          </span>
        ) : null}
        {state === "ready" && candidates.length === 0 ? (
          <Note className="orbit-tc__note" title={t("testing.validate.emptyTitle")}>
            {t("testing.validate.empty")}
          </Note>
        ) : null}

        <div className="orbit-tc__candidates">
          {candidates.map((candidate) => (
            <article
              className="orbit-tc__candidate"
              data-testid={`orbit-testing-candidate-${candidate.candidateId}`}
              key={`${candidate.candidateId}:${candidate.candidateSha}`}
            >
              <div className="orbit-tc__candidate-meta">
                <Chip>{candidate.channel}</Chip>
                <Chip caseNormal>{candidate.appVersion}</Chip>
                <code>{candidate.candidateSha.slice(0, 8)}</code>
                <StateChip state={candidate.state === "accepted" ? "ok" : "draft"}>
                  {t(`testing.validate.state.${candidate.state}`)}
                </StateChip>
              </div>
              <h4>
                {candidate.module} · {shortId(candidate.issueId)}
              </h4>
              <p className="orbit-tc__candidate-summary">{candidate.summary}</p>

              <h5>{t("testing.validate.criteria")}</h5>
              <ul className="orbit-tc__candidate-criteria">
                {candidate.criteria.map((criterion) => (
                  <li key={criterion}>{criterion}</li>
                ))}
              </ul>

              {candidate.knownFailure ? (
                <Note className="orbit-tc__note" title={t("testing.validate.knownFailure")}>
                  {candidate.knownFailure}
                </Note>
              ) : null}
              {!candidate.canValidate ? (
                <Note className="orbit-tc__note">{t("testing.validate.notAllowed")}</Note>
              ) : null}

              <div className="orbit-tc__candidate-acts">
                <Button
                  data-testid={`orbit-testing-accept-${candidate.candidateId}`}
                  disabled={!candidate.canValidate || submitting}
                  onClick={() => void submit(candidate, "accepted")}
                  size="sm"
                  variant="primary"
                >
                  {t("testing.validate.accept")}
                </Button>
                <Button
                  data-testid={`orbit-testing-reject-${candidate.candidateId}`}
                  disabled={!candidate.canValidate || submitting}
                  onClick={() => {
                    if (
                      active?.candidateId !== candidate.candidateId ||
                      active.candidateSha !== candidate.candidateSha
                    ) {
                      setRejection(emptyRejection());
                    }
                    setActive(candidate);
                    setResult(null);
                    setFormError(null);
                  }}
                  size="sm"
                  variant="ghost"
                >
                  {t("testing.validate.reject")}
                </Button>
                <Button
                  data-testid={`orbit-testing-cannot-${candidate.candidateId}`}
                  disabled={!candidate.canValidate || submitting}
                  onClick={() => void submit(candidate, "cannot_verify")}
                  size="sm"
                  variant="ghost"
                >
                  {t("testing.validate.cannotVerify")}
                </Button>
              </div>
            </article>
          ))}
        </div>
      </Surface>

      {active ? (
        <RejectionForm
          details={rejection}
          disabled={submitting}
          error={formError}
          onCancel={() => {
            setActive(null);
            setRejection(emptyRejection());
            setFormError(null);
          }}
          onChange={setRejection}
          onSubmit={() => void submit(active, "rejected", rejection)}
        />
      ) : null}
    </div>
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
  onChange(details: RejectionDetails): void;
  onCancel(): void;
  onSubmit(): void;
}) {
  const { t } = useI18n();
  const update = <K extends keyof RejectionDetails>(key: K, value: RejectionDetails[K]) =>
    onChange({ ...details, [key]: value });

  return (
    <Surface
      aria-label={t("testing.reject.title")}
      data-testid="orbit-testing-rejection"
      meta={t("testing.reject.help")}
      title={t("testing.reject.title")}
    >
      <form
        className="orbit-tc__reject"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <div className="orbit-tc__reject-grid">
          <Field htmlFor="orbit-tc-reject-category" label={t("testing.reject.category")}>
            <Select<RejectionCategory>
              disabled={disabled}
              id="orbit-tc-reject-category"
              label={t("testing.reject.category")}
              onChange={(value) => update("category", value)}
              options={CATEGORIES.map((value) => ({
                value,
                label: t(`testing.reject.value.${value}`),
              }))}
              value={details.category}
            />
          </Field>
          <Field htmlFor="orbit-tc-reject-frequency" label={t("testing.reject.frequency")}>
            <Select<RejectionFrequency>
              disabled={disabled}
              id="orbit-tc-reject-frequency"
              label={t("testing.reject.frequency")}
              onChange={(value) => update("frequency", value)}
              options={FREQUENCIES.map((value) => ({
                value,
                label: t(`testing.reject.value.${value}`),
              }))}
              value={details.frequency}
            />
          </Field>
          {REJECTION_TEXTS.map((field) => (
            <Field
              className="orbit-tc__field--wide"
              htmlFor={`orbit-tc-reject-${field}`}
              key={field}
              label={t(`testing.reject.${field}`)}
            >
              <Textarea
                disabled={disabled}
                id={`orbit-tc-reject-${field}`}
                onChange={(event) => update(field, event.target.value)}
                rows={3}
                value={details[field]}
              />
            </Field>
          ))}
        </div>

        <fieldset className="orbit-tc__reject-opts">
          <legend>{t("testing.reject.options")}</legend>
          <Check
            checked={details.blocking}
            className="orbit-tc__consent-row"
            disabled={disabled}
            label={t("testing.reject.blocking")}
            onChange={(value) => update("blocking", value)}
          >
            <b>{t("testing.reject.blocking")}</b>
          </Check>
          <Check
            checked={details.diagnosticsConsent}
            className="orbit-tc__consent-row"
            data-testid="orbit-testing-reject-diagnostics"
            disabled={disabled}
            label={t("testing.reject.diagnostics")}
            onChange={(value) => update("diagnosticsConsent", value)}
          >
            <b>{t("testing.reject.diagnostics")}</b>
          </Check>
          <Check
            checked={false}
            className="orbit-tc__consent-row"
            disabled
            label={t("testing.reject.logsUnavailable")}
          >
            <b>{t("testing.reject.logsUnavailable")}</b>
          </Check>
        </fieldset>

        {error ? (
          <span data-testid="orbit-testing-reject-error">
            <Note className="orbit-tc__note">
              {t(error === "incomplete" ? "testing.reject.incomplete" : "testing.reject.submitError")}
            </Note>
          </span>
        ) : null}

        <div className="orbit-tc__reject-acts">
          <Button disabled={disabled} onClick={onCancel} type="button" variant="ghost">
            {t("testing.reject.cancel")}
          </Button>
          <Button
            data-testid="orbit-testing-reject-submit"
            disabled={disabled}
            type="submit"
            variant="primary"
          >
            {disabled ? t("testing.reject.sending") : t("testing.reject.submit")}
          </Button>
        </div>
      </form>
    </Surface>
  );
}
