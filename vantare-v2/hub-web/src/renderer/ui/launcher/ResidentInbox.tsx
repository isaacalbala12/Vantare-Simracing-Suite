import { useEffect, useId, useRef, useState } from "react";
import type { ResidentView } from "../../../contract/generated/contract";
import { residentText as t } from "../../i18n/launcher-resident";
import type { ResidentAnswerController } from "../../screens/launcher/resident-answer";
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
  const [dismissed, setDismissed] = useState<string>();
  const retained = useRef(view?.decision);
  if (view?.decision) retained.current = view.decision;
  const decision =
    view?.decision ?? (answer?.attempt ? retained.current : null);
  const phase = answer?.attempt?.phase;
  const status = phase
    ? phase.kind === "finished"
      ? t.answerState[
          phase.outcome.kind === "completed"
            ? "finished"
            : phase.outcome.kind === "failed"
              ? "failed"
              : "cancelled"
        ]
      : t.answerState[phase.kind]
    : undefined;
  const identity = `${view?.execution?.instance ?? "legacy"}:${view?.execution?.question?.accountGeneration ?? ""}:${decision?.id ?? ""}`;
  useEffect(() => {
    if (!decision) setDismissed(undefined);
  }, [decision]);
  if (!decision)
    return view?.error ? <Callout tone="err" title={t.failed} /> : null;
  const open = dismissed !== identity;
  return (
    <>
      {!open && (
        <Callout
          tone="warn"
          title={t.pending}
          actions={
            <Button onClick={() => setDismissed(undefined)}>{t.open}</Button>
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
          <Dialog.Popup className="v-launcher-resident-drawer">
            <header>
              <Dialog.Title>{t.title}</Dialog.Title>
              <Dialog.Close aria-label={t.close}>{t.closeSymbol}</Dialog.Close>
            </header>
            <div className="v-launcher-resident-body">
              <Dialog.Description>
                {t.question[decision.kind]}
              </Dialog.Description>
              <p id={explanation}>{answer ? t.answerHelp : t.readOnly}</p>
              {status && <p role="status">{status}</p>}
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
                            : `${explanation}-${action.id}`
                        }
                        onClick={() => {
                          if (enabled) void answer?.answer(action.id);
                        }}
                      >
                        {action.label}
                      </Button>
                      {answer && !enabled && (
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
