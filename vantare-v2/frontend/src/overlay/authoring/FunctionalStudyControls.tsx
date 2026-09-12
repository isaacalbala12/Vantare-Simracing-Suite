import type { OverlayWorkshopQuery } from "./overlay-workshop-query";
import { FUNCTIONAL_STUDY_MODULES } from "./functional-study-options";
import { useI18n } from "../../i18n/I18nProvider";
import { vantareFunctionalManifest } from "../design-systems/vantare-functional/manifest";

export function FunctionalStudyControls({ query, update, modules, onModules, appearance, onAppearance }: {
  query: OverlayWorkshopQuery;
  update: (query: OverlayWorkshopQuery) => void;
  modules: readonly string[];
  onModules: (modules: string[]) => void;
  appearance: Record<string, unknown>;
  onAppearance: (settings: Record<string, unknown>) => void;
}) {
  const { t } = useI18n();
  return <aside className="functional-study-controls" aria-label="Diseño del standings">
    <div className="functional-study-title"><span>VANTARE / WORKSHOP</span><h1>Eficiencia.</h1><p>Standings · Sistema Efficiency</p></div>
    <fieldset><legend>Estilo</legend><div className="functional-study-segments">{([['standings-functional-compact', 'Signature'], ['standings-functional-broadcast', 'Broadcast']] as const).map(([id, label]) => <button type="button" key={id} aria-pressed={(query.designId ?? 'standings-functional-compact') === id} onClick={() => update({ ...query, designId: id })}>{label}</button>)}</div></fieldset>
    <fieldset><legend>Módulos</legend><p className="functional-study-note">Posición y piloto siempre visibles.</p>
      {FUNCTIONAL_STUDY_MODULES.map((item) => <label key={item.id} className="functional-study-toggle"><span>{item.label}</span><input type="checkbox" checked={modules.includes(item.id)} onChange={() => onModules(modules.includes(item.id) ? modules.filter((id) => id !== item.id) : [...modules, item.id])} /></label>)}
    </fieldset>
    <fieldset><legend>Cabecera y pie</legend>
      {vantareFunctionalManifest.widgets[0]!.inspector.appearance?.map(control => control.kind === "toggle"
        ? <label key={control.id} className="functional-study-toggle"><span>{t(control.labelKey)}</span><input type="checkbox" checked={Boolean(appearance[control.path] ?? control.defaultValue)} onChange={e => onAppearance({ ...appearance, [control.path]: e.target.checked })} /></label>
        : control.kind === "select" ? <label key={control.id} className="functional-study-select"><span>{t(control.labelKey)}</span><select value={String(appearance[control.path] ?? control.defaultValue)} onChange={e => onAppearance({ ...appearance, [control.path]: e.target.value })}>{control.options.map(option => <option key={option.value} value={option.value}>{t(option.labelKey)}</option>)}</select></label> : null)}
    </fieldset>
    <fieldset><legend>Sesión</legend><div className="functional-study-segments">{([['race', 'Carrera'], ['practice', 'Práctica']] as const).map(([id, label]) => <button type="button" key={id} aria-pressed={query.session === id} onClick={() => update({ ...query, session: id })}>{label}</button>)}</div></fieldset>
    <fieldset><legend>Fondo</legend><div className="functional-study-segments">{([['context', 'Mixto'], ['solid', 'Oscuro'], ['transparent', 'Claro']] as const).map(([id, label]) => <button type="button" key={id} aria-pressed={query.background === id} onClick={() => update({ ...query, background: id })}>{label}</button>)}</div></fieldset>
    <fieldset><legend>Datos</legend><label className="functional-study-select"><span>Estado de la fuente</span><select value={query.state} onChange={(e) => update({ ...query, state: e.target.value as OverlayWorkshopQuery['state'] })}><option value="ready">Recibiendo</option><option value="stale">Datos antiguos</option><option value="disconnected">Desconectado</option></select></label></fieldset>
    <div className="functional-study-provenance"><span className="functional-study-dot" />Escenario de diseño<p>Datos de demostración. El widget usa el mismo componente que la aplicación.</p></div>
  </aside>;
}
