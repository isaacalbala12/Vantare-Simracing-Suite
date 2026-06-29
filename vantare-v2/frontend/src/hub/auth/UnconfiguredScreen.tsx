// UnconfiguredScreen is shown when the backend reports StateUnconfigured:
// the release build is missing the Supabase URL/anon key, so license
// validation cannot run. This is a configuration error, not a paywall
// block. The screen tells the user what happened and offers a retry.
export function UnconfiguredScreen() {
  return (
    <div
      data-testid="unconfigured-screen"
      className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a0a] p-4 text-white"
    >
      <div className="w-full max-w-md space-y-4 rounded-lg border border-white/10 bg-[#111] p-6 text-center">
        <h1 className="font-mono text-sm uppercase tracking-widest">
          Configuración incompleta
        </h1>
        <p className="font-mono text-[10px] text-vantare-textDim">
          La app no puede validar tu licencia porque faltan los valores
          públicos de Supabase en esta build. Esto es un problema de
          configuración del instalador, no de tu cuenta.
        </p>
        <p className="font-mono text-[10px] text-vantare-textDim">
          Descarga la versión más reciente desde el canal de beta o
          contacta con soporte si el problema persiste.
        </p>
        <button
          type="button"
          data-testid="unconfigured-retry"
          onClick={() => window.location.reload()}
          className="w-full rounded border border-white/20 py-2 font-mono text-[10px] uppercase tracking-widest hover:bg-white/5"
        >
          Reintentar
        </button>
      </div>
    </div>
  );
}