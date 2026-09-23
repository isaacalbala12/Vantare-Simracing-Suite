import { useMemo, useRef } from "react";
import { useI18n } from "../../../i18n/I18nProvider";
import type { WidgetRendererProps } from "../../core/design-system-definition";
import type { BroadcastTowerViewModel } from "../../widget-types/broadcast-tower/broadcast-tower-view-model";
import { resolveFunctionalClassAccent } from "../../widget-types/standings/functional-class-accent";
import { functionalLabels, sessionDisplayLabel } from "./labels";
import { useBroadcastTowerMotion } from "./use-broadcast-tower-motion";

// Horizontal Standings: tira de ancho completo a 71px — bloque de sesión,
// stream de tarjetas por piloto repartiendo el ancho, y datos de pista/SOF
// al final. rowCount decide cuántas tarjetas; la caja solo cambia de ancho.
const classLabel = (value: string) => value.slice(0, 3).toUpperCase();

const shortName = (name: string) => {
  const words = name.replace(/\(.*?\)/g, " ").trim().split(/\s+/).filter(Boolean);
  return words.length > 1 ? `${words[0][0]}. ${words.slice(1).join(" ")}` : name;
};

const gapText = (gap: number | undefined) =>
  gap === undefined || gap === null ? "—" : `${gap > 0 ? "+" : ""}${gap.toFixed(3)}`;

type DriverCardsProps = { model: BroadcastTowerViewModel; leaderLabel: string; duplicate?: boolean };

function DriverCards({ model, leaderLabel, duplicate = false }: DriverCardsProps) {
  return model.rows.slice(0, model.rowCount).map((row, index) => (
    <div
      key={row.id ?? `${row.place}-${row.number}-${index}`}
      className="vf-bt-card"
      data-player={row.isPlayer}
      data-bt-row={duplicate ? undefined : row.id}
      role={duplicate ? undefined : "listitem"}
    >
      <span className="vf-bt-cue" aria-hidden="true" />
      <span className="vf-bt-place">{row.place}</span>
      <span className="vf-bt-id">
        <b className="vf-bt-name">{shortName(row.name)}</b>
        <span className="vf-bt-sub">
          {row.team !== "—" && <span className="vf-bt-class" data-class-accent={resolveFunctionalClassAccent(row.team)}>{classLabel(row.team)}</span>}
          {row.number !== "—" && <span className="vf-bt-number">#{row.number}</span>}
        </span>
      </span>
      <span className="vf-bt-gap">{row.place === 1 ? leaderLabel : gapText(row.gap)}</span>
    </div>
  ));
}

function DiscreteDriverStrip({ model, leaderLabel, layout, motion }: DriverCardsProps & Pick<WidgetRendererProps, "layout"> & { motion: "full" | "reduced" | "minimal" }) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  useBroadcastTowerMotion(model, motion, rootRef, { w: layout?.w, h: layout?.h });
  return <div className="vf-bt-driver-strip" ref={rootRef}>
    <div className="vf-bt-stream" role="list"><DriverCards model={model} leaderLabel={leaderLabel} /></div>
  </div>;
}

function CarouselDriverStrip({ model, leaderLabel, motion }: DriverCardsProps & { motion: "full" | "reduced" | "minimal" }) {
  return <div className="vf-bt-driver-strip vf-bt-carousel">
    <div className="vf-bt-carousel-rail">
      <div className="vf-bt-carousel-group" role="list"><DriverCards model={model} leaderLabel={leaderLabel} /></div>
      {motion === "full" && <div className="vf-bt-carousel-group" data-bt-carousel-copy aria-hidden="true" inert>
        <DriverCards model={model} leaderLabel={leaderLabel} duplicate />
      </div>}
    </div>
  </div>;
}

export function BroadcastTowerFunctional({ model, settings, layout, motion = "full", effects }: WidgetRendererProps<BroadcastTowerViewModel>) {
  const { locale } = useI18n();
  const labels = functionalLabels[locale];
  const sessionLabel = useMemo(() => sessionDisplayLabel(locale, model.sessionLabel), [locale, model.sessionLabel]);
  const statusText = model.status !== "ready" ? labels[model.status] : undefined;

  return (
    <section
      className="vf-broadcast-tower"
      data-widget-system="vantare-functional"
      data-widget-renderer="broadcast-tower"
      data-status={model.status}
      data-flag={model.flag ?? "unknown"}
      data-effects={effects}
      data-motion-level={motion}
    >
      <div className="vf-bt-lead">
        <span className="vf-bt-session">{sessionLabel}</span>
        <b className="vf-bt-lap">
          {labels.currentLap} {model.lap ?? "—"}
          {model.totalLaps !== undefined && <span className="vf-bt-lap-total">/{model.totalLaps}</span>}
        </b>
      </div>
      {statusText ? (
        <p className="vf-status" role="status">{statusText}</p>
      ) : settings.driverCarousel === true ? (
        <CarouselDriverStrip model={model} leaderLabel={labels.leader} motion={motion} />
      ) : (
        <DiscreteDriverStrip model={model} leaderLabel={labels.leader} motion={motion} layout={layout} />
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
