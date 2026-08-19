import { StrictMode, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./ui-orbit-harness.css";
import { initializeDensity } from "./lib/density";
import { applyTheme, type VantareTheme } from "./lib/theme";
import orbitThemeJson from "./themes/vantare-orbit.json";
import {
  Accordion,
  AvailabilityBoard,
  Button,
  Check,
  Chip,
  CornerSlot,
  CountdownDial,
  Donut,
  Dot,
  Fader,
  Featured,
  Field,
  HorizontalTimeline,
  IconButton,
  Input,
  Kbd,
  KeycapRow,
  ListRow,
  Menu,
  MiniStage,
  Monogram,
  Note,
  Pill,
  Seg,
  Select,
  StatRow,
  StatTile,
  StateChip,
  SubtleStatus,
  Surface,
  Textarea,
  ToastProvider,
  Toggle,
  Tooltip,
  Trace,
  TrackMap,
  TyreChip,
  TyreItem,
  UnderlineTabs,
  useToast,
  type TyreView,
} from "./ui/orbit";
import {
  HARNESS_BANDS,
  HARNESS_CORNERS,
  HARNESS_DELTA,
  HARNESS_DRIVERS,
  HARNESS_MINE,
  HARNESS_RANGES,
  HARNESS_REF,
  HARNESS_SEGMENTS,
  HARNESS_TRACK,
  HARNESS_TYRES,
  HARNESS_WIDGETS,
} from "./ui-orbit-harness-fixtures";
import { buildMockTelemetry } from "./overlay/core/mock-scenarios";
import type { WidgetType } from "./overlay/core/profile-document";
import { widgetTypeRegistry } from "./overlay/core/widget-registry";
import { WidgetVisualHost } from "./overlay/core/WidgetVisualHost";
import { WidgetVisualViewport } from "./overlay/core/WidgetVisualViewport";

/**
 * Harness visual del kit Orbit (briefing 02, partes A y B).
 *
 * Muestra cada componente de los cuatro grupos del briefing (primitivos,
 * estado, contenedores y visualización) en todos los estados que pide el
 * criterio de aceptación.
 */
applyTheme(orbitThemeJson as unknown as VantareTheme);
initializeDensity();

function Group({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="ok-group" data-group={id}>
      <h2>{title}</h2>
      <div className="ok-group__body">{children}</div>
    </section>
  );
}

function Bench({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="ok-bench">
      <span className="ok-bench__label">{label}</span>
      <div className="ok-bench__row">{children}</div>
    </div>
  );
}

/** 14 opciones: la lista desborda su altura máxima y aparece la barra. */
const TRACK_OPTIONS = [
  { value: "spa", label: "Spa-Francorchamps" },
  { value: "monza", label: "Monza" },
  { value: "sebring", label: "Sebring" },
  { value: "lemans", label: "Le Mans" },
  { value: "imola", label: "Imola" },
  { value: "bathurst", label: "Bathurst" },
  { value: "suzuka", label: "Suzuka" },
  { value: "interlagos", label: "Interlagos" },
  { value: "nurburgring", label: "Nürburgring" },
  { value: "silverstone", label: "Silverstone" },
  { value: "daytona", label: "Daytona" },
  { value: "watkins", label: "Watkins Glen" },
  { value: "road-america", label: "Road America" },
  { value: "laguna", label: "Laguna Seca" },
];

function Primitives() {
  const [seg, setSeg] = useState("mock");
  const [wide, setWide] = useState("a");
  const [on, setOn] = useState(true);
  const [off, setOff] = useState(false);
  const [text, setText] = useState("Vantare");
  const [num, setNum] = useState("42");
  const [sel, setSel] = useState("crystal");
  // Lista larga: el único sitio del kit donde el desplegable llega a desbordar,
  // que es justo donde asomaba la barra gris del sistema (política de scroll).
  const [track, setTrack] = useState("spa");
  const [check, setCheck] = useState(true);
  const [area, setArea] = useState("Notas del ingeniero.");

  return (
    <Group id="primitivos" title="1 · Primitivos">
      <Bench label="Botones">
        <Button variant="primary">Primario</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Peligro</Button>
        <Button size="sm" variant="ghost">
          Pequeño
        </Button>
        <Button icon="i-studio" variant="ghost">
          Con icono
        </Button>
        <Button disabled variant="primary">
          Deshabilitado
        </Button>
        <Button loading variant="ghost">
          Cargando
        </Button>
      </Bench>
      <Bench label="Botones de estado">
        <Button state="idle" variant="ghost">
          Abrir overlay
        </Button>
        <Button state="running" variant="ghost">
          En directo
        </Button>
        <Button state="dirty" variant="ghost">
          Guardar
        </Button>
        <Button state="saved" variant="ghost">
          Guardado
        </Button>
      </Bench>
      <Bench label="Icon buttons">
        <IconButton icon="i-ajustes" label="Ajustes" size={39} />
        <IconButton icon="i-panel" label="Columna" on size={39} />
        <IconButton icon="i-comando" label="Paleta" size={28} />
        <IconButton icon="i-lock" label="Quitar" size={28} tone="danger" />
      </Bench>
      <Bench label="Segmentado">
        <Seg
          label="Fuente de datos"
          onChange={setSeg}
          options={[
            { value: "mock", label: "Mock" },
            { value: "live", label: "Live" },
            { value: "rec", label: "Grabado", disabled: true },
          ]}
          value={seg}
        />
        <div className="ok-seg-wide">
          <Seg
            label="Comparación"
            onChange={setWide}
            options={[
              { value: "a", label: "A" },
              { value: "b", label: "B" },
              { value: "cmp", label: "Comparar" },
            ]}
            value={wide}
            wide
          />
        </div>
      </Bench>
      <Bench label="Toggles">
        <Toggle label="Mostrar rejilla" onChange={setOn} pressed={on} />
        <Toggle label="Modo depuración" onChange={setOff} pressed={off} />
        <Toggle disabled label="Bloqueado" onChange={() => {}} pressed={false} />
      </Bench>
      <Bench label="Casillas">
        <Check checked={check} label="Adjuntar diagnóstico" onChange={setCheck}>
          <b>Adjuntar diagnóstico</b>
          <span>Versión, canal y estado del simulador</span>
        </Check>
        <Check checked={false} disabled label="Adjuntar replay">
          <b>Adjuntar replay</b>
          <span>No disponible todavía</span>
        </Check>
      </Bench>
      <Bench label="Campos">
        <Field htmlFor="ok-input" label="Nombre del perfil">
          <Input id="ok-input" onChange={(event) => setText(event.target.value)} value={text} />
        </Field>
        <Field htmlFor="ok-num" label="Opacidad">
          <Input
            id="ok-num"
            numeric
            onChange={(event) => setNum(event.target.value)}
            unit="%"
            value={num}
          />
        </Field>
        <Field htmlFor="ok-select" label="Sistema">
          <Select
            id="ok-select"
            label="Sistema"
            onChange={setSel}
            options={[
              { value: "crystal", label: "Crystal", group: "Vantare" },
              { value: "original", label: "Original", group: "Vantare" },
              { value: "endurance", label: "Endurance", group: "Vantare" },
              { value: "neo", label: "Neo", group: "Míos" },
              { value: "carbon", label: "Carbon", disabled: true, group: "Míos" },
            ]}
            value={sel}
            width={195}
          />
        </Field>
        <Field htmlFor="ok-select-long" label="Circuito">
          <Select
            id="ok-select-long"
            label="Circuito"
            onChange={setTrack}
            options={TRACK_OPTIONS}
            value={track}
            width={195}
          />
        </Field>
      </Bench>
      <Bench label="Campo en fila y textarea">
        <Field hint="Se aplica al reiniciar" htmlFor="ok-row" label="Arranque automático" row>
          <Toggle label="Arranque automático" onChange={setOff} pressed={off} />
        </Field>
        <Textarea
          aria-label="Notas"
          onChange={(event) => setArea(event.target.value)}
          value={area}
        />
      </Bench>
      <Bench label="Keycaps">
        <Kbd keys={["Ctrl", "K"]} />
        <Kbd keys={["Ctrl", "Shift", "V"]} physical />
        <Kbd empty keys={["sin asignar"]} physical />
        <Kbd conflict keys={["Ctrl", "S"]} physical />
      </Bench>
    </Group>
  );
}

function StateGroup() {
  return (
    <Group id="estado" title="2 · Estado y metadatos">
      <Bench label="Pills">
        <Pill dot="ok" state="connected">
          LMU conectado
        </Pill>
        <Pill dot="ring" pulse state="searching">
          Buscando simulador
        </Pill>
        <Pill dot="ring" state="disconnected">
          Sin simulador
        </Pill>
        <Pill dot="gold" onClick={() => {}} state="ready" title="Actualización lista">
          v0.4.0 lista
        </Pill>
        <Pill dot="ring-gold">Plan Pro</Pill>
      </Bench>
      <Bench label="Chips de licencia">
        <Chip tier="bronze">Bronze</Chip>
        <Chip tier="silver">Silver</Chip>
        <Chip tier="gold">Gold</Chip>
        <Chip caseNormal icon="i-studio">
          Setup guardado
        </Chip>
        <Chip tone="ok">Al día</Chip>
      </Bench>
      <Bench label="State chips y estados sutiles">
        <StateChip state="ok">Activo</StateChip>
        <StateChip state="draft">Borrador</StateChip>
        <StateChip state="warn">Caducado</StateChip>
        <SubtleStatus>Sin cambios</SubtleStatus>
        <SubtleStatus tone="attn">Requiere atención</SubtleStatus>
        <SubtleStatus tone="ok">Sincronizado</SubtleStatus>
      </Bench>
      <Bench label="Puntos y neumáticos">
        <Dot variant="ok" />
        <Dot variant="gold" />
        <Dot variant="ring" />
        <Dot variant="ring-gold" />
        <Dot tier="bronze" />
        <Dot tier="silver" />
        <Dot tier="gold" />
        <TyreChip compound="soft" />
        <TyreChip compound="medium" />
        <TyreChip compound="hard" />
      </Bench>
      <Bench label="Stat tiles">
        <div className="ok-stats">
          <StatRow>
            <StatTile label="Vueltas" sub="Sesión actual" value="38" />
            <StatTile label="Mejor vuelta" sub="Sector 2 en verde" tone="ok" value="1:34.812" />
            <StatTile label="Temperatura" tone="hot" unit="°C" value="112" />
            <StatTile label="Combustible" sub="Restante" unit="L" value="24.5" />
          </StatRow>
        </div>
      </Bench>
      <Bench label="Nota">
        <Note title="Datos provisionales.">
          El calendario todavía sale de un fixture: las horas son reales, los pilotos no.
        </Note>
      </Bench>
    </Group>
  );
}

function Containers() {
  const [tab, setTab] = useState("resumen");
  const toast = useToast();

  return (
    <Group id="contenedores" title="3 · Contenedores">
      <Bench label="Surface y featured">
        <div className="ok-two">
          <Surface actions={<Button size="sm">Ver todo</Button>} meta="12 activos" title="Perfiles">
            <p className="ok-copy">Cuerpo de la superficie con cabecera completa.</p>
          </Surface>
          <Featured interactive>
            <b className="ok-featured-title">Command Orbit</b>
            <span className="ok-copy">Superficie destacada con borde degradado carmín.</span>
          </Featured>
        </div>
      </Bench>
      <Bench label="Filas de lista">
        <div className="ok-rows">
          <ListRow
            leading={<Monogram g1="#4a4a52" g2="#232328" size={32} text="LMU" />}
            subtitle="Le Mans Ultimate"
            title="Perfil de resistencia"
            trailing={<Chip tier="gold">Gold</Chip>}
          />
          <ListRow
            leading={<Dot tier="silver" />}
            selected
            subtitle="Seleccionada"
            title="Fila seleccionada"
            trailing={<span className="ok-mono">21:30</span>}
          />
          <ListRow
            leading={<Dot variant="ok" />}
            next
            subtitle="Próxima salida"
            title="Spa · 6 h"
            trailing={<span className="ok-mono">en 02:14</span>}
          />
        </div>
      </Bench>
      <Bench label="Monogramas 26–60">
        <Monogram g1="#ff6a5f" g2="#641526" size={26} text="26" />
        <Monogram g1="#ff6a5f" g2="#641526" size={32} text="32" />
        <Monogram g1="#ff6a5f" g2="#641526" size={39} text="39" />
        <Monogram g1="#ff6a5f" g2="#641526" size={46} text="46" />
        <Monogram g1="#ff6a5f" g2="#641526" size={52} text="52" />
        <Monogram g1="#ff6a5f" g2="#641526" size={60} text="60" />
      </Bench>
      <Bench label="Menú, acordeón y pestañas">
        <div className="ok-menu-host">
          <Menu
            items={[
              { id: "dup", title: "Duplicar perfil", description: "Crea una copia editable", onSelect: () => {} },
              { id: "exp", title: "Exportar", description: "Archivo .vantare", onSelect: () => {} },
              { id: "del", title: "Eliminar", description: "No se puede deshacer", onSelect: () => {} },
            ]}
            label="Acciones del perfil"
            trigger={<IconButton icon="i-ajustes" label="Acciones del perfil" size={39} />}
          />
        </div>
        <div className="ok-acc">
          <Accordion open summary="16 px · centrado" title="Tipografía">
            <p className="ok-copy">Acordeón abierto con resumen mono a la derecha.</p>
          </Accordion>
          <Accordion summary="3 capas" title="Capas">
            <p className="ok-copy">Acordeón cerrado.</p>
          </Accordion>
        </div>
        <UnderlineTabs
          label="Secciones del evento"
          onChange={setTab}
          tabs={[
            { id: "resumen", label: "Resumen" },
            { id: "stints", label: "Stints" },
            { id: "pilotos", label: "Pilotos" },
          ]}
          value={tab}
        />
      </Bench>
      <Bench label="Toasts y tooltip">
        <Button
          onClick={() => {
            toast.show("Perfil guardado", "Overlay de resistencia");
            toast.show("Overlay abierto", "Pantalla 2");
            toast.show("Actualización lista", "v0.4.0");
          }}
          variant="ghost"
        >
          Lanzar 3 toasts
        </Button>
        <Tooltip side="top" text="Tooltip propio, sin `title` nativo">
          <button className="orbit-btn orbit-btn--ghost orbit-btn--md" type="button">
            Pásame el ratón
          </button>
        </Tooltip>
      </Bench>
    </Group>
  );
}

/** Reloj fijo del banco: las capturas del dial y de la timeline no pueden
 *  cambiar entre ejecuciones. */
const BENCH_NOW = new Date("2026-08-18T14:00:00");
const BENCH_TARGET = new Date(BENCH_NOW.getTime() + 90 * 60_000);

const STINT_ROWS = [
  {
    id: "isaac",
    name: "Isaac",
    color: "#f04755",
    blocks: [
      { id: "s1", start: BENCH_NOW, durationMin: 55, color: "#f04755", label: "S1", done: true },
      {
        id: "s3",
        start: new Date(BENCH_NOW.getTime() + 115 * 60_000),
        durationMin: 60,
        color: "#f04755",
        label: "S3",
      },
    ],
  },
  {
    id: "sol",
    name: "Sol",
    color: "#5ccbd5",
    blocks: [
      {
        id: "s2",
        start: new Date(BENCH_NOW.getTime() + 55 * 60_000),
        durationMin: 60,
        color: "#5ccbd5",
        label: "S2",
      },
      {
        id: "s4",
        start: new Date(BENCH_NOW.getTime() + 175 * 60_000),
        durationMin: 45,
        color: "#5ccbd5",
        label: "S4",
      },
    ],
  },
];

/** Instantánea fija para el mini-lienzo: los widgets reales del sistema V3 se
 *  pintan en modo preview (`renderMode: "harness"`), sin interacción. */
const STAGE_SNAPSHOT = buildMockTelemetry({ session: "race", location: "track", state: "ready" });

function renderStageWidget(doc: { id: string; w: number; h: number }) {
  const type = doc.id as WidgetType;
  const definition = widgetTypeRegistry.get(type);
  const widget = definition.createDefault(doc.id);
  const layout = { ...widget.layout, w: doc.w, h: doc.h };
  return (
    <WidgetVisualViewport layout={layout} testId={`ok-stage-${doc.id}`} widgetType={type}>
      <WidgetVisualHost
        renderMode="harness"
        snapshot={STAGE_SNAPSHOT}
        widget={{ ...widget, layout }}
      />
    </WidgetVisualViewport>
  );
}

function Visualization() {
  const [stint, setStint] = useState("s2");
  const [corner, setCorner] = useState("T7");
  const [slots, setSlots] = useState<Record<string, TyreView | undefined>>({
    FL: HARNESS_TYRES[0],
    FR: undefined,
    RL: undefined,
    RR: undefined,
  });
  const [picked, setPicked] = useState("SET-02");

  const assign = (key: string) => (id: string) => {
    const tyre = HARNESS_TYRES.find((item) => item.id === id);
    setSlots((current) => ({ ...current, [key]: tyre }));
  };

  return (
    <section aria-label="4 · Visualización" className="ok-group" data-group="visualizacion">
      <h2>4 · Visualización</h2>
      <div className="ok-group__body" data-shot="visualizacion-a">
        <Bench label="Dial y mini-lienzo">
          <CountdownDial
            eyebrow="Próxima serie"
            intervalMin={180}
            meta="Spa · 6 h · 24 inscritos"
            now={BENCH_NOW}
            onOpen={() => {}}
            openLabel="Abrir la serie en Carreras"
            prefix="en"
            target={BENCH_TARGET}
            title="Próxima salida"
          />
          <div className="ok-stage">
            <MiniStage renderWidget={renderStageWidget} system="crystal" widgets={HARNESS_WIDGETS} />
          </div>
        </Bench>
        <Bench label="Timeline (2 filas)">
          <HorizontalTimeline
            blocks={(row) => row.blocks}
            headWidth={150}
            label="Plan de stints"
            now={new Date(BENCH_NOW.getTime() + 95 * 60_000)}
            onBlock={setStint}
            rowLabel={(row) => (
              <span className="ok-tl-head">
                <i aria-hidden="true" style={{ background: row.color }} />
                {row.name}
              </span>
            )}
            rows={STINT_ROWS}
            selected={stint}
            spanMin={240}
            start={BENCH_NOW}
            tickEveryMin={30}
          />
        </Bench>
        <Bench label="Donut y trazas">
          <div className="ok-viz-split">
            <Donut
              centerLabel="Reparto"
              centerValue="4 h 00"
              slices={[
                { id: "isaac", label: "Isaac", value: 95, color: "#f04755" },
                { id: "sol", label: "Sol", value: 70, color: "#5ccbd5" },
                { id: "fable", label: "Fable", value: 55, color: "#78d68b" },
                { id: "pit", label: "Boxes", value: 20, color: "#ff9b57" },
              ]}
            />
            <div className="ok-traces">
              <Trace
                bands={HARNESS_BANDS}
                channel="speed"
                cursor={0.38}
                height={150}
                mine={HARNESS_MINE.speed}
                reference={HARNESS_REF.speed}
                title="Velocidad"
                unit="km/h"
              />
              <Trace
                bands={HARNESS_BANDS}
                channel="pedals"
                extra={HARNESS_MINE.brake}
                height={100}
                mine={HARNESS_MINE.throttle}
                title="Acelerador / Freno"
                unit="%"
              />
              <Trace
                bands={HARNESS_BANDS}
                channel="steer"
                height={80}
                mine={HARNESS_MINE.steer}
                reference={HARNESS_REF.steer}
                title="Volante"
                unit="°"
              />
              <Trace
                bands={HARNESS_BANDS}
                channel="delta"
                height={110}
                mine={HARNESS_DELTA}
                title="Delta"
                unit="s"
              />
            </div>
          </div>
        </Bench>
      </div>
      <div className="ok-group__body" data-shot="visualizacion-b">
        <Bench label="Mapa de circuito">
          <div className="ok-map">
            <TrackMap
              cursor={HARNESS_CORNERS.find((item) => item.name === corner)?.pos ?? 0}
              onSegment={setCorner}
              path={HARNESS_TRACK}
              segments={HARNESS_SEGMENTS}
              selected={corner}
            />
          </div>
        </Bench>
        <Bench label="Esquinas e inventario">
          <div className="ok-corners">
            <CornerSlot
              corner="FL"
              onClear={() => setSlots((current) => ({ ...current, FL: undefined }))}
              onDrop={assign("FL")}
              tyre={slots.FL}
            />
            <CornerSlot
              corner="FR"
              onClear={() => setSlots((current) => ({ ...current, FR: undefined }))}
              onDrop={assign("FR")}
              picked
              tyre={slots.FR}
            />
            <CornerSlot
              corner="RL"
              onClear={() => setSlots((current) => ({ ...current, RL: undefined }))}
              onDrop={assign("RL")}
              tyre={slots.RL}
            />
            <CornerSlot
              corner="RR"
              onClear={() => setSlots((current) => ({ ...current, RR: undefined }))}
              onDrop={assign("RR")}
              tyre={slots.RR}
            />
          </div>
          <div className="ok-tyres">
            <TyreItem onPick={() => setPicked("SET-01")} tyre={HARNESS_TYRES[0]} used={[]} />
            <TyreItem
              onPick={() => setPicked("SET-02")}
              picked={picked === "SET-02"}
              tyre={HARNESS_TYRES[1]}
              used={[{ stint: 1, corner: "FL" }]}
            />
            <TyreItem
              onPick={() => setPicked("SET-03")}
              tyre={HARNESS_TYRES[2]}
              used={[
                { stint: 1, corner: "FR" },
                { stint: 2, corner: "RL" },
                { stint: 3, corner: "RR" },
              ]}
            />
          </div>
        </Bench>
        <Bench label="Disponibilidad">
          <div className="ok-avail">
            <AvailabilityBoard
              drivers={HARNESS_DRIVERS}
              from={13}
              ranges={HARNESS_RANGES}
              to={18.5}
            />
          </div>
        </Bench>
        <Bench label="Atajos y fader">
          <div className="ok-hk">
            <KeycapRow
              description="Muestra u oculta todos los overlays"
              keys={["Ctrl", "Shift", "O"]}
              title="Alternar overlays"
            />
            <KeycapRow description="Sin atajo asignado" empty keys={[]} title="Capturar vuelta" />
            <KeycapRow
              conflict
              description="Choca con «Guardar perfil»"
              keys={["Ctrl", "S"]}
              title="Marcar stint"
            />
          </div>
          <Fader value={0.62} />
        </Bench>
      </div>
    </section>
  );
}

export function Harness() {
  return (
    <ToastProvider>
      <main className="orbit-kit-scope ok-page" data-testid="orbit-kit-harness">
        <header className="ok-head">
          <span className="ok-eyebrow">Command Orbit v0.3</span>
          <h1>Kit de componentes</h1>
        </header>
        <Primitives />
        <StateGroup />
        <Containers />
        <Visualization />
      </main>
    </ToastProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
);
