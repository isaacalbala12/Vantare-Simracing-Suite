import { useState } from "react";

export type BetaUserRole =
  | "beginner"
  | "intermediate"
  | "advanced"
  | "creator"
  | "organizer";

type BetaWelcomeProps = {
  onComplete: (role: BetaUserRole) => void;
};

const ROLES: { value: BetaUserRole; label: string }[] = [
  { value: "beginner", label: "Piloto principiante" },
  { value: "intermediate", label: "Piloto intermedio" },
  { value: "advanced", label: "Piloto avanzado" },
  { value: "creator", label: "Creador de contenido" },
  { value: "organizer", label: "Organizador de campeonato" },
];

const OBS_HINTS: Partial<Record<BetaUserRole, string>> = {
  creator:
    "Si vas a streamear, desde Configurar puedes copiar la URL de OBS Browser Source y empezar a emitir en minutos.",
  organizer:
    "Para emitir un campeonato, ve a Configurar y copia la URL de OBS Browser Source de cada sesion.",
};

export function BetaWelcome({ onComplete }: BetaWelcomeProps) {
  const [role, setRole] = useState<BetaUserRole | "">("");

  const obsHint = role !== "" ? OBS_HINTS[role] : undefined;

  return (
    <div
      data-testid="beta-welcome"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
    >
      <div className="glass-panel rounded-2xl p-8 border border-white/10 max-w-lg w-full relative">
        <h1 className="font-display font-bold text-2xl text-white mb-2">
          Bienvenido a la beta de Vantare
        </h1>

        <p className="text-sm text-vantare-textMuted">
          Como vas a usar Vantare principalmente?
        </p>

        <div
          className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4"
          data-testid="role-grid"
        >
          {ROLES.map((r) => (
            <button
              key={r.value}
              type="button"
              data-testid={`role-card-${r.value}`}
              onClick={() => setRole(r.value)}
              className={`text-left rounded-lg border p-3 text-sm transition-colors ${
                role === r.value
                  ? "border-vantare-red-500 bg-vantare-red-500/10 text-white"
                  : "border-white/5 bg-vantare-surface text-vantare-textMuted hover:text-white"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <div className="space-y-4 mt-6">
          <div className="rounded-lg bg-vantare-surface border border-white/5 p-4">
            <p className="text-sm font-semibold text-white">Plan Free activo</p>
            <p className="text-xs text-vantare-textMuted mt-1">
              Puedes probar overlays con datos mock/demo, el editor in-place,
              la galeria de disenos y OBS local.
            </p>
          </div>

          {obsHint && (
            <div
              data-testid="obs-hint"
              className="rounded-lg bg-vantare-surface border border-vantare-red-500/20 p-4"
            >
              <p className="text-sm font-semibold text-white">
                OBS y streaming
              </p>
              <p className="text-xs text-vantare-textMuted mt-1">{obsHint}</p>
            </div>
          )}

          <div className="rounded-lg bg-vantare-surface border border-white/5 p-4">
            <p className="text-sm font-semibold text-white">Proximamente</p>
            <p className="text-xs text-vantare-textMuted mt-1">
              Calendario LMU, launcher de simuladores, historial real de
              carreras y licencias de pago.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            if (role !== "") onComplete(role);
          }}
          disabled={role === ""}
          data-testid="start-button"
          className="mt-8 w-full btn-primary py-3 rounded-lg font-semibold text-sm text-white shadow-lg shadow-vantare-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Empezar
        </button>
      </div>
    </div>
  );
}
