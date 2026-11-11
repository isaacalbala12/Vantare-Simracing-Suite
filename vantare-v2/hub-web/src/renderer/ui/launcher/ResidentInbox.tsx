import { Dialog } from "@base-ui/react/dialog";
import { useEffect, useId, useState } from "react";
import type { ResidentView } from "../../../contract/generated/contract";
import { residentText as t } from "../../i18n/launcher-resident";
import { Button } from "../Button";
import { Callout } from "../Data";
import { Tooltip } from "../Layers";
import "./resident.css";
export function ResidentInbox({ view }: { view?: ResidentView }) {
  const explanation = useId();
  const [dismissed, setDismissed] = useState<string>();
  const decision = view?.decision;
  useEffect(() => {
    if (!decision) setDismissed(undefined);
  }, [decision]);
  if (!decision)
    return view?.error ? <Callout tone="err" title={t.failed} /> : null;
  const open = dismissed !== decision.id;
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
        modal={false}
        open={open}
        onOpenChange={(value) => {
          if (!value) setDismissed(decision.id);
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="v-launcher-resident-scrim" />
          <Dialog.Popup className="v-launcher-resident-drawer">
            <header>
              <Dialog.Title>{t.title}</Dialog.Title>
              <Dialog.Close aria-label={t.close}>{t.closeSymbol}</Dialog.Close>
            </header>
            <div className="v-launcher-resident-body">
              <Dialog.Description>
                {t.question[decision.kind]}
              </Dialog.Description>
              <p id={explanation}>{t.readOnly}</p>
              {decision.actions.map((action) => (
                <Tooltip key={action.id} label={t.readOnly}>
                  <span>
                    <Button disabled aria-describedby={explanation}>
                      {action.label}
                    </Button>
                  </span>
                </Tooltip>
              ))}
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
