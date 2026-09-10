import type { ReactNode } from "react";
import { widgetTypeRegistry } from "../core/widget-registry";
import { getOverlayV2ViewModelEntry } from "../core/overlay-v2-view-models";
import type { WidgetInstanceV3 } from "../core/profile-document";
import type { WidgetRuntimeInput } from "../core/widget-definition";
import type { StandingsRowViewModel, StandingsViewModel } from "../widget-types/standings/standings-view-model";
import { useI18n } from "../../i18n/I18nProvider";
import { functionalLabels } from "../design-systems/vantare-functional/labels";
import vantareMark from "../../assets/orbit/vantare-mark.png";
import type { FunctionalStudyStyleId } from "./functional-study-options";

/** Construye el mismo StandingsViewModel que consume el renderer productivo;
 *  solo para el estudio: ninguna de estas vistas existe fuera del Workshop. */
function resolveStudyModel(widget: WidgetInstanceV3, runtime: WidgetRuntimeInput): StandingsViewModel | undefined {
  const entry = getOverlayV2ViewModelEntry("standings");
  const frame = runtime.overlayV2Frame;
  const source = runtime.overlayV2Source;
  if (!entry || !frame || !source) return undefined;
  try {
    const content = widgetTypeRegistry.get("standings").parseContent(widget.content);
    return entry.buildViewModelV2(frame, source, content) as StandingsViewModel;
  } catch {
    return undefined;
  }
}

/** Paleta de demostración: la telemetría V2 no entrega color de equipo
 *  (`teamBrandColor` es un declared gap), así que el estudio asigna una por
 *  posición para juzgar la dirección. Si algún día llega el dato real, se usa. */
const STUDY_TEAM_COLORS = ["#e03228", "#f0ead8", "#2d9cdb", "#f2a03d", "#56c271", "#9b6fd0", "#c1121f", "#4cc3ff", "#e8c33c", "#ff7ab8"];

const teamColor = (row: StandingsRowViewModel, index: number) =>
  row.teamBrandColor || STUDY_TEAM_COLORS[index % STUDY_TEAM_COLORS.length];

/** Tinta legible sobre un color de equipo arbitrario. */
function readableOn(hex: string): string {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!match) return "#ffffff";
  const lum = (0.2126 * parseInt(match[1], 16) + 0.7152 * parseInt(match[2], 16) + 0.0722 * parseInt(match[3], 16)) / 255;
  return lum > 0.62 ? "#141519" : "#ffffff";
}

function sessionLabel(model: StandingsViewModel, labels: (typeof functionalLabels)[keyof typeof functionalLabels]): string {
  const session = model.sessionLabel.toLowerCase();
  return session === "race" || session === "practice" || session === "qualifying" ? labels[session] : model.sessionLabel;
}

/** Muro: monitor de tiempos estilo pit wall — chip de posición con el color
 *  de equipo, nombre compacto, diferencia grande y vueltas en cluster. */
function StudyPitwall({ model }: { model: StandingsViewModel }) {
  const { locale } = useI18n();
  const labels = functionalLabels[locale];
  const enabled = new Set(model.columns.map((column) => column.metricId));
  return (
    <section className="vsf-study vsf-pitwall" data-widget-renderer="standings">
      <header className="vsf-pw-head">
        <span className="vsf-pw-brand"><img src={vantareMark} alt="" />VANTARE</span>
        <span className="vsf-pw-session">{sessionLabel(model, labels)}</span>
        <span className="vsf-pw-clock">{model.remainingText}</span>
        <span className="vsf-pw-class">{model.activeClass}</span>
      </header>
      <div className="vsf-pw-body">
        {model.rows.map((row, index) => {
          const color = teamColor(row, index);
          return (
          <div className="vsf-pw-row" key={row.id} data-standings-row={row.id} data-player={row.isPlayer || undefined}>
            <span className="vsf-pw-pos" style={{ background: color, color: readableOn(color) }}>{row.position}</span>
            <span className="vsf-pw-name">{row.driverName}{row.isPlayer ? <em>{labels.you}</em> : null}</span>
            <span className="vsf-pw-gap">{row.gapText}</span>
            <span className="vsf-pw-laps">
              {enabled.has("bestLap") ? <span>{labels.bestLap} <b>{row.bestLapText}</b></span> : null}
              {enabled.has("lastLap") ? <span>{labels.lastLap} <b>{row.lastLapText}</b></span> : null}
            </span>
            {enabled.has("pit") && row.pitText ? <span className="vsf-pw-pit">{row.pitText}</span> : null}
          </div>
          );
        })}
      </div>
    </section>
  );
}

function gapSecondsOf(row: StandingsRowViewModel): number | null {
  if (row.isLeader) return 0;
  const match = /^\+?\s*(\d+(?:[.,]\d+)?)/.exec(row.gapText.trim());
  return match ? Number(match[1].replace(",", ".")) : null;
}

/** Escalera: visualización de la diferencia — cada fila dibuja una barra
 *  proporcional al gap con el líder; deja de ser una tabla. */
function StudyLadder({ model }: { model: StandingsViewModel }) {
  const { locale } = useI18n();
  const labels = functionalLabels[locale];
  const gaps = model.rows.map(gapSecondsOf);
  const max = Math.max(...gaps.filter((value): value is number => value !== null), 1);
  return (
    <section className="vsf-study vsf-ladder" data-widget-renderer="standings">
      <header className="vsf-ld-head">
        <img src={vantareMark} alt="" />
        <span>{sessionLabel(model, labels)} · {model.remainingText} · {model.activeClass}</span>
      </header>
      <div className="vsf-ld-body">
        {model.rows.map((row, index) => {
          const gap = gaps[index]!;
          const width = gap === null ? 100 : Math.min(96, Math.max(3, (gap / max) * 96));
          return (
            <div className="vsf-ld-row" key={row.id} data-standings-row={row.id} data-player={row.isPlayer || undefined}>
              <span className="vsf-ld-pos">{row.position}</span>
              <span className="vsf-ld-name">{row.driverName}{row.isPlayer ? <em>{labels.you}</em> : null}</span>
              <span className="vsf-ld-track">
                {gap === 0 ? <i className="vsf-ld-mark" /> : <i className="vsf-ld-bar" data-lapped={gap === null || undefined} style={{ width: `${width}%` }} />}
              </span>
              <b className="vsf-ld-gap">{row.gapText}</b>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function FunctionalStudyRenderer({ widget, runtime, style }: {
  widget: WidgetInstanceV3;
  runtime: WidgetRuntimeInput;
  style: FunctionalStudyStyleId;
}): ReactNode {
  const model = resolveStudyModel(widget, runtime);
  if (!model) {
    return <div className="vsf-study vsf-study--empty" data-widget-renderer="standings">Sin datos de demostración.</div>;
  }
  return style === "v2-ladder" ? <StudyLadder model={model} /> : <StudyPitwall model={model} />;
}
