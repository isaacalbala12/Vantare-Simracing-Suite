type LauncherDockProps = {
  onNavigate: (section: string) => void;
};

function CarIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        d="M3 13l1.5-4.5A2 2 0 016.4 7h11.2a2 2 0 011.9 1.5L21 13M5 13h14v4a1 1 0 01-1 1h-2a1 1 0 01-1-1v-1H9v1a1 1 0 01-1 1H6a1 1 0 01-1-1v-4z"
      />
      <circle cx="7.5" cy="15.5" r="0.8" fill="currentColor" />
      <circle cx="16.5" cy="15.5" r="0.8" fill="currentColor" />
    </svg>
  );
}

function ObsIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function LauncherDock({ onNavigate }: LauncherDockProps) {
  return (
    <aside className="v52-dock hidden lg:flex" aria-label="Launcher rápido">
      <button
        type="button"
        aria-label="Abrir launcher LMU"
        title="Le Mans Ultimate"
        onClick={() => onNavigate("launcher")}
        className="v52-dock-item text-vantare-red-400"
      >
        <CarIcon />
      </button>
      <button
        type="button"
        aria-label="Configurar OBS"
        title="OBS Studio"
        onClick={() => onNavigate("setup")}
        className="v52-dock-item text-vantare-red-400"
      >
        <ObsIcon />
      </button>
      <button
        type="button"
        aria-label="Añadir simulador"
        title="Añadir simulador"
        disabled
        className="v52-dock-item v52-dock-item-muted disabled:cursor-not-allowed"
      >
        <PlusIcon />
      </button>
      <button
        type="button"
        aria-label="Añadir app"
        title="Añadir app"
        disabled
        className="v52-dock-item v52-dock-item-muted disabled:cursor-not-allowed"
      >
        <PlusIcon />
      </button>
    </aside>
  );
}
