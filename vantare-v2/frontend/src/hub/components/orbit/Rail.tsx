import markUrl from "../../../assets/orbit/vantare-mark.png";
import { Icon, type IconName } from "../../../ui/orbit/Icon";
import { Tooltip } from "../../../ui/orbit/Tooltip";
import type { ViewId } from "../../orbit/views";

export interface RailItem {
  id: ViewId;
  icon: IconName;
  label: string;
  /** Motivo del candado: plan requerido y plan actual. */
  locked?: { requiredPlan: string; currentPlan: string };
  soon?: boolean;
}

export interface RailProps {
  items: RailItem[];
  active: ViewId;
  onNavigate(view: ViewId, target?: string): void;
  onTogglePalette(): void;
  onToggleColumn(): void;
  columnOpen: boolean;
  columnAvailable: boolean;
  avatarSrc?: string;
  planLabel: string;
  /** Copias ya traducidas: el kit no habla i18n (`12-contratos-componentes.md`). */
  labels: {
    rail: string;
    brand: string;
    palette: string;
    settings: string;
    account: string;
    toggleColumn: string;
    toggleColumnHide: string;
    noContext: string;
    requiresPlan: string;
  };
  className?: string;
}

export function Rail({
  items,
  active,
  onNavigate,
  onTogglePalette,
  onToggleColumn,
  columnOpen,
  columnAvailable,
  avatarSrc,
  planLabel,
  labels,
  className,
}: RailProps) {
  const toggleLabel = columnAvailable
    ? columnOpen
      ? labels.toggleColumnHide
      : labels.toggleColumn
    : labels.noContext;

  return (
    <aside aria-label={labels.rail} className={["orbit-rail", className].filter(Boolean).join(" ")}>
      {/* Sin `title` nativo (briefing 01): la marca lleva el mismo tooltip
          propio que el resto del rail, visible con hover y con foco. */}
      <div
        aria-label={labels.brand}
        className="orbit-rail__brand"
        data-testid="orbit-rail-brand"
        data-tip={labels.brand}
        data-tip-side="right"
        role="img"
      >
        <img alt="" draggable={false} height={26} src={markUrl} width={26} />
      </div>

      {items.map((item) => {
        const locked = Boolean(item.locked);
        const tip = locked ? labels.requiresPlan : item.label;
        return (
          <Tooltip key={item.id} text={tip}>
            <button
              aria-current={active === item.id ? "page" : undefined}
              aria-label={item.label}
              className={["orbit-rail__button", locked ? "orbit-rail__button--locked" : null]
                .filter(Boolean)
                .join(" ")}
              data-testid={`orbit-rail-${item.id}`}
              onClick={() => onNavigate(item.id)}
              type="button"
            >
              <Icon name={item.icon} size={23} strokeWidth={1.75} />
              {item.soon ? <i aria-hidden="true" className="orbit-rail__soon" /> : null}
              {locked ? (
                <span aria-hidden="true" className="orbit-rail__lock">
                  <Icon name="i-lock" size={15} strokeWidth={1.6} />
                </span>
              ) : null}
            </button>
          </Tooltip>
        );
      })}

      <div className="orbit-rail__bottom">
        <Tooltip text={toggleLabel}>
          <button
            aria-label={toggleLabel}
            aria-pressed={columnOpen}
            className="orbit-rail__button"
            data-testid="orbit-rail-toggle-column"
            disabled={!columnAvailable}
            onClick={onToggleColumn}
            type="button"
          >
            <Icon name="i-panel" size={20} strokeWidth={1.6} />
          </button>
        </Tooltip>

        <Tooltip text={labels.palette}>
          <button
            aria-label={labels.palette}
            className="orbit-rail__button"
            data-testid="orbit-rail-palette"
            onClick={onTogglePalette}
            type="button"
          >
            <Icon name="i-comando" size={23} strokeWidth={1.75} />
          </button>
        </Tooltip>

        <Tooltip text={labels.settings}>
          <button
            aria-current={active === "ajustes" ? "page" : undefined}
            aria-label={labels.settings}
            className="orbit-rail__button"
            data-testid="orbit-rail-ajustes"
            onClick={() => onNavigate("ajustes", "application")}
            type="button"
          >
            <Icon name="i-ajustes" size={23} strokeWidth={1.75} />
          </button>
        </Tooltip>

        <Tooltip text={labels.account}>
          <button
            aria-label={labels.account}
            className="orbit-rail__avatar"
            data-testid="orbit-rail-account"
            onClick={() => onNavigate("ajustes", "account")}
            type="button"
          >
            {avatarSrc ? <img alt="" height={30} src={avatarSrc} width={30} /> : planLabel.charAt(0)}
          </button>
        </Tooltip>
      </div>
    </aside>
  );
}
