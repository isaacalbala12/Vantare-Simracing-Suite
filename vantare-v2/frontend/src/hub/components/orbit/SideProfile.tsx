import { ListRow } from "../../../ui/orbit/ListRow";
import { formatMessage } from "../../orbit/format-message";
import type { ProfileEntry } from "../../state/overlay-workbench";
import { profileLabel } from "../../state/overlay-workbench";

export interface SideProfileProps {
  active: ProfileEntry | null;
  recommended: ProfileEntry | null;
  running: boolean;
  onToggleOverlay(): void;
  onOpenStudio(): void;
  onActivate(profile: ProfileEntry): void;
  labels: {
    title: string;
    stopped: string;
    live: string;
    widgets: string;
    active: string;
    recommended: string;
    empty: string;
  };
  className?: string;
}

/** Bloque persistente "Perfil de overlay": activo con ▶ abrir/detener + recomendado. */
export function SideProfile({
  active,
  recommended,
  running,
  onToggleOverlay,
  onOpenStudio,
  onActivate,
  labels,
  className,
}: SideProfileProps) {
  const widgets = (profile: ProfileEntry) =>
    formatMessage(labels.widgets, { n: profile.widgets ?? 0 });

  return (
    <section
      aria-label={labels.title}
      className={["orbit-block", className].filter(Boolean).join(" ")}
    >
      <div className="orbit-block__head">
        <span className="orbit-eyebrow">{labels.title}</span>
        <span className="orbit-state-chip" data-s={running ? "running" : "stopped"}>
          {running ? labels.live : labels.stopped}
        </span>
      </div>
      <div className="orbit-list" data-testid="orbit-side-profile">
        {active ? (
          <ListRow
            onClick={onOpenStudio}
            selected
            subtitle={`${widgets(active)} · ${labels.active}`}
            title={profileLabel(active)}
            trailing={
              <span
                aria-hidden="true"
                className="orbit-play"
                data-testid="orbit-side-profile-toggle"
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleOverlay();
                }}
              >
                ▶
              </span>
            }
          />
        ) : recommended ? null : (
          // «Sin perfiles todavía» solo cuando de verdad no hay ninguno: con un
          // recomendado en la lista la frase contradecía a la fila de debajo.
          <p className="orbit-row__copy">{labels.empty}</p>
        )}
        {recommended ? (
          <ListRow
            onClick={() => onActivate(recommended)}
            subtitle={`${widgets(recommended)} · ${labels.recommended}`}
            title={profileLabel(recommended)}
          />
        ) : null}
      </div>
    </section>
  );
}
