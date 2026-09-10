import type { OverlayWorkshopQuery } from "./overlay-workshop-query";
import { FUNCTIONAL_STUDY_MODULES, FUNCTIONAL_STUDY_STYLES } from "./functional-study-options";

export function FunctionalStudyControls({ query, update, modules, onModules }: {
  query: OverlayWorkshopQuery;
  update: (query: OverlayWorkshopQuery) => void;
  modules: readonly string[];
  onModules: (modules: string[]) => void;
}) {
  return <aside className="functional-study-controls" aria-label="Diseño del standings">
    <div className="functional-study-title"><span>VANTARE / WORKSHOP</span><h1>Eficiencia.</h1><p>Standings · Sistema Efficiency</p></div>
    <fieldset><legend>Estilo</legend><div className="functional-study-segments">{([['standings-functional-compact', 'Signature'], ['standings-functional-broadcast', 'Broadcast']] as const).map(([id, label]) => <button type="button" key={id} aria-pressed={(query.designId ?? 'standings-functional-compact') === id} onClick={() => update({ ...query, designId: id })}>{label}</button>)}</div></fieldset>
    <fieldset><legend>Dirección v2</legend><div className="functional-study-segments">
      <button type="button" aria-pressed={!query.studyStyle} onClick={() => update({ ...query, studyStyle: undefined })}>V1</button>
      {FUNCTIONAL_STUDY_STYLES.map((style) => <button type="button" key={style.id} aria-pressed={query.studyStyle === style.id} onClick={() => update({ ...query, designId: style.designId, studyStyle: style.id })}>{style.label}</button>)}
    </div></fieldset>
    <fieldset><legend>Módulos</legend><p className="functional-study-note">Posición y piloto siempre visibles.</p>
      {FUNCTIONAL_STUDY_MODULES.map((item) => <label key={item.id} className="functional-study-toggle"><span>{item.label}</span><input type="checkbox" checked={modules.includes(item.id)} onChange={() => onModules(modules.includes(item.id) ? modules.filter((id) => id !== item.id) : [...modules, item.id])} /></label>)}
    </fieldset>
    <fieldset><legend>Sesión</legend><div className="functional-study-segments">{([['race', 'Carrera'], ['practice', 'Práctica']] as const).map(([id, label]) => <button type="button" key={id} aria-pressed={query.session === id} onClick={() => update({ ...query, session: id })}>{label}</button>)}</div></fieldset>
    <fieldset><legend>Fondo</legend><div className="functional-study-segments">{([['context', 'Mixto'], ['solid', 'Oscuro'], ['transparent', 'Claro']] as const).map(([id, label]) => <button type="button" key={id} aria-pressed={query.background === id} onClick={() => update({ ...query, background: id })}>{label}</button>)}</div></fieldset>
    <fieldset><legend>Datos</legend><label className="functional-study-select"><span>Estado de la fuente</span><select value={query.state} onChange={(e) => update({ ...query, state: e.target.value as OverlayWorkshopQuery['state'] })}><option value="ready">Recibiendo</option><option value="stale">Datos antiguos</option><option value="disconnected">Desconectado</option></select></label></fieldset>
    <div className="functional-study-provenance"><span className="functional-study-dot" />Escenario de diseño<p>Datos de demostración. El widget usa el mismo componente que la aplicación.</p></div>
  </aside>;
}
