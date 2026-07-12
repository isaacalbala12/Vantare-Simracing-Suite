type Decision = "reuse" | "restart" | "cancel";

type LauncherDecisionDialogProps = {
  open: boolean;
  appName: string;
  onResolve: (decision: Decision, remember: boolean) => void;
};

export function LauncherDecisionDialog({
  open,
  appName,
  onResolve,
}: LauncherDecisionDialogProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm" role="presentation">
      <section
        className="card-sleek w-[min(420px,calc(100vw-2rem))] rounded-xl p-5"
        role="dialog"
        aria-modal="true"
        aria-labelledby="launcher-decision-title"
        data-testid="launcher-decision-dialog"
      >
        <h2 id="launcher-decision-title" className="text-lg font-bold text-white">La app ya está abierta</h2>
        <p className="mt-2 text-sm text-vantare-textMuted">{appName} ya está ejecutándose.</p>
        <div className="mt-4 grid grid-cols-1 gap-2">
          <button type="button" onClick={() => onResolve("reuse", false)} data-testid="launcher-decision-reuse" className="rounded-lg bg-accent px-3 py-2 text-xs font-bold text-black">Usar la instancia abierta</button>
          <button type="button" onClick={() => onResolve("restart", false)} data-testid="launcher-decision-restart" className="rounded-lg border border-white/20 px-3 py-2 text-xs text-white">Reiniciar esta app</button>
          <button type="button" onClick={() => onResolve("cancel", false)} data-testid="launcher-decision-cancel" className="rounded-lg px-3 py-2 text-xs text-vantare-textDim">Cancelar</button>
        </div>
        <div className="mt-4 flex gap-2 border-t border-white/10 pt-3">
          <button type="button" onClick={() => onResolve("reuse", true)} data-testid="launcher-decision-remember-reuse" className="text-[10px] uppercase tracking-[.16em] text-white/60">Recordar usar</button>
          <button type="button" onClick={() => onResolve("restart", true)} data-testid="launcher-decision-remember-restart" className="text-[10px] uppercase tracking-[.16em] text-white/60">Recordar reiniciar</button>
        </div>
      </section>
    </div>
  );
}
