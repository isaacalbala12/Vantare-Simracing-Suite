import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Events } from "@wailsio/runtime";
import { HubToast, type HubToastVariant } from "./HubToast";
import { useNotificationPreferences } from "../settings/notification-preferences";
import { createChainStore, type ChainStepEvent } from "./chain-store-core";
import { ChainRunnerContext } from "./chain-context";

export function ChainRunnerProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createChainStore);
  const notifications = useNotificationPreferences();
  const notificationsRef = useRef(notifications);
  useEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);

  const [toastInfo, setToastInfo] = useState<{
    variant: HubToastVariant;
    message: string;
    profileId: string;
  } | null>(null);

  useEffect(() => {
    store.startWatchdog();

    const offStep = Events.On("launcher:chain:step", (event: unknown) => {
      store.handleStep((event as { data: ChainStepEvent }).data);
    });
    const offDone = Events.On("launcher:chain:done", (event: unknown) => {
      const data = (event as { data: { profileId: string; success: boolean } }).data;
      store.handleDone(data.profileId, data.success);

      const chain = store.getChain(data.profileId);
      const result = store.getLastResult(data.profileId);
      if (!chain || !result) return;

      const total = chain.steps.length;
      const doneSteps = chain.steps.filter((step) => step.status === "done").length;
      const failedNames = chain.steps
        .filter((step) => step.status === "failed")
        .map((step) => step.appId)
        .join(", ");
      const message =
        result === "success"
          ? `Perfil ${data.profileId} · ${doneSteps}/${total} apps lanzadas`
          : result === "partial"
            ? `Perfil ${data.profileId} · ${doneSteps}/${total} apps listas, falló ${failedNames}`
            : `Perfil ${data.profileId} · no se pudo iniciar`;

      if (!notificationsRef.current.launcherMuted) {
        setToastInfo({ variant: result, message, profileId: data.profileId });
      }
    });
    const offError = Events.On("launcher:chain:error", (event: unknown) => {
      const data = (event as { data: { profileId: string } }).data;
      store.handleError(data.profileId);
    });

    return () => {
      offStep();
      offDone();
      offError();
      store.shutdown();
    };
  }, [store]);

  const handleRetry = useCallback((profileId: string) => {
    Events.Emit("launcher:profile:retry:failed", { id: profileId });
    setToastInfo(null);
  }, []);

  return (
    <>
      <ChainRunnerContext.Provider value={store}>{children}</ChainRunnerContext.Provider>
      {toastInfo ? (
        <HubToast
          variant={toastInfo.variant}
          message={toastInfo.message}
          profileId={toastInfo.profileId}
          onRetry={handleRetry}
          onClose={() => setToastInfo(null)}
        />
      ) : null}
    </>
  );
}
