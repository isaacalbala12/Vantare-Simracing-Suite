type CommunityComingSoonViewProps = {
  onBack: () => void;
};

export function CommunityComingSoonView({ onBack }: CommunityComingSoonViewProps) {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-[1200px] flex-col px-6 py-8">
      <button
        type="button"
        onClick={onBack}
        className="mb-3 w-fit text-xs font-bold uppercase tracking-wider text-vantare-textMuted hover:text-white cursor-pointer"
      >
        ← Volver a Overlays Studio
      </button>
      <div className="glass-panel rounded-xl p-8">
        <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-vantare-red-300">
          Comunidad
        </p>
        <h1 className="mt-4 font-display text-3xl font-bold text-white">Comunidad</h1>
        <p className="mt-6 font-display text-2xl font-semibold text-white">Próximamente</p>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-vantare-textMuted">
          Esta sección se reservará para overlays compartidos por la comunidad. En Fase A2 solo debe comunicar que todavía no está disponible.
        </p>
      </div>
    </div>
  );
}
