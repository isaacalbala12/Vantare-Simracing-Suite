import { ALL_WIDGET_TYPES, type WidgetType } from "../core/profile-document";
import { designSystemRegistry } from "../core/design-system-registry";
import { listOfficialDesigns } from "../design-systems/official-designs";
import { listAnimationScenes } from "./fixtures/animation-scenes";
import { projectionGapsFor } from "./fixtures/projection-gaps";
import { WORKSHOP_V2_VARIANTS } from "./fixtures/authoring-v2-workshop-frame";
import { serializeOverlayWorkshopQuery, type OverlayWorkshopQuery } from "./overlay-workshop-query";
import { FUNCTIONAL_STUDY_DEFAULT_MODULES, FUNCTIONAL_STUDY_MODULES, FUNCTIONAL_STUDY_SLOTS, FUNCTIONAL_STUDY_STYLES } from "./functional-study-options";

const SYSTEM_LABELS: Record<string, string> = {
  "vantare-functional": "Eficiencia",
  "vantare-crystal": "Crystal",
  "vantare-endurance": "Endurance",
  "vantare-iracing": "iRacing",
  "vantare-original": "Original",
};
const systemLabel = (id: string) => SYSTEM_LABELS[id] ?? id;

const WIDGET_LABELS: Partial<Record<WidgetType, string>> = {
  standings: "Standings",
  relative: "Relative",
  delta: "Delta",
  pedals: "Pedals",
  "pedals-telemetry-compact": "Pedales avanzados",
};
const widgetLabel = (widget: WidgetType) => WIDGET_LABELS[widget] ?? widget;

// Cada widget aterriza en la fixture más expresiva disponible para juzgar el
// diseño; el resto de la selección ligada al widget anterior (escena, diseño,
// piel de estudio) no sobrevive porque convertiría la query en inválida.
const STUDY_LANDING: Partial<Record<WidgetType, Pick<OverlayWorkshopQuery, "variant" | "sceneId" | "sceneFrame">>> = {
  standings: { variant: "standings-functional-study" },
  relative: { variant: "relative-multiclass" },
  delta: { variant: "default", sceneId: "delta-cross-zero", sceneFrame: 2 },
  pedals: { variant: "pedals-full" },
};

const STATE_OPTIONS = [["ready", "Recibiendo"], ["stale", "Datos antiguos"], ["disconnected", "Desconectado"], ["error", "Error"]] as const;
const SESSION_OPTIONS = [["race", "Carrera"], ["qualifying", "Clasificación"], ["practice", "Práctica"]] as const;
const LOCATION_OPTIONS = [["track", "Pista"], ["pits", "Boxes"]] as const;
const BACKGROUND_OPTIONS = [["context", "Mixto"], ["solid", "Oscuro"], ["transparent", "Claro"]] as const;
const SURFACE_OPTIONS = [["studio", "Studio"], ["desktop", "Desktop"], ["obs", "OBS"], ["harness", "Harness"]] as const;
const SCALE_OPTIONS = [["0.5", "0.5×"], ["1", "1×"], ["1.5", "1.5×"], ["2", "2×"]] as const;

function Select(props: { label: string; value: string; onChange(value: string): void; children: React.ReactNode }) {
  return <label className="functional-study-select"><span>{props.label}</span><select value={props.value} onChange={(event) => props.onChange(event.target.value)}>{props.children}</select></label>;
}

function Segments(props: { options: readonly (readonly [string, string])[]; value: string; onChange(value: string): void }) {
  return <div className="functional-study-segments">{props.options.map(([id, label]) => <button type="button" key={id} aria-pressed={props.value === id} onClick={() => props.onChange(id)}>{label}</button>)}</div>;
}

