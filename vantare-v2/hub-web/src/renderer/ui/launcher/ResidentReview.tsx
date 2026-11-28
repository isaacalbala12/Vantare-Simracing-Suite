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
  const ended = state === "trusted" || state === "declined";
  const unconfirmed = state === "unconfirmed";
  const busy = state === "reviewing";
  const unavailable = state === "unavailable";
  // Bloqueada a propósito (issue 2881): como «too-long», no se ofrece revisar.
  const blocked =
    state === "blocked-lookalike" || state === "blocked-unusual-path";
  const noReview = state === "too-long" || blocked;
  const disabled = unavailable || (!busy && !review.open);
  const retry = state === "changed" || state === "expired";
  const notice = state === "question" ? undefined : t.states[state];
  const noticeClass =
    notice && `v-resident-review-notice v-callout v-callout--${notice.tone}`;
  const canCancel = !!scope && answer?.available("cancel");
  const showCancel = !unconfirmed || review.cancelOffered;
  return (
    <>
      {!unconfirmed && !blocked && (
        <Dialog.Description>{t.description}</Dialog.Description>
      )}
      <section aria-label={t.profileLabel} className="v-resident-review-card">
        <span className="v-resident-review-chip">{t.chip}</span>
        {profile && (
          <>
            <strong>{profile.name}</strong>
            <span>{t.meta(profile.apps)}</span>
          </>
        )}
      </section>
      {!ended && !unconfirmed && !blocked && (
        <p className="v-resident-review-note">{t.names}</p>
      )}
      {notice && blocked && (
        // El título y el motivo son la descripción del panel. Sin role="alert":
        // la única zona viva de ResidentInbox ya lo anuncia con cortesía.
        <Dialog.Description render={<div />} className={noticeClass}>
          <strong>{notice.title}</strong>
          <div>{notice.text}</div>
        </Dialog.Description>
      )}
      {notice && !blocked && (
        <div className={noticeClass}>
          <strong>{notice.title}</strong>
          {unconfirmed ? (
            <Dialog.Description render={<div />}>
              {notice.text}
            </Dialog.Description>
          ) : (
            <div id={busy ? busyNote : undefined}>{notice.text}</div>
          )}
        </div>
      )}
      {!ended && (
        <>
          {!unconfirmed && !noReview && (
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
          {!unconfirmed && disabled && !noReview && (
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
          {showCancel && (
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
          )}
          {showCancel && !busy && !canCancel && (
            <p id={cancelNote} className="v-resident-review-note">
              {residentText.answerUnavailable}
            </p>
          )}
          {status && <p className="v-resident-review-note">{status}</p>}
          {!unconfirmed && <p className="v-resident-review-note">{t.help}</p>}
        </>
      )}
    </>
  );
}
