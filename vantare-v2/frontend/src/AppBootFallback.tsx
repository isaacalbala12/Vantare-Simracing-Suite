export function AppBootFallback(): React.ReactElement {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex h-screen items-center justify-center bg-orbit-canvas font-mono text-xs uppercase tracking-widest text-orbit-ink-3"
    >
      Cargando Vantare…
    </div>
  );
}
