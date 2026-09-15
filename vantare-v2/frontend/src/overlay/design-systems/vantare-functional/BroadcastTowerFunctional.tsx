import { useI18n } from "../../../i18n/I18nProvider";
import type { WidgetRendererProps } from "../../core/design-system-definition";
import type { BroadcastTowerViewModel } from "../../widget-types/broadcast-tower/broadcast-tower-view-model";
import { functionalLabels } from "./labels";

// Horizontal Standings: tira de ancho completo a 71px — bloque de sesión,
// stream de tarjetas por piloto repartiendo el ancho, y datos de pista/SOF
// al final. rowCount decide cuántas tarjetas; la caja solo cambia de ancho.
const classLabel = (value: string) => value.toUpperCase().includes("HYPER") ? "HC" : value.slice(0, 3).toUpperCase();

const shortName = (name: string) => {
  const words = name.replace(/\(.*?\)/g, " ").trim().split(/\s+/).filter(Boolean);
  return words.length > 1 ? `${words[0][0]}. ${words.slice(1).join(" ")}` : name;
};

export function BroadcastTowerFunctional({ model, effects }: WidgetRendererProps<BroadcastTowerViewModel>) {
  const { locale } = useI18n();
  const labels = functionalLabels[locale];
  const gapText = (gap: number | undefined) =>
    gap === undefined || gap === null ? "—" : `${gap > 0 ? "+" : ""}${gap.toFixed(3)}`;
  const statusText = model.status !== "ready" ? labels[model.status] : undefined;

  return (
    <section
      className="vf-broadcast-tower"
      data-widget-system="vantare-functional"
      data-widget-renderer="broadcast-tower"
      data-status={model.status}
      data-flag={model.flag ?? "unknown"}
      data-effects={effects}
    >
      <div className="vf-bt-lead">
        <span className="vf-bt-session">{model.sessionLabel}</span>
        <b className="vf-bt-lap">
          {labels.currentLap} {model.lap ?? "—"}
          {model.totalLaps !== undefined && <span className="vf-bt-lap-total">/{model.totalLaps}</span>}
        </b>
      </div>
      {statusText ? (
        <p className="vf-status" role="status">{statusText}</p>
      ) : (
        <div className="vf-bt-stream" role="list">
          {model.rows.slice(0, model.rowCount).map((row) => (
            <div
              key={`${row.place}-${row.number}`}
              className="vf-bt-card"
              data-player={row.isPlayer}
              role="listitem"
            >
              <span className="vf-bt-place">{row.place}</span>
              <span className="vf-bt-id">
                <b className="vf-bt-name">{shortName(row.name)}</b>
                <span className="vf-bt-sub">
                  {row.team !== "—" && <span className="vf-bt-class">{classLabel(row.team)}</span>}
                  {row.number !== "—" && <span className="vf-bt-number">#{row.number}</span>}
                </span>
              </span>
              <span className="vf-bt-gap">{row.place === 1 ? "LEADER" : gapText(row.gap)}</span>
            </div>
          ))}
        </div>
      )}
      {(model.showWeather || model.showSof) && (
        <aside className="vf-bt-side">
          {model.showWeather && (
            <span className="vf-bt-ambient">
              {labels.trackTemp} {model.trackTempC !== undefined ? `${model.trackTempC}°` : "—"}
            </span>
          )}
          {model.showSof && <span className="vf-bt-sof">SOF {model.sof ?? "—"}</span>}
        </aside>
      )}
    </section>
  );
}