export function FunctionalStudyControls({ query, update, onRunScene, onReset }: {
  query: OverlayWorkshopQuery;
  update: (query: OverlayWorkshopQuery) => void;
  onRunScene: (sceneId: string) => void;
  onReset: () => void;
}) {
  const systems = designSystemRegistry
    .list()
    .filter((system) => system.widgets.some((entry) => entry.widgetType === query.widget))
    .map((system) => system.id);
  const designs = listOfficialDesigns(query.widget).filter((design) => design.systemId === query.system);
  const defaultDesign = designs.find((design) => design.isDefault) ?? designs[0];
  // Cada variante declarada pertenece a un widget por su prefijo; el resto
  // produciría una query inválida.
  const scenes = listAnimationScenes(query.widget);
  const gaps = projectionGapsFor(query.widget);
  const isFunctional = query.system === "vantare-functional";
  const isStandings = query.widget === "standings";
  const allVariants = WORKSHOP_V2_VARIANTS.filter((variant) => variant === "default" || variant.startsWith(`${query.widget}-`));
  // Standings en Eficiencia tiene un único fixture de estudio: ofrecer las
  // variantes de depuración junto a los módulos hacía que los toggles no
  // aplicaran fuera del estudio. Si la URL trae otra variante válida se
  // muestra igualmente para no mentir sobre la selección actual.
  const offeredVariants = isFunctional && isStandings ? ["standings-functional-study"] : allVariants;
  const variants = offeredVariants.includes(query.variant) ? offeredVariants : [query.variant, ...offeredVariants];

  const chooseWidget = (widget: WidgetType) => {
    const nextSystems = designSystemRegistry.list().filter((system) => system.widgets.some((entry) => entry.widgetType === widget)).map((system) => system.id);
    const system = nextSystems.includes(query.system) ? query.system : nextSystems[0]!;
    const landing = STUDY_LANDING[widget] ?? { variant: "default" as const };
    // La variante de estudio de Standings solo existe dentro de Eficiencia;
    // con otro sistema el aterrizaje es la multiclass, igual de expresiva.
    const safeLanding = landing.variant === "standings-functional-study" && system !== "vantare-functional"
      ? { variant: "standings-multiclass" as const }
      : landing;
    update({
      ...query,
      widget,
      system,
      designId: undefined,
      studyStyle: undefined,
      sceneId: undefined,
      sceneFrame: undefined,
      ...safeLanding,
    });
  };
  const chooseSystem = (system: string) => update({
    ...query,
    system: system as OverlayWorkshopQuery["system"],
    designId: undefined,
    studyStyle: undefined,
    // La variante de estudio de Standings solo existe dentro de Eficiencia.
    ...(system === "vantare-functional" || query.variant !== "standings-functional-study" ? {} : { variant: "default" as const }),
  });
  const chooseDesign = (value: string) => update({ ...query, designId: value || undefined });
  const chooseVariant = (value: string) => {
    const variant = value as OverlayWorkshopQuery["variant"];
    update({ ...query, variant, studyStyle: variant === "standings-functional-study" ? query.studyStyle : undefined });
  };
  const chooseScene = (value: string) => update({ ...query, sceneId: value || undefined, sceneFrame: value ? 0 : undefined });
  const chooseScale = (value: string) => update({ ...query, scale: Number(value) });

  return <aside className="functional-study-controls" aria-label={`Diseño de ${query.widget}`}>
    <div className="functional-study-title"><span>VANTARE / WORKSHOP</span><h1>{systemLabel(query.system)}.</h1><p>{widgetLabel(query.widget)} · Sistema {systemLabel(query.system)}</p></div>

    <fieldset><legend>Widget</legend>
      <Select label="Widget" value={query.widget} onChange={(value) => chooseWidget(value as WidgetType)}>
        {ALL_WIDGET_TYPES.map((widget) => <option key={widget} value={widget}>{widgetLabel(widget)}</option>)}
      </Select>
      <Select label="Sistema de diseño" value={query.system} onChange={chooseSystem}>
        {systems.map((system) => <option key={system} value={system}>{systemLabel(system)}</option>)}
      </Select>
      {/* En Eficiencia el diseño se elige en "Estilo" (segmentos); el select
          solo aparece para los sistemas con catálogo largo. Siempre hay un
          diseño concreto — no existe el "renderer sin diseño". */}
      {!isFunctional && designs.length > 0 && <Select label="Diseño" value={query.designId ?? defaultDesign?.id ?? ""} onChange={chooseDesign}>
        {designs.map((design) => <option key={design.id} value={design.id}>{design.name}</option>)}
      </Select>}
      {variants.length > 1 ? (
        <Select label="Variante" value={query.variant} onChange={chooseVariant}>
          {variants.map((variant) => <option key={variant} value={variant}>{variant}</option>)}
        </Select>
      ) : <p className="functional-study-note">Fixture: {query.variant}</p>}
    </fieldset>

    {isFunctional && designs.length > 1 && <fieldset><legend>Estilo</legend><div className="functional-study-segments">{designs.map((design) => <button type="button" key={design.id} aria-pressed={(query.designId ?? defaultDesign?.id) === design.id} onClick={() => update({ ...query, designId: design.id })}>{design.name}</button>)}</div></fieldset>}
    {isFunctional && query.widget !== "relative" && <fieldset><legend>Marca</legend><div className="functional-study-segments">
      <button type="button" aria-pressed={query.brand !== "off"} onClick={() => update({ ...query, brand: undefined })}>Con marca</button>
      <button type="button" aria-pressed={query.brand === "off"} onClick={() => update({ ...query, brand: "off" })}>Sin marca</button>
    </div></fieldset>}
    {isFunctional && isStandings && <fieldset><legend>Dirección v2</legend><div className="functional-study-segments">
      <button type="button" aria-pressed={!query.studyStyle} onClick={() => update({ ...query, studyStyle: undefined })}>V1</button>
      {FUNCTIONAL_STUDY_STYLES.map((style) => <button type="button" key={style.id} aria-pressed={query.studyStyle === style.id} onClick={() => update({ ...query, designId: style.designId, studyStyle: style.id })}>{style.label}</button>)}
    </div></fieldset>}
    {isFunctional && isStandings && <fieldset><legend>Módulos</legend><p className="functional-study-note">Posición y piloto siempre visibles.</p>
      {FUNCTIONAL_STUDY_MODULES.map((item) => {
        const modules = query.modules ?? FUNCTIONAL_STUDY_DEFAULT_MODULES;
        return <label key={item.id} className="functional-study-toggle"><span>{item.label}</span><input type="checkbox" checked={modules.includes(item.id)} onChange={() => update({ ...query, modules: modules.includes(item.id) ? modules.filter((id) => id !== item.id) : [...modules, item.id] })} /></label>;
      })}
    </fieldset>}
    {isFunctional && (isStandings || query.widget === "relative") && <fieldset><legend>Pie de datos</legend><p className="functional-study-note">Datos bajo las filas, en orden de selección.</p>
      {FUNCTIONAL_STUDY_SLOTS.map((slot) => {
        const slots = query.slots ?? [];
        const on = slots.includes(slot.id);
        return <label key={slot.id} className="functional-study-toggle"><span>{slot.label}</span><input type="checkbox" checked={on} onChange={() => update({ ...query, slots: on ? slots.filter((id) => id !== slot.id) : [...slots, slot.id] })} /></label>;
      })}
    </fieldset>}

    {/* Laboratorio tower de Redline (ISA-1071): solo sobre los diseños Redline
        de standings Endurance — con otro diseño la selección no aplicaría. */}
    {query.widget === "standings" && query.system === "vantare-endurance" && (!query.designId || query.designId === "standings-endurance-redline" || query.designId === "standings-endurance-redline-tower") ? (
      <fieldset><legend>Redline · Estudio visual</legend>
        <button type="button" className="functional-study-play" onClick={() => update({
          ...query, designId: "standings-endurance-redline-tower", redlineTheme: "tower", redlineSelection: "glow", redlineHeader: "current", redlineOpacity: .95, redlineData: "reference", width: 482, height: 1087, scale: .65, state: "ready", sceneId: undefined, sceneFrame: undefined,
        })}>Aplicar estudio azul · luz roja</button>
        <Select label="Datos de comparación" value={query.redlineData ?? "telemetry"} onChange={(value) => update({ ...query, redlineData: value as OverlayWorkshopQuery["redlineData"] })}>
          <option value="reference">Referencia HTML · 12 pilotos de ejemplo</option><option value="telemetry">Escenario V2 · sin datos inventados</option>
        </Select>
        {query.redlineData === "reference" && query.state === "ready" && !query.sceneId && <p className="functional-study-note" role="note">REFERENCIA VISUAL: datos de ejemplo, no telemetría de LMU. Mismo renderer productivo. 482 × 1087 px.</p>}
        {query.redlineTheme === "tower" && <p className="functional-study-note">Copia estática del HTML. Las animaciones y columnas configurables de esta composición aún no están validadas.</p>}
        <Select label="Tratamiento" value={query.redlineTheme ?? "classic"} onChange={(value) => update({ ...query, redlineTheme: value as OverlayWorkshopQuery["redlineTheme"] })}>
          <option value="classic">Redline actual</option><option value="tower">Azul grafito</option>
        </Select>
        <Select label="Fila del jugador" value={query.redlineSelection ?? "legacy"} onChange={(value) => update({ ...query, redlineSelection: value as OverlayWorkshopQuery["redlineSelection"] })}>
          <option value="glow">Fila de luz roja · sin línea</option><option value="frame">Marco fino</option><option value="plate">Placa de nombre</option><option value="legacy">Resaltado actual</option>
        </Select>
        <Select label="Cabecera" value={query.redlineHeader ?? "current"} onChange={(value) => update({ ...query, redlineHeader: value as OverlayWorkshopQuery["redlineHeader"] })}>
          <option value="signature">Firma Redline</option><option value="session">Sesión protagonista</option><option value="compact">Marca compacta</option><option value="current">Cabecera actual</option>
        </Select>
        <label className="functional-study-toggle"><span>Opacidad del fondo · {Math.round((query.redlineOpacity ?? 1) * 100)}%</span><input aria-label="Opacidad del fondo" type="range" min="45" max="100" value={Math.round((query.redlineOpacity ?? 1) * 100)} onChange={(event) => update({ ...query, redlineOpacity: Number(event.target.value) / 100 })} /></label>
        <p className="functional-study-note">Variantes exploratorias. Sin guardar perfiles. El contrato actual no aporta emblemas de fabricante.</p>
      </fieldset>
    ) : null}

    <fieldset><legend>Animación</legend>
      {scenes.length === 0 ? <p className="functional-study-note">Este widget todavía no tiene animaciones declaradas.</p> : (
        <div className="functional-study-scene">
          <Select label="Escena" value={query.sceneId ?? ""} onChange={chooseScene}>
            <option value="">Sin animación</option>
            {scenes.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </Select>
          {query.sceneId && <button type="button" className="functional-study-play" onClick={() => onRunScene(query.sceneId!)} data-testid="workshop-scene-run">▶ Reproducir</button>}
        </div>
      )}
      {gaps.length > 0 && <div className="functional-study-gaps"><strong>Más de lo que llega en carrera.</strong><ul>{gaps.map((gap) => <li key={gap.field}><code>{gap.field}</code> — {gap.consequence}</li>)}</ul></div>}
    </fieldset>

    <fieldset><legend>Datos</legend>
      <Select label="Estado de la fuente" value={query.state} onChange={(value) => update({ ...query, state: value as OverlayWorkshopQuery["state"] })}>
        {STATE_OPTIONS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </Select>
      <Select label="Sesión" value={query.session} onChange={(value) => update({ ...query, session: value as OverlayWorkshopQuery["session"] })}>
        {SESSION_OPTIONS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </Select>
      <Select label="Ubicación" value={query.location} onChange={(value) => update({ ...query, location: value as OverlayWorkshopQuery["location"] })}>
        {LOCATION_OPTIONS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </Select>
    </fieldset>

    <fieldset><legend>Presentación</legend>
      <p className="functional-study-note">Fondo</p>
      <Segments options={BACKGROUND_OPTIONS} value={query.background} onChange={(value) => update({ ...query, background: value as OverlayWorkshopQuery["background"] })} />
      <Select label="Superficie" value={query.surface} onChange={(value) => update({ ...query, surface: value as OverlayWorkshopQuery["surface"] })}>
        {SURFACE_OPTIONS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </Select>
      <Select label="Comparar con" value={query.compare ?? ""} onChange={(value) => update({ ...query, ...(value ? { compare: value as OverlayWorkshopQuery["compare"] } : { compare: undefined }) })}>
        <option value="">Sin comparar</option>
        {SURFACE_OPTIONS.filter(([id]) => id !== query.surface).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </Select>
      <p className="functional-study-note">Escala</p>
      <Segments options={SCALE_OPTIONS} value={String(query.scale)} onChange={chooseScale} />
    </fieldset>

    <div className="functional-study-provenance"><span className="functional-study-dot" />Escenario de diseño<p>Datos de demostración. El widget usa el mismo componente que la aplicación.</p>
      <code className="functional-study-query" data-overlay-workshop-query>{serializeOverlayWorkshopQuery(query)}</code>
      <button type="button" className="functional-study-reset" onClick={onReset}>Restablecer selección</button>
    </div>
  </aside>;
}
