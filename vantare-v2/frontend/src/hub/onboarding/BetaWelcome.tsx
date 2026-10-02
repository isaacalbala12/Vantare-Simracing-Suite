import { useState } from "react";
import { Button } from "../../ui/orbit/Button";
import { useHubSuspendBlocker } from "../hub-suspend-guard";
import "../../styles/orbit.tokens.css";
import "../../styles/orbit-kit.css";
import "../../styles/orbit-onboarding.css";

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
  useHubSuspendBlocker(
    "onboarding-role-draft",
    "La bienvenida tiene una selección sin guardar",
    role !== "",
  );

  const obsHint = role !== "" ? OBS_HINTS[role] : undefined;

  return (
    <div data-testid="beta-welcome" className="orbit-confirm-layer">
      <div className="orbit-confirm__scrim" aria-hidden="true" />
      <div className="orbit-welcome" role="dialog" aria-modal="true">
        <h1 className="orbit-welcome__title">Bienvenido a la beta de Vantare</h1>

        <p className="orbit-welcome__sub">
          Como vas a usar Vantare principalmente?
        </p>

        <div className="orbit-welcome__roles" data-testid="role-grid">
          {ROLES.map((r) => (
            <button
              key={r.value}
              type="button"
              data-testid={`role-card-${r.value}`}
              aria-pressed={role === r.value}
              onClick={() => setRole(r.value)}
              className="orbit-welcome__role"
            >
              {r.label}
            </button>
          ))}
        </div>

        <div className="orbit-welcome__notes">
          <div className="orbit-welcome__note">
            <p className="orbit-welcome__note-title">Plan Free activo</p>
            <p className="orbit-welcome__note-body">
              Puedes probar overlays con datos mock/demo, el editor in-place,
              la galeria de disenos y OBS local.
            </p>
          </div>

          {obsHint && (
            <div
              data-testid="obs-hint"
              className="orbit-welcome__note orbit-welcome__note--accent"
            >
              <p className="orbit-welcome__note-title">OBS y streaming</p>
              <p className="orbit-welcome__note-body">{obsHint}</p>
            </div>
          )}

          <div className="orbit-welcome__note">
            <p className="orbit-welcome__note-title">Proximamente</p>
            <p className="orbit-welcome__note-body">
              Calendario LMU, launcher de simuladores, historial real de
              carreras y licencias de pago.
            </p>
          </div>
        </div>

        <Button
          variant="primary"
          data-testid="start-button"
          className="orbit-welcome__start"
          disabled={role === ""}
          onClick={() => {
            if (role !== "") onComplete(role);
          }}
        >
          Empezar
        </Button>
      </div>
    </div>
  );
}
