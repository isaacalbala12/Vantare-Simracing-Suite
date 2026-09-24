import { LMU_STEERING_WHEELS, normalizeSteeringWheel, STEERING_WHEEL_CATEGORIES } from "../design-systems/vantare-functional/steering-wheels/catalog";
import { useState } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import type { Locale } from "../../i18n/i18n";
import type { WidgetLayoutV3, WidgetType } from "../core/profile-document";
import { widgetTypeRegistry } from "../core/widget-registry";
import { designSystemRegistry } from "../core/design-system-registry";
import { listOfficialDesigns } from "../design-systems/official-designs";
import { listAnimationScenes } from "./fixtures/animation-scenes";
import { projectionGapsFor } from "./fixtures/projection-gaps";
import { serializeOverlayWorkshopQuery, type OverlayWorkshopQuery } from "./overlay-workshop-query";
import { FUNCTIONAL_STUDY_DEFAULT_MODULES, FUNCTIONAL_STUDY_MODULES, FUNCTIONAL_STUDY_SLOTS, FUNCTIONAL_STUDY_STYLES } from "./functional-study-options";
import { RELATIVE_RANGE_AHEAD, RELATIVE_RANGE_BEHIND, RELATIVE_RANGE_LIMIT } from "../widget-types/relative/relative-content";
import { STANDINGS_ROW_COUNT_OPTIONS } from "../widget-types/standings/standings-content";
import { STANDINGS_WINDOW_AROUND_OPTIONS, STANDINGS_WINDOW_DEFAULT_AROUND } from "../widget-types/standings/standings-window";
import { RACING_FLAGS_DEFAULT_TEXT_COLOR, RACING_FLAGS_WHITE_FLAG_TEXT_COLOR } from "../design-systems/vantare-functional/racing-flags-settings";
import { PEDALS_KNOWN_FLAGS, type PedalsKnownFlag } from "../widget-types/pedals/pedals-view-model";

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
  "broadcast-tower": "Horizontal Standings",
  "fuel-strategy": "Fuel Strategy",
  "pedals-telemetry": "Pedales avanzados",
  "pedals-telemetry-compact": "Pedales antiguos",
  "racing-flags": "Racing Flags",
  "fastest-lap": "Vuelta rápida",
};
const widgetLabel = (widget: WidgetType) => WIDGET_LABELS[widget] ?? widget;

// Cada widget aterriza en la variante canónica `default`; la escena de Delta
// se conserva porque es parte del estudio del diseño, no una variante visual.
const STUDY_LANDING: Partial<Record<WidgetType, Pick<OverlayWorkshopQuery, "variant" | "sceneId" | "sceneFrame" | "studyStyle" | "around">>> = {
  standings: { variant: "default", studyStyle: "default", around: STANDINGS_WINDOW_DEFAULT_AROUND },
  relative: { variant: "default" },
  delta: { variant: "default", sceneId: "delta-cross-zero", sceneFrame: 2 },
  pedals: { variant: "default" },
};

const STATE_OPTIONS = [["ready", "Recibiendo"], ["stale", "Datos antiguos"], ["disconnected", "Desconectado"], ["error", "Error"]] as const;
const SESSION_OPTIONS = [["practice", "Práctica"], ["qualifying", "Clasificación"], ["race", "Carrera"]] as const;
const STANDINGS_SCOPE_OPTIONS = [["default", "Normal"], ["standings-multiclass", "Multiclass"]] as const;
const LOCATION_OPTIONS = [["track", "Pista"], ["pits", "Boxes"]] as const;
const NAME_FORMAT_OPTIONS = [["full", "Completo"], ["initial", "N. Apellido"], ["surname", "Apellido"]] as const;
const BACKGROUND_OPTIONS = [["context", "Mixto"], ["solid", "Oscuro"], ["transparent", "Claro"]] as const;
const SURFACE_OPTIONS = [["studio", "Studio"], ["desktop", "Desktop"], ["obs", "OBS"], ["harness", "Harness"]] as const;
const SCALE_OPTIONS = [["0.5", "0.5×"], ["1", "1×"], ["1.5", "1.5×"], ["2", "2×"]] as const;
const RELATIVE_RANGE_OPTIONS = Array.from({ length: RELATIVE_RANGE_LIMIT + 1 }, (_, index) => [String(index), String(index)] as const);
const STUDY_STYLE_OPTIONS = FUNCTIONAL_STUDY_STYLES.map(({ id, label }) => [id, label] as const);
const STANDINGS_WINDOW_OPTIONS = STANDINGS_WINDOW_AROUND_OPTIONS.map((count) => [String(count), String(count)] as const);
const FLAG_OPTIONS = PEDALS_KNOWN_FLAGS.map((flag) => [flag, flag === "yellow" ? "Amarilla" : flag === "green" ? "Verde" : flag === "blue" ? "Azul" : flag === "red" ? "Roja" : flag === "white" ? "Blanca" : flag === "black" ? "Negra" : "A cuadros"] as const);

