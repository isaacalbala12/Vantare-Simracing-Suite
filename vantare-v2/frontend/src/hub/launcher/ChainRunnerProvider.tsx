import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Events } from "@wailsio/runtime";
import { HubToast, type HubToastVariant } from "./HubToast";
import { useNotificationPreferences } from "../settings/notification-preferences";
import { createChainStore, type ChainStepEvent } from "./chain-store-core";
import { ChainRunnerContext } from "./chain-context";

type LauncherDecision = {
  decisionId: string;
  profileId: string;
  appId: string;
  kind: "failure" | "alreadyRunning" | "cancel";
  message: string;
  actions: string[];
  expiresAt: number;
};

const decisionLabels: Record<string, string> = {
  continue: "Continuar",
  stop: "Detener perfil",
  reuse: "Reutilizar",
  restart: "Reiniciar",
  cancel: "Cancelar perfil",
  leave: "Dejar abiertas",
  "close-started": "Cerrar lanzadas",
};

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
  const [decisions, setDecisions] = useState<LauncherDecision[]>([]);
  const [rememberDecision, setRememberDecision] = useState(false);

  useEffect(() => {
    store.startWatchdog();

    const offStep = Events.On("launcher:chain:step", (event: unknown) => {
      store.handleStep((event as { data: ChainStepEvent }).data);
    });
    const offDone = Events.On("launcher:chain:done", (event: unknown) => {
      const data = (event as { data: { profileId: string; success: boolean; status?: string } }).data;
      store.handleDone(data.profileId, data.success, data.status);
      if (data.status === "stopped") return;

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
    const offDecision = Events.On("launcher:decision:required", (event: unknown) => {
      const request = (event as { data: LauncherDecision }).data;
      if (!request?.decisionId || (request.kind !== "failure" && request.kind !== "alreadyRunning" && request.kind !== "cancel")) return;
      store.handleDecisionRequired(request.profileId, request.expiresAt);
      setDecisions((current) => current.some((item) => item.decisionId === request.decisionId)
        ? current : [...current, request]);
    });
    const offExpired = Events.On("launcher:decision:expired", (event: unknown) => {
      const id = (event as { data: { decisionId: string } }).data?.decisionId;
      setDecisions((current) => current.filter((item) => item.decisionId !== id));
      setRememberDecision(false);
    });
    // Windows autostart can begin a chain before the Hub mounts. Subscribe
    // first, then ask Go to replay any question that is still unanswered.
    Events.Emit("launcher:decision:pending:get");

    return () => {
      offStep();
      offDone();
      offError();
      offDecision();
      offExpired();
      store.shutdown();
    };
  }, [store]);

  const handleRetry = useCallback((profileId: string) => {
    Events.Emit("launcher:profile:retry:failed", { id: profileId });
    setToastInfo(null);
  }, []);

  const activeDecision = decisions[0];
  const resolveDecision = (action: string) => {
    if (!activeDecision) return;
    Events.Emit("launcher:decision:resolve", {
      decisionId: activeDecision.decisionId,
      action,
      remember: rememberDecision && action !== "cancel",
    });
    setDecisions((current) => current.slice(1));
    setRememberDecision(false);
  };

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
      {activeDecision ? (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-orbit border border-orbit-ember/40 bg-orbit-surface-1 p-5 shadow-2xl" role="alertdialog" aria-modal="true" aria-labelledby="launcher-decision-title">
            <h2 id="launcher-decision-title" className="text-base text-orbit-ink">
              {activeDecision.kind === "alreadyRunning" ? `${activeDecision.appId} ya está abierta` : activeDecision.kind === "cancel" ? "Perfil detenido" : `No se pudo iniciar ${activeDecision.appId}`}
            </h2>
            <p className="mt-2 text-sm text-orbit-ink-3">
              Perfil {activeDecision.profileId}. {activeDecision.message || "El paso falló."}
              {activeDecision.kind === "failure" ? " ¿Continuar con las demás aplicaciones?" : activeDecision.kind === "alreadyRunning" ? " ¿Qué quieres hacer?" : ""}
            </p>
            <label className="mt-4 flex items-center gap-2 text-sm text-orbit-ink-3">
              <input type="checkbox" checked={rememberDecision} onChange={(event) => setRememberDecision(event.target.checked)} />
              Recordar esta decisión para el perfil
            </label>
            <div className="mt-5 flex justify-end gap-2">
              {activeDecision.actions.map((action) => (
                <button
                  key={action}
                  type="button"
                  className={action === "continue" || action === "reuse" ? "rounded-lg bg-orbit-ember px-3 py-2 text-sm text-white" : "rounded-lg px-3 py-2 text-sm text-orbit-ink-3"}
                  onClick={() => resolveDecision(action)}
                >
                  {decisionLabels[action] ?? action}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
