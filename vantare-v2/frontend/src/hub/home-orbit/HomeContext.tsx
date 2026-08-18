import { useI18n } from "../../i18n/I18nProvider";
import { formatMessage } from "../orbit/format-message";
import type { RaceStart } from "../orbit/race-starts";
import type { OrbitOverlayState } from "../orbit/use-overlay-state";
import type { ViewId } from "../orbit/views";

export interface HomeContextProps {
  overlay: OrbitOverlayState;
  races: RaceStart[];
  onNavigate(view: ViewId, target?: string): void;
}

/**
 * Contexto de la columna en Inicio (`03-shell-y-layout.md § 3.3`): el briefing
 * 01 dejó el slot vacío. Aquí resume de un vistazo lo que el hero no repite —
 * cuántos perfiles hay y cuántas salidas quedan en el radar— y ofrece los dos
 * atajos que no están en las acciones rápidas.
 */
export function HomeContext({ overlay, races, onNavigate }: HomeContextProps) {
  const { t } = useI18n();

  return (
    <section aria-label={t("home.context.title")} className="orbit-block">
      <div className="orbit-block__head">
        <span className="orbit-eyebrow">{t("home.context.title")}</span>
      </div>
      <dl className="orbit-home__context" data-testid="orbit-home-context">
        <div>
          <dt>{t("home.context.profiles")}</dt>
          <dd>{overlay.profiles.length}</dd>
        </div>
        <div>
          <dt>{t("home.context.starts")}</dt>
          <dd>{races.length}</dd>
        </div>
      </dl>
      <p className="orbit-home__context-note">
        {formatMessage(t("home.context.followed"), {
          n: races.filter((race) => race.followed).length,
        })}
      </p>
      <button className="orbit-link" onClick={() => onNavigate("carreras")} type="button">
        {t("home.races.seeAll")}
      </button>
    </section>
  );
}
