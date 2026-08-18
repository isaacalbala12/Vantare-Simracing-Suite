import { useCallback, useMemo, useState } from "react";
import { Icon } from "../../../ui/orbit/Icon";
import { matchesQuery, type PaletteItem } from "./palette-filter";

export type { PaletteItem } from "./palette-filter";

export interface CommandPaletteLabels {
  title: string;
  placeholder: string;
  goTo: string;
  actions: string;
  footNav: string;
  footRun: string;
  footLocked: string;
}

export interface CommandPaletteProps {
  open: boolean;
  onClose(): void;
  destinations: PaletteItem[];
  actions: PaletteItem[];
  labels: CommandPaletteLabels;
  /** Aviso cuando se intenta ejecutar un ítem bloqueado. */
  onBlocked?(item: PaletteItem): void;
  className?: string;
}

export function CommandPalette(props: CommandPaletteProps) {
  // El contenido solo existe mientras la paleta está abierta: así el filtro y
  // el cursor se reinician al cerrar sin necesidad de efectos de reseteo.
  if (!props.open) return null;
  return <PaletteSurface {...props} />;
}

function PaletteSurface({
  onClose,
  destinations,
  actions,
  labels,
  onBlocked,
  className,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);

  const groups = useMemo(() => {
    const trimmed = query.trim();
    return [
      { id: "goTo", label: labels.goTo, items: destinations.filter((i) => matchesQuery(i, trimmed)) },
      { id: "actions", label: labels.actions, items: actions.filter((i) => matchesQuery(i, trimmed)) },
    ].filter((group) => group.items.length > 0);
  }, [actions, destinations, labels.actions, labels.goTo, query]);

  const flat = useMemo(() => groups.flatMap((group) => group.items), [groups]);

  const runItem = useCallback(
    (item: PaletteItem | undefined) => {
      if (!item) return;
      if (item.locked) {
        onBlocked?.(item);
      } else {
        item.run();
      }
      onClose();
    },
    [onBlocked, onClose],
  );

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (flat.length === 0) return;
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setCursor((current) => (current + delta + flat.length) % flat.length);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      runItem(flat[cursor]);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <div
      className={["orbit-palette-backdrop", className].filter(Boolean).join(" ")}
      data-testid="orbit-palette-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div aria-label={labels.title} aria-modal="true" className="orbit-palette" role="dialog">
        <div className="orbit-palette__search">
          <Icon name="i-comando" size={20} strokeWidth={1.75} />
          <input
            aria-label={labels.placeholder}
            // El foco entra en el input en cuanto la paleta se monta (Ctrl K).
            autoFocus
            autoComplete="off"
            data-testid="orbit-palette-input"
            onChange={(event) => {
              setQuery(event.target.value);
              setCursor(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder={labels.placeholder}
            value={query}
          />
        </div>
        <div className="orbit-palette__body">
          {groups.map((group) => (
            <div key={group.id}>
              <div className="orbit-palette__label" data-testid={`orbit-palette-group-${group.id}`}>
                {group.label}
              </div>
              {group.items.map((item) => {
                const index = flat.indexOf(item);
                return (
                  <button
                    className={[
                      "orbit-palette__item",
                      item.locked ? "orbit-palette__item--locked" : null,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    data-selected={index === cursor}
                    data-testid={`orbit-palette-item-${item.id}`}
                    key={item.id}
                    onClick={() => runItem(item)}
                    onMouseEnter={() => setCursor(index)}
                    type="button"
                  >
                    <span className="orbit-palette__icon">
                      <Icon name={item.icon} size={14} />
                    </span>
                    <span className="orbit-palette__item-label">{item.label}</span>
                    <span className="orbit-palette__item-meta">{item.locked ?? item.meta ?? ""}</span>
                    {item.locked ? <Icon name="i-lock" size={13} /> : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="orbit-palette__foot">
          <span>{labels.footNav}</span>
          <span>{labels.footRun}</span>
          <span>{labels.footLocked}</span>
        </div>
      </div>
    </div>
  );
}
