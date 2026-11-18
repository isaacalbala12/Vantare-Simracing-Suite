import { type Ref, useId } from "react";
import { residentText } from "../../i18n/launcher-resident";
import { residentReviewText as t } from "../../i18n/launcher-review";
import type { ResidentAnswerController } from "../../screens/launcher/resident-answer";
import type { ResidentReviewPanel } from "../../screens/launcher/resident-review";
import { Button } from "../Button";
import { WindowDialog as Dialog } from "../WindowDialog";

export function ResidentReview({
  review,
  answer,
  button,
  status,
}: {
  review: ResidentReviewPanel;
  answer?: ResidentAnswerController;
  button: Ref<HTMLButtonElement>;
  status?: string;
}) {
  const reason = useId();
  const busyNote = useId();
  const cancelNote = useId();
  const { state, profile, scope } = review;
  const ended =
    state === "trusted" || state === "declined" || state === "unconfirmed";
  const busy = state === "reviewing";
  const unavailable = state === "unavailable";
  const disabled = unavailable || (!busy && !review.open);
  const retry = state === "changed" || state === "expired";
  const notice = state === "question" ? undefined : t.states[state];
  const canCancel = !!scope && answer?.available("cancel");
  return (
    <>
      <Dialog.Description>{t.description}</Dialog.Description>
      <section aria-label={t.profileLabel} className="v-resident-review-card">
        <span className="v-resident-review-chip">{t.chip}</span>
        {profile && (
          <>
            <strong>{profile.name}</strong>
            <span>{t.meta(profile.apps)}</span>
          </>
        )}
      </section>
      {!ended && <p className="v-resident-review-note">{t.names}</p>}
      {notice && (
        <div
          className={`v-resident-review-notice v-callout v-callout--${notice.tone}`}
        >
          <strong>{notice.title}</strong>
          <div id={busy ? busyNote : undefined}>{notice.text}</div>
        </div>
      )}
      {!ended && (
        <>
          {state !== "too-long" && (
            <Button
              ref={button}
              variant="primary"
              className="v-resident-review-button"
              aria-haspopup="dialog"
              busy={busy}
              focusableWhenDisabled
              aria-disabled={disabled || busy}
              aria-describedby={disabled ? reason : busy ? busyNote : undefined}
              onClick={() => void review.open?.()}
            >
              {retry ? t.reviewAgain : t.review}
            </Button>
          )}
          {disabled && state !== "too-long" && (
            <p
              id={reason}
              className="v-resident-review-note v-resident-review-reason"
            >
              {unavailable
                ? t.unavailableReason
                : residentText.answerUnavailable}
            </p>
          )}
          {state === "too-long" && (
            <p className="v-resident-review-note">{t.tooLongWayOut}</p>
          )}
          <Button
            focusableWhenDisabled
            aria-disabled={busy || !canCancel}
            aria-describedby={
              busy ? busyNote : canCancel ? undefined : cancelNote
            }
            onClick={() => {
              if (scope && canCancel) void answer?.answer("cancel", scope);
            }}
          >
            {t.cancel}
          </Button>
          {!busy && !canCancel && (
            <p id={cancelNote} className="v-resident-review-note">
              {residentText.answerUnavailable}
            </p>
          )}
          {status && <p className="v-resident-review-note">{status}</p>}
          <p className="v-resident-review-note">{t.help}</p>
        </>
      )}
    </>
  );
}