// Resolución de la previsualización del harness: el widget/profile mantiene
// siempre su layout real; estos valores solo fijan el tamaño exterior de la
// preview para poder juzgar cómo se comporta en una superficie concreta.
const PRESET_DIMENSIONS: Record<OverlayWorkshopQuery["preset"], readonly [number, number]> = {
  "720p": [1280, 720],
  "1080p": [1920, 1080],
  "1440p": [2560, 1440],
};
const DIMENSION_LIMITS = { width: [64, 3840], height: [64, 2160] } as const;

function Select(props: { label: string; value: string; onChange(value: string): void; children: React.ReactNode }) {
  return <label className="functional-study-select"><span>{props.label}</span><select value={props.value} onChange={(event) => props.onChange(event.target.value)}>{props.children}</select></label>;
}

function Segments(props: { options: readonly (readonly [string, string])[]; value: string; onChange(value: string): void }) {
  return <div className="functional-study-segments">{props.options.map(([id, label]) => <button type="button" key={id} aria-pressed={props.value === id} onClick={() => props.onChange(id)}>{label}</button>)}</div>;
}

export function FunctionalStudyControls({ query, widgetLayout, update, onRunScene, onShowDesign, onReset }: {
  query: OverlayWorkshopQuery;
  widgetLayout?: Pick<WidgetLayoutV3, "w" | "h">;
  update: (query: OverlayWorkshopQuery) => void;
  onRunScene: (sceneId: string) => void;
  onShowDesign?: () => void;
  onReset: () => void;
}) {
  const { locale, setLocale, options } = useI18n();
  const systems = designSystemRegistry
    .list()
    .filter((system) => system.widgets.some((entry) => entry.widgetType === query.widget))
    .map((system) => system.id);
  const designs = listOfficialDesigns(query.widget).filter((design) => design.systemId === query.system);
  const defaultDesign = designs.find((design) => design.isDefault) ?? designs[0];
  // Cada variante declarada pertenece a un widget por su prefijo; el resto
  // produciría una query inválida.
  const scenes = listAnimationScenes(query.widget, query.system, query.session);
  const selectedScene = scenes.find((item) => item.id === query.sceneId);
  const gaps = projectionGapsFor(query.widget);
  const isFunctional = query.system === "vantare-functional";
  const isStandings = query.widget === "standings";
  const isFastestLap = query.widget === "fastest-lap";
  const dimensionLimits = isFastestLap ? { width: [280, 3840], height: [72, 2160] } : DIMENSION_LIMITS;
  const isRacingFlags = query.widget === "racing-flags";
  const isFlagWidget = query.widget === "pedals" || isRacingFlags;
  const defaultStandingRows = isFunctional
    ? query.variant === "standings-functional-study" ? 15 : 10
    : 20;
  // Las fixtures de desarrollo siguen siendo útiles para pruebas internas,
  // pero el Workshop público tiene una única variante canónica.
  const displayedVariant = "default";

  const chooseWidget = (widget: WidgetType) => {
    const nextSystems = designSystemRegistry.list().filter((system) => system.widgets.some((entry) => entry.widgetType === widget)).map((system) => system.id);
    const system = nextSystems.includes(query.system) ? query.system : nextSystems[0]!;
    const landing = STUDY_LANDING[widget] ?? { variant: "default" as const };
    update({
      ...query,
      widget,
      system,
      designId: undefined,
      studyStyle: undefined,
      around: undefined,
      sceneId: undefined,
      sceneFrame: undefined,
      // La ventana del relative no existe en otros widgets; no la arrastramos.
      ahead: undefined,
      behind: undefined,
      // El recuento de filas solo existe en standings.
      ...(widget === "standings" ? {} : { rows: undefined, playerPosition: undefined }),
      // El formato de nombre solo existe donde hay columna Piloto.
      ...(widget === "standings" || widget === "relative" ? {} : { nameFormat: undefined }),
      ...(widget === "racing-flags" ? {} : { textColor: undefined }),
      ...(widget === "pedals-telemetry" ? {} : { steeringWheel: undefined }),
      ...(widget === "pedals" || widget === "racing-flags" ? {} : { flag: undefined }),
      // Las dimensiones de preview pertenecen al widget anterior; al cambiar
      // de widget se vuelve a la resolución real del nuevo profile/layout.
      width: undefined,
      height: undefined,
      ...landing,
    });
  };
  const chooseSystem = (system: string) => {
    const nextSystem = system as OverlayWorkshopQuery["system"];
    const keepsDefaultWindow = nextSystem === "vantare-functional" && isStandings;
    const sceneId = listAnimationScenes(query.widget, nextSystem, query.session).some((scene) => scene.id === query.sceneId)
      ? query.sceneId
      : undefined;
    return update({
      ...query,
      system: nextSystem,
      sceneId,
      sceneFrame: sceneId ? query.sceneFrame : undefined,
      designId: undefined,
      studyStyle: keepsDefaultWindow ? "default" : undefined,
      around: keepsDefaultWindow ? query.around ?? STANDINGS_WINDOW_DEFAULT_AROUND : undefined,
      variant: "default",
      textColor: undefined,
      steeringWheel: undefined,
    });
  };
  const chooseDesign = (value: string) => update({ ...query, designId: value || undefined });
  const chooseScene = (value: string) => update({ ...query, sceneId: value || undefined, sceneFrame: value ? 0 : undefined });
  const chooseScale = (value: string) => update({ ...query, scale: Number(value) });
  const chooseStandingsScope = (value: string) => update({
    ...query,
    variant: value as OverlayWorkshopQuery["variant"],
    designId: undefined,
    studyStyle: query.studyStyle ?? "default",
    around: (query.studyStyle ?? "default") === "default"
      ? query.around ?? STANDINGS_WINDOW_DEFAULT_AROUND
      : undefined,
  });
  const chooseStudyStyle = (value: string) => {
    const studyStyle = value as OverlayWorkshopQuery["studyStyle"];
    return update({
      ...query,
      studyStyle,
      around: studyStyle === "default"
        ? query.around ?? STANDINGS_WINDOW_DEFAULT_AROUND
        : undefined,
    });
  };
  const chooseFlag = (value: string) => update({
    ...query,
    flag: value as PedalsKnownFlag,
    ...(value === "white" && query.textColor === RACING_FLAGS_DEFAULT_TEXT_COLOR ? { textColor: undefined } : {}),
  });
  const defaultRacingFlagsTextColor = query.flag === "white"
    ? RACING_FLAGS_WHITE_FLAG_TEXT_COLOR
    : RACING_FLAGS_DEFAULT_TEXT_COLOR;
  const selectedStudyStyle = query.studyStyle ?? "default";
  const isDefaultStandingsStudy = isFunctional && isStandings && selectedStudyStyle === "default";

  const resolvedWidth = isFastestLap ? Math.max(280, query.width ?? widgetLayout?.w ?? 480) : query.width ?? widgetLayout?.w;
  const resolvedHeight = isFastestLap ? Math.max(72, query.height ?? widgetLayout?.h ?? 104) : query.height ?? widgetLayout?.h;

  // Borradores de texto para ancho/alto: la query solo se reescribe cuando las
  // dos dimensiones son enteros dentro de rango — una URL a medias sería
  // inválida al compartirla (el parser exige width y height a la vez).
  const [dimensionDraft, setDimensionDraft] = useState({
    width: resolvedWidth?.toString() ?? "",
    height: resolvedHeight?.toString() ?? "",
  });
  // Si el tamaño cambia desde fuera (preset aplicado, Restablecer, un
  // aterrizaje de widget o el layout real de otra fixture) el borrador refleja
  // la resolución efectiva. Los cambios propios ya dejaron marca en appliedSize.
  const [appliedSize, setAppliedSize] = useState<{ width?: number; height?: number }>({ width: resolvedWidth, height: resolvedHeight });
  if (appliedSize.width !== resolvedWidth || appliedSize.height !== resolvedHeight) {
    setAppliedSize({ width: resolvedWidth, height: resolvedHeight });
    setDimensionDraft({ width: resolvedWidth?.toString() ?? "", height: resolvedHeight?.toString() ?? "" });
  }
  const chooseDimension = (field: "width" | "height", value: string) => {
    const next = { ...dimensionDraft, [field]: value };
    setDimensionDraft(next);
    const width = Number(next.width);
    const height = Number(next.height);
    const widthValid = next.width !== "" && Number.isInteger(width) && width >= dimensionLimits.width[0] && width <= dimensionLimits.width[1];
    const heightValid = next.height !== "" && Number.isInteger(height) && height >= dimensionLimits.height[0] && height <= dimensionLimits.height[1];
    if (widthValid && heightValid) {
      setAppliedSize({ width, height });
      update({ ...query, width, height });
    }
  };
  const applyPreset = () => {
    const [width, height] = PRESET_DIMENSIONS[query.preset];
    setDimensionDraft({ width: String(width), height: String(height) });
    setAppliedSize({ width, height });
    update({ ...query, width, height });
  };

  const dimensionInputs = <>
      <label className="functional-study-select"><span>Ancho</span><input type="number" min={dimensionLimits.width[0]} max={dimensionLimits.width[1]} step={1} value={dimensionDraft.width} onChange={(event) => chooseDimension("width", event.target.value)} /></label>
      <label className="functional-study-select"><span>Alto</span><input type="number" min={dimensionLimits.height[0]} max={dimensionLimits.height[1]} step={1} value={dimensionDraft.height} onChange={(event) => chooseDimension("height", event.target.value)} /></label>
  </>;

  return <aside className="functional-study-controls" aria-label={`Diseño de ${query.widget}`}>
    <div className="functional-study-title"><span>VANTARE / WORKSHOP</span><h1>{systemLabel(query.system)}.</h1><p>{widgetLabel(query.widget)} · Sistema {systemLabel(query.system)}</p></div>

    <fieldset><legend>Idioma del widget</legend>
      <Select label="Idioma" value={locale} onChange={(value) => setLocale(value as Locale)}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </Select>
      <p className="functional-study-note">Demostración en este navegador. Si se abre desde otro origen, la preferencia se guarda por separado.</p>
    </fieldset>

    <fieldset><legend>Widget</legend>
      <Select label="Widget" value={query.widget} onChange={(value) => chooseWidget(value as WidgetType)}>
        {widgetTypeRegistry.get(query.widget).retired && <option value={query.widget} disabled>{widgetLabel(query.widget)}</option>}
        {widgetTypeRegistry.list().filter((definition) => !definition.retired).map(({ type }) => <option key={type} value={type}>{widgetLabel(type)}</option>)}
      </Select>
      {widgetTypeRegistry.get(query.widget).retired && <p className="functional-study-note">Vista de compatibilidad de un widget retirado. Para nuevos diseños, elige Pedales avanzados.</p>}
      <Select label="Sistema de diseño" value={query.system} onChange={chooseSystem}>
        {systems.map((system) => <option key={system} value={system}>{systemLabel(system)}</option>)}
      </Select>
      {/* En Eficiencia el diseño se elige en "Estilo" (segmentos); el select
          solo aparece para los sistemas con catálogo largo. Siempre hay un
          diseño concreto — no existe el "renderer sin diseño". */}
      {!isFunctional && designs.length > 0 && <Select label="Diseño" value={query.designId ?? defaultDesign?.id ?? ""} onChange={chooseDesign}>
        {designs.map((design) => <option key={design.id} value={design.id}>{design.name}</option>)}
      </Select>}
      <p className="functional-study-note">Fixture: {displayedVariant}</p>
    </fieldset>

    {isFastestLap && <fieldset><legend>Tamaño del widget</legend>
      {dimensionInputs}
      <p className="functional-study-note">Ancho y alto en píxeles. El panel se adapta al tamaño real sin deformar el texto.</p>
    </fieldset>}

    <fieldset><legend>Sesión</legend>
      <Segments options={SESSION_OPTIONS} value={query.session} onChange={(value) => update({ ...query, session: value as OverlayWorkshopQuery["session"] })} />
    </fieldset>

    {isFunctional && !isStandings && designs.length > 1 && <fieldset><legend>{query.widget === "pedals" ? "Presentación" : "Estilo"}</legend><div className="functional-study-segments">{designs.map((design) => <button type="button" key={design.id} aria-pressed={(query.designId ?? defaultDesign?.id) === design.id} onClick={() => update({ ...query, designId: design.id })}>{design.name}</button>)}</div></fieldset>}
    {isFunctional && query.widget !== "relative" && <fieldset><legend>Marca</legend><div className="functional-study-segments">
      <button type="button" aria-pressed={query.brand !== "off"} onClick={() => update({ ...query, brand: undefined })}>Con marca</button>
      <button type="button" aria-pressed={query.brand === "off"} onClick={() => update({ ...query, brand: "off" })}>Sin marca</button>
    </div></fieldset>}
    {isFunctional && isStandings && <fieldset><legend>Dirección v2</legend>
      <Segments options={STUDY_STYLE_OPTIONS} value={selectedStudyStyle} onChange={chooseStudyStyle} />
    </fieldset>}
    {isFunctional && isStandings && <fieldset><legend>Clasificación</legend>
      <Segments options={STANDINGS_SCOPE_OPTIONS} value={query.variant === "standings-multiclass" ? "standings-multiclass" : "default"} onChange={chooseStandingsScope} />
    </fieldset>}
    {isStandings && <fieldset><legend>Filas</legend><p className="functional-study-note">{isDefaultStandingsStudy ? "Pilotos totales; Default muestra el podio y la ventana alrededor del jugador." : "Pilotos visibles; la caja se adapta al recuento."}</p>
      <Select label={isDefaultStandingsStudy ? "Pilotos totales" : "Pilotos"} value={String(query.rows ?? defaultStandingRows)} onChange={(value) => {
        const rows = Number(value);
        update({ ...query, rows, playerPosition: Math.min(query.playerPosition ?? 1, rows) });
      }}>
        {STANDINGS_ROW_COUNT_OPTIONS.map((count) => <option key={count} value={count}>{count}</option>)}
      </Select>
      {isFunctional && <Select label="Posición del jugador" value={String(query.playerPosition ?? 1)} onChange={(value) => update({ ...query, playerPosition: Number(value) })}>
        {STANDINGS_ROW_COUNT_OPTIONS.map((position) => <option key={position} value={position} disabled={position > (query.rows ?? defaultStandingRows)}>{position}</option>)}
      </Select>}
      {isDefaultStandingsStudy && <Select label="Pilotos alrededor" value={String(query.around ?? STANDINGS_WINDOW_DEFAULT_AROUND)} onChange={(value) => update({ ...query, around: Number(value) as OverlayWorkshopQuery["around"] })}>
        {STANDINGS_WINDOW_OPTIONS.map(([count, label]) => <option key={count} value={count}>{label}</option>)}
      </Select>}
    </fieldset>}
    {isFunctional && isStandings && <fieldset><legend>Módulos</legend><p className="functional-study-note">Posición y piloto siempre visibles.</p>
      {FUNCTIONAL_STUDY_MODULES.map((item) => {
        const modules = query.modules ?? (query.variant === "standings-functional-study"
          ? FUNCTIONAL_STUDY_DEFAULT_MODULES
          : ["gap", query.session === "race" ? "lastLap" : "bestLap", "pit"]);
        return <label key={item.id} className="functional-study-toggle"><span>{item.label}</span><input type="checkbox" checked={modules.includes(item.id)} onChange={() => update({ ...query, modules: modules.includes(item.id) ? modules.filter((id) => id !== item.id) : [...modules, item.id] })} /></label>;
      })}
    </fieldset>}
    {query.widget === "relative" && <fieldset><legend>Ventana</legend><p className="functional-study-note">Pilotos por delante y por detrás del jugador; la caja se adapta a las filas.</p>
      <p className="functional-study-note">Delante</p>
      <Segments options={RELATIVE_RANGE_OPTIONS} value={String(query.ahead ?? RELATIVE_RANGE_AHEAD)} onChange={(value) => update({ ...query, ahead: Number(value) })} />
      <p className="functional-study-note">Detrás</p>
      <Segments options={RELATIVE_RANGE_OPTIONS} value={String(query.behind ?? RELATIVE_RANGE_BEHIND)} onChange={(value) => update({ ...query, behind: Number(value) })} />
    </fieldset>}
    {(isStandings || query.widget === "relative") && <fieldset><legend>Nombre</legend>
      <Segments options={NAME_FORMAT_OPTIONS} value={query.nameFormat ?? "full"} onChange={(value) => update({ ...query, nameFormat: value === "full" ? undefined : value as OverlayWorkshopQuery["nameFormat"] })} />
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
          <Select label="Escena" value={selectedScene?.id ?? ""} onChange={chooseScene}>
            <option value="">Sin animación</option>
            {scenes.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </Select>
          {selectedScene && <button type="button" className="functional-study-play" onClick={() => onRunScene(selectedScene.id)} data-testid="workshop-scene-run">▶ Reproducir</button>}
          {isFastestLap && onShowDesign && <button type="button" className="functional-study-play" onClick={onShowDesign}>Ver diseño</button>}
        </div>
      )}
      {gaps.length > 0 && <div className="functional-study-gaps"><strong>Más de lo que llega en carrera.</strong><ul>{gaps.map((gap) => <li key={gap.field}><code>{gap.field}</code> — {gap.consequence}</li>)}</ul></div>}
    </fieldset>

    <fieldset><legend>Datos</legend>
      {isFlagWidget && <Select label="Bandera" value={query.flag ?? "green"} onChange={chooseFlag}>
        {FLAG_OPTIONS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </Select>}
      <Select label="Estado de la fuente" value={query.state} onChange={(value) => update({ ...query, state: value as OverlayWorkshopQuery["state"] })}>
        {STATE_OPTIONS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </Select>
      <Select label="Ubicación" value={query.location} onChange={(value) => update({ ...query, location: value as OverlayWorkshopQuery["location"] })}>
        {LOCATION_OPTIONS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </Select>
    </fieldset>

    <fieldset><legend>Presentación</legend>
      {isFunctional && query.widget === "pedals-telemetry" && <Select label="Volante" value={query.steeringWheel ?? "generic"} onChange={(value) => update({ ...query, steeringWheel: normalizeSteeringWheel(value) })}>
        <option value="generic">Genérico</option>
        {STEERING_WHEEL_CATEGORIES.map((category) => <optgroup key={category} label={category}>
          {LMU_STEERING_WHEELS.filter((wheel) => wheel.category === category).map((wheel) => <option key={wheel.id} value={wheel.id}>{wheel.name}</option>)}
        </optgroup>)}
      </Select>}
      {isFunctional && isRacingFlags && <label className="functional-study-select"><span>Color de la letra</span><input aria-label="Color de la letra" type="color" value={query.textColor ?? defaultRacingFlagsTextColor} onChange={(event) => update({ ...query, textColor: event.target.value })} /></label>}
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
      {!isFastestLap && <>
      <p className="functional-study-note">La resolución real del widget es la base; ancho y alto solo cambian la previsualización del harness.</p>
      {/* El preview se declara por preset (720p/1080p/1440p) o por ancho/alto
          libres, sin modificar el layout productivo del widget. */}
      <Select label="Resolución" value={query.preset} onChange={(value) => update({ ...query, preset: value as OverlayWorkshopQuery["preset"] })}>
        {(Object.keys(PRESET_DIMENSIONS) as OverlayWorkshopQuery["preset"][]).map((preset) => {
          const [width, height] = PRESET_DIMENSIONS[preset];
          return <option key={preset} value={preset}>{preset} · {width}×{height}</option>;
        })}
      </Select>
      {dimensionInputs}
      <button type="button" className="functional-study-play functional-study-apply" onClick={applyPreset}>Aplicar tamaño declarado</button>
      </>}
    </fieldset>

    <div className="functional-study-provenance"><span className="functional-study-dot" />Escenario de diseño<p>Datos de demostración. El widget usa el mismo componente que la aplicación.</p>
      <code className="functional-study-query" data-overlay-workshop-query>{serializeOverlayWorkshopQuery(query)}</code>
      <button type="button" className="functional-study-reset" onClick={onReset}>Restablecer selección</button>
    </div>
  </aside>;
}
