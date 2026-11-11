import { Dialog } from "@base-ui/react/dialog";
import { useEffect, useState } from "react";
import type { ResidentView } from "../../../contract/generated/contract";
import { useHost } from "../../app/Host";
import { residentText as t } from "../../i18n/launcher-resident";
import { Button } from "../../ui/Button";
import { Callout } from "../../ui/Data";
import { Tooltip } from "../../ui/Layers";
import "../../ui/launcher/resident.css";
export function useResident() {
  const { client, issue } = useHost();
  const [view, setView] = useState<ResidentView>();
  useEffect(() => {
    setView(undefined);
    if (!client || issue) return;
    let alive = true,
      received = false;
    const off = client.listen((message) => {
      if (!alive) return;
      if (
        message.kind === "event" &&
        message.event.topic === "launcherResident"
      ) {
        received = true;
        setView(message.event.value);
      }
    });
    const unsubscribe = client.subscribe("launcherResident");
    void client
      .request({ method: "launcher.resident.get" })
      .then((reply) => {
        if (alive && !received && reply.method === "launcher.resident.get")
          setView(reply.value);
      })
      .catch(() => {
        if (alive && !received) setView(undefined);
      });
    return () => {
      alive = false;
      off();
      unsubscribe();
    };
  }, [client, issue]);
  return view;
}
export function ResidentInbox({ view }: { view?: ResidentView }) {
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
              <Dialog.Close aria-label={t.close}>×</Dialog.Close>
            </header>
            <div className="v-launcher-resident-body">
              <Dialog.Description>
                {t.question[decision.kind]}
              </Dialog.Description>
              {decision.actions.map((action) => (
                <Tooltip key={action.id} label={t.readOnly}>
                  <span>
                    <Button disabled>{action.label}</Button>
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
