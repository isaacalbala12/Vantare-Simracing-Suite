type RecommendedSuccessBannerProps = {
  profileId: string;
  onGoToDashboard: () => void;
};

export function RecommendedSuccessBanner({ profileId, onGoToDashboard }: RecommendedSuccessBannerProps) {
  return (
    <div
      data-testid="recommended-success-banner"
      className="glass-panel rounded-xl p-4 border border-emerald-900/30 flex items-center justify-between gap-4"
    >
      <div>
        <p className="font-mono text-[10px] uppercase tracking-wider text-emerald-300">
          Recomendado activado y abierto
        </p>
        <p className="mt-1 text-xs text-vantare-textMuted">
          Perfil activo: <span className="font-mono">{profileId}</span>
        </p>
      </div>
      <button
        type="button"
        data-testid="recommended-success-go-hub"
        onClick={onGoToDashboard}
        className="btn-primary rounded-lg px-4 py-2 text-xs font-bold text-white cursor-pointer"
      >
        Ir al Hub
      </button>
    </div>
  );
}
