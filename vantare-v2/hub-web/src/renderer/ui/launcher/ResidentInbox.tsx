import { useEffect, useId, useRef, useState } from "react";
import type { ResidentView } from "../../../contract/generated/contract";
import { residentText as t } from "../../i18n/launcher-resident";
import type { ResidentAnswerController } from "../../screens/launcher/resident-answer";
import {
  answerScope,
  sameAnswerScope,
} from "../../screens/launcher/resident-answer-model";
import { Button } from "../Button";
import { Callout } from "../Data";
import { Tooltip } from "../Layers";
import { WindowDialog as Dialog } from "../WindowDialog";
import "./resident.css";
export function ResidentInbox({
  view,
  answer,
}: {
  view?: ResidentView;
  answer?: ResidentAnswerController;
}) {
  const explanation = useId();
  const popup = useRef<HTMLDivElement>(null);
  const reopen = useRef<HTMLButtonElement>(null);
  const [dismissed, setDismissed] = useState<string>();
  const rendered = answerScope(view);
  const retained = useRef<
    | {
        scope: NonNullable<ReturnType<typeof answerScope>>;
        decision: NonNullable<ResidentView["decision"]>;
      }
    | undefined
  >(undefined);
  if (rendered && view?.decision)
    retained.current = { scope: rendered, decision: view.decision };
  const attempt = answer?.attempt;
  if (!attempt && !view?.decision) retained.current = undefined;
  const matches =
    !!attempt &&
    (rendered
      ? sameAnswerScope(rendered, attempt.target)
      : !!retained.current &&
        sameAnswerScope(retained.current.scope, attempt.target) &&
        view?.execution?.instance === attempt.target.instance);
  const decision =
    view?.decision ?? (matches ? retained.current?.decision : null);
  const phase = matches ? attempt?.phase : undefined;
  const status = phase
    ? phase.kind === "finished"
      ? t.answerState[
          phase.outcome.kind === "completed"
            ? "finished"
            : phase.outcome.kind === "failed"
              ? "failed"
              : "cancelled"
        ]
      : phase.kind === "rejected"
        ? `${t.answerState.rejected} ${t.rejection[phase.reason]}`
        : t.answerState[phase.kind]
    : undefined;
  const identity = `${view?.execution?.instance ?? "legacy"}:${view?.execution?.question?.accountGeneration ?? ""}:${decision?.id ?? ""}`;
  useEffect(() => {
    if (!decision) setDismissed(undefined);
  }, [decision]);
  useEffect(() => {
    if (phase && document.activeElement === document.body)
      popup.current?.focus();
  }, [phase]);
  const liveStatus = (
    <span
      className="v-resident-live"
      role="status"
      aria-label={t.answerStatusLabel}
      aria-live="polite"
      aria-atomic="true"
    >
      {status ?? ""}
    </span>
  );
  if (!decision)
    return (
      <>
        {liveStatus}
        {view?.error ? <Callout tone="err" title={t.failed} /> : null}
      </>
    );
  const open = dismissed !== identity;
  return (
    <>
      {liveStatus}
      {!open && (
        <Callout
          tone="warn"
          title={status ?? t.pending}
          actions={
            <Button ref={reopen} onClick={() => setDismissed(undefined)}>
              {t.open}
            </Button>
          }
        />
      )}
      <Dialog.Root
        scope="notice"
        modal={false}
        open={open}
        onOpenChange={(value) => {
          if (!value) setDismissed(identity);
        }}
      >
        <Dialog.Portal>
          <Dialog.Popup
            ref={popup}
            tabIndex={-1}
            finalFocus={() => reopen.current ?? false}
            className="v-launcher-resident-drawer"
          >
            <header>
              <Dialog.Title>{t.title}</Dialog.Title>
              <Dialog.Close aria-label={t.close}>{t.closeSymbol}</Dialog.Close>
            </header>
            <div className="v-launcher-resident-body">
              <Dialog.Description>
                {t.question[decision.kind]}
              </Dialog.Description>
              <p id={explanation}>{answer ? t.answerHelp : t.readOnly}</p>
              {status && <p id={`${explanation}-status`}>{status}</p>}
              {view?.decision?.actions.map((action) => {
                const reason =
                  action.id === "trust" && answer
                    ? t.trustUnavailable
                    : answer
                      ? t.answerUnavailable
                      : t.readOnly;
                const enabled = answer?.available(action.id) ?? false;
                return (
                  <Tooltip
                    key={action.id}
                    label={enabled ? action.label : reason}
                  >
                    <span>
                      <Button
                        disabled={!answer}
                        aria-disabled={!enabled}
                        aria-describedby={
                          !answer || enabled
                            ? explanation
                            : phase && action.id !== "trust"
                              ? `${explanation}-status`
                              : `${explanation}-${action.id}`
                        }
                        onClick={() => {
                          if (enabled && rendered)
                            void answer?.answer(action.id, rendered);
                        }}
                      >
                        {action.label}
                      </Button>
                      {answer &&
                        !enabled &&
                        (!phase || action.id === "trust") && (
                          <p id={`${explanation}-${action.id}`}>{reason}</p>
                        )}
                    </span>
                  </Tooltip>
                );
              })}
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
