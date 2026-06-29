import type { ReactNode } from "react";

type QuickActionsProps = {
  onNavigate: (section: string) => void;
};

type ActionItem = {
  label: string;
  description: string;
  target: string;
  icon: ReactNode;
};

const ACTIONS: ActionItem[] = [
  {
    label: "Overlays Studio",
    description: "Editar perfiles y widgets",
    target: "profiles",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
      </svg>
    ),
  },
  {
    label: "Configurar OBS",
    description: "URL e instrucciones para OBS Browser Source",
    target: "setup",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    ),
  },
];

export function QuickActions({ onNavigate }: QuickActionsProps) {
  return (
    <section className="glass-panel rounded-xl p-6 border border-white/5">
      <h2 className="font-display font-semibold text-lg text-white mb-4">
        Acciones rápidas
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {ACTIONS.map((action) => (
          <button
            key={action.target}
            type="button"
            onClick={() => onNavigate(action.target)}
            className="flex items-center gap-3 p-4 rounded-xl bg-vantare-surface border border-white/5 hover:border-vantare-red-900/50 transition-all text-left group"
          >
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-vantare-red-700 to-vantare-burgundy flex items-center justify-center shrink-0 shadow-lg group-hover:scale-110 transition-transform text-white">
              {action.icon}
            </div>
            <div>
              <p className="text-sm font-bold text-white">{action.label}</p>
              <p className="text-[10px] text-vantare-textMuted">{action.description}</p>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
