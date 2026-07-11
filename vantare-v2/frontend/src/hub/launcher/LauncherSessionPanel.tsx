import { useLauncherSnapshot, useLauncherStore } from "./launcher-store";

export function LauncherSessionPanel() {
  const snapshot = useLauncherSnapshot();
  const { dispatchLauncherCommand } = useLauncherStore();
  const chains = snapshot?.activeChains ?? [];
  if (chains.length === 0) return null;

  return (
    <section className="card-sleek rounded-xl p-5" data-testid="launcher-session-panel" aria-labelledby="launcher-session-title">
      <div className="flex items-center justify-between gap-3">
        <div>
          <span className="v52-eyebrow">Sesión</span>
          <h2 id="launcher-session-title" className="mt-1 text-lg font-bold text-white">Cadenas activas</h2>
        </div>
        <span className="text-xs text-vantare-textDim">{chains.length} activa{chains.length === 1 ? "" : "s"}</span>
      </div>
      <ul className="mt-4 flex flex-col gap-2" aria-label="Estado de cadenas de lanzamiento">
        {chains.map((chain) => (
          <li key={chain.profileId} className="rounded-lg bg-black/20 p-3" data-testid={`launcher-session-${chain.profileId}`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <strong className="text-sm text-white">{chain.profileId}</strong>
                <span className="ml-2 text-[10px] uppercase tracking-[.16em] text-vantare-textMuted">{chain.status}</span>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => dispatchLauncherCommand("launcher:app:close", { id: chain.steps?.find((step) => step.pid)?.appId ?? chain.profileId, pid: chain.steps?.find((step) => step.pid)?.pid ?? 0 })} data-testid={`launcher-session-close-${chain.profileId}`} className="rounded border border-white/15 px-2 py-1 text-[10px] uppercase tracking-[.16em] text-white/70">Cerrar</button>
                <button type="button" onClick={() => dispatchLauncherCommand("launcher:app:restart", { id: chain.steps?.find((step) => step.pid)?.appId ?? chain.profileId, pid: chain.steps?.find((step) => step.pid)?.pid ?? 0 })} data-testid={`launcher-session-restart-${chain.profileId}`} className="rounded border border-white/15 px-2 py-1 text-[10px] uppercase tracking-[.16em] text-white/70">Reiniciar</button>
              </div>
            </div>
            {chain.steps && chain.steps.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1" aria-label={`Pasos de ${chain.profileId}`}>
                {chain.steps.map((step, index) => (
                  <li key={`${step.appId}-${index}`} className="flex items-center justify-between rounded bg-black/20 px-2 py-1 text-xs" data-testid={`launcher-session-step-${chain.profileId}-${index}`}>
                    <span className="text-white/80">{step.appId}</span>
                    <span className="text-vantare-textDim">{step.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
