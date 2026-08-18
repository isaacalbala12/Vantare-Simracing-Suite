import { StrictMode, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./ui-orbit-harness.css";
import { initializeDensity } from "./lib/density";
import { applyTheme, type VantareTheme } from "./lib/theme";
import orbitThemeJson from "./themes/vantare-orbit.json";
import {
  Accordion,
  Button,
  Chip,
  Dot,
  Featured,
  Field,
  IconButton,
  Input,
  Kbd,
  ListRow,
  Menu,
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
  TyreChip,
  UnderlineTabs,
  useToast,
} from "./ui/orbit";

/**
 * Harness visual del kit Orbit (briefing 02, parte A).
 *
 * Muestra cada componente de los grupos 1 (primitivos), 2 (estado) y 3
 * (contenedores) en todos los estados que pide el criterio de aceptación. El
 * grupo 4 (visualización) lo añade la parte B.
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

function Primitives() {
  const [seg, setSeg] = useState("mock");
  const [wide, setWide] = useState("a");
  const [on, setOn] = useState(true);
  const [off, setOff] = useState(false);
  const [text, setText] = useState("Vantare");
  const [num, setNum] = useState("42");
  const [sel, setSel] = useState("crystal");
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
              { value: "crystal", label: "Crystal" },
              { value: "original", label: "Original" },
              { value: "endurance", label: "Endurance" },
            ]}
            value={sel}
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

export function Harness() {
  return (
    <ToastProvider>
      <main className="orbit-kit-scope ok-page" data-testid="orbit-kit-harness">
        <header className="ok-head">
          <span className="ok-eyebrow">Command Orbit v0.3</span>
          <h1>Kit de componentes · parte A</h1>
        </header>
        <Primitives />
        <StateGroup />
        <Containers />
        {/* grupo 4: visualización (parte B) */}
        <section aria-label="4 · Visualización" className="ok-group" data-group="visualizacion">
          <h2>4 · Visualización</h2>
          <div className="ok-group__body">
            <p className="ok-copy">Pendiente: lo porta la parte B del briefing 02.</p>
          </div>
        </section>
      </main>
    </ToastProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
);
