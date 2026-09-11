import type { OverlayWorkshopQuery } from "./overlay-workshop-query";
import { FUNCTIONAL_STUDY_MODULES, FUNCTIONAL_STUDY_STYLES } from "./functional-study-options";
import { designSystemRegistry } from "../core/design-system-registry";
import { listOfficialDesigns } from "../design-systems/official-designs";
import type { WidgetType } from "../core/profile-document";

const FUNCTIONAL_WIDGETS = designSystemRegistry
  .get("vantare-functional", 1)
  .widgets.map((entry) => entry.widgetType);

const WIDGET_LABELS: Partial<Record<WidgetType, string>> = {
  standings: "Standings",
  relative: "Relative",
  delta: "Delta",
  pedals: "Pedals",
};

// Al cambiar de widget dentro del estudio se aterriza en la variante con los
// datos más expresivos disponibles; el resto de la selección ligada al widget
// anterior (escena, diseño, piel) no sobrevive porque la haría inválida.
const STUDY_LANDING: Partial<Record<WidgetType, Pick<OverlayWorkshopQuery, "variant" | "sceneId" | "sceneFrame">>> = {
  standings: { variant: "standings-functional-study" },
  relative: { variant: "relative-multiclass" },
  delta: { variant: "default", sceneId: "delta-cross-zero", sceneFrame: 2 },
  pedals: { variant: "pedals-full" },
};

export function FunctionalStudyControls({ query, update, modules, onModules }: {
  query: OverlayWorkshopQuery;
  update: (query: OverlayWorkshopQuery) => void;
  modules: readonly string[];
  onModules: (modules: string[]) => void;
}) {
  const isStandings = query.widget === "standings";
  const systems = designSystemRegistry
    .list()
    .filter((system) => system.widgets.some((entry) => entry.widgetType === query.widget))
    .map((system) => system.id);
  const designs = listOfficialDesigns(query.widget).filter((design) => design.systemId === "vantare-functional");
  const defaultDesign = designs.find((design) => design.isDefault) ?? designs[0];
  const chooseWidget = (widget: WidgetType) => update({
    ...query,
    widget,
    designId: undefined,
    studyStyle: undefined,
    sceneId: undefined,
    sceneFrame: undefined,
    ...(STUDY_LANDING[widget] ?? { variant: "default" }),
  });
  const chooseSystem = (system: string) => update({
    ...query,
    system: system as OverlayWorkshopQuery["system"],
    designId: undefined,
    studyStyle: undefined,
    sceneId: undefined,
    sceneFrame: undefined,
  });

  return <aside className="functional-study-controls" aria-label={`Diseño de ${query.widget}`}>
    <div className="functional-study-title"><span>VANTARE / WORKSHOP</span><h1>Eficiencia.</h1><p>{WIDGET_LABELS[query.widget] ?? query.widget} · Sistema Efficiency</p></div>
    <fieldset><legend>Widget</legend><div className="functional-study-segments">
      {FUNCTIONAL_WIDGETS.map((widget) => <button type="button" key={widget} aria-pressed={query.widget === widget} onClick={() => chooseWidget(widget)}>{WIDGET_LABELS[widget] ?? widget}</button>)}
    </div></fieldset>
    <fieldset><legend>Sistema</legend><label className="functional-study-select"><span>Sistema de diseño</span><select value={query.system} onChange={(event) => chooseSystem(event.target.value)}>{systems.map((system) => <option key={system} value={system}>{system === "vantare-functional" ? "Eficiencia" : system}</option>)}</select></label></fieldset>
    {designs.length > 1 && <fieldset><legend>Estilo</legend><div className="functional-study-segments">{designs.map((design) => <button type="button" key={design.id} aria-pressed={(query.designId ?? defaultDesign?.id) === design.id} onClick={() => update({ ...query, designId: design.id })}>{design.name}</button>)}</div></fieldset>}
    {isStandings && <fieldset><legend>Dirección v2</legend><div className="functional-study-segments">
      <button type="button" aria-pressed={!query.studyStyle} onClick={() => update({ ...query, studyStyle: undefined })}>V1</button>
      {FUNCTIONAL_STUDY_STYLES.map((style) => <button type="button" key={style.id} aria-pressed={query.studyStyle === style.id} onClick={() => update({ ...query, designId: style.designId, studyStyle: style.id })}>{style.label}</button>)}
    </div></fieldset>}
    {isStandings && <fieldset><legend>Módulos</legend><p className="functional-study-note">Posición y piloto siempre visibles.</p>
      {FUNCTIONAL_STUDY_MODULES.map((item) => <label key={item.id} className="functional-study-toggle"><span>{item.label}</span><input type="checkbox" checked={modules.includes(item.id)} onChange={() => onModules(modules.includes(item.id) ? modules.filter((id) => id !== item.id) : [...modules, item.id])} /></label>)}
    </fieldset>}
    <fieldset><legend>Sesión</legend><div className="functional-study-segments">{([['race', 'Carrera'], ['practice', 'Práctica']] as const).map(([id, label]) => <button type="button" key={id} aria-pressed={query.session === id} onClick={() => update({ ...query, session: id })}>{label}</button>)}</div></fieldset>
    <fieldset><legend>Fondo</legend><div className="functional-study-segments">{([['context', 'Mixto'], ['solid', 'Oscuro'], ['transparent', 'Claro']] as const).map(([id, label]) => <button type="button" key={id} aria-pressed={query.background === id} onClick={() => update({ ...query, background: id })}>{label}</button>)}</div></fieldset>
    <fieldset><legend>Datos</legend><label className="functional-study-select"><span>Estado de la fuente</span><select value={query.state} onChange={(e) => update({ ...query, state: e.target.value as OverlayWorkshopQuery['state'] })}><option value="ready">Recibiendo</option><option value="stale">Datos antiguos</option><option value="disconnected">Desconectado</option></select></label></fieldset>
    <div className="functional-study-provenance"><span className="functional-study-dot" />Escenario de diseño<p>Datos de demostración. El widget usa el mismo componente que la aplicación.</p></div>
  </aside>;
}
