export function OverlaysStudioPage() {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-[1800px] flex-col px-6 py-8">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold text-white">Overlays Studio</h1>
        <p className="mt-2 text-sm text-vantare-textMuted">
          Crea, organiza y edita tus overlays desde un único lugar.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card-sleek rounded-xl p-5">
          <h2 className="font-display text-xl font-semibold text-white">Mis perfiles</h2>
        </section>

        <section className="card-sleek rounded-xl p-5">
          <h2 className="font-display text-xl font-semibold text-white">Recomendados por Vantare</h2>
        </section>

        <section className="card-sleek rounded-xl p-5">
          <h2 className="font-display text-xl font-semibold text-white">Comunidad</h2>
          <p className="mt-2 text-sm text-vantare-textMuted">Próximamente</p>
        </section>
      </div>
    </div>
  );
}
