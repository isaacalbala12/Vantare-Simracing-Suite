import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./orbit-tokens-harness.css";
import { initializeDensity } from "./lib/density";
import { applyTheme, type VantareTheme } from "./lib/theme";
import orbitThemeJson from "./themes/vantare-orbit.json";
import { Icon, type IconName } from "./ui/orbit/Icon";

const orbitTheme = orbitThemeJson as VantareTheme;

const colors = [
  ["Canvas", "canvas"],
  ["Surface", "surface-1"],
  ["Carmine", "carmine"],
  ["Red", "red"],
  ["Coral", "coral"],
  ["Ember", "ember"],
  ["Green", "green"],
  ["Cyan", "cyan"],
] as const;

const icons: { name: IconName; label: string }[] = [
  { name: "i-vantare", label: "Vantare" },
  { name: "i-inicio", label: "Inicio" },
  { name: "i-studio", label: "Studio" },
  { name: "i-launcher", label: "Launcher" },
  { name: "i-carreras", label: "Carreras" },
  { name: "i-estrategia", label: "Estrategia" },
  { name: "i-ingeniero", label: "Ingeniero" },
  { name: "i-telemetria", label: "Telemetría" },
  { name: "i-roadmap", label: "Roadmap" },
  { name: "i-ajustes", label: "Ajustes" },
  { name: "i-cuenta", label: "Cuenta" },
  { name: "i-comando", label: "Comando" },
  { name: "i-panel", label: "Panel" },
  { name: "i-flask", label: "Testing" },
  { name: "i-lock", label: "Bloqueado" },
];

/** Franja de comparación de la marca como icono (D-96): tres variantes a
 *  decidir, medidas contra tres vecinos del catálogo. */
const markRows: { name: IconName; label: string; note: string }[] = [
  { name: "i-vantare-a", label: "Variante a", note: "chevrón + trazo interior paralelo" },
  { name: "i-vantare-b", label: "Variante b", note: "doble chevrón anidado" },
  { name: "i-vantare-c", label: "Variante c", note: "‘A’ con corte diagonal en la base" },
  { name: "i-studio", label: "Studio", note: "referencia de peso" },
  { name: "i-launcher", label: "Launcher", note: "referencia de peso" },
  { name: "i-carreras", label: "Carreras", note: "referencia de peso" },
];

export function Harness() {
  return (
    <main className="orbit-harness" data-testid="orbit-foundations-harness">
      <header className="orbit-harness__header">
        <div>
          <p className="orbit-harness__eyebrow">Vantare design system · v0.3</p>
          <h1>Command Orbit</h1>
          <p className="orbit-harness__lead">
            Tema, tokens, tipografía local y sprite compartido listos para el hub.
          </p>
        </div>
        <div className="orbit-harness__signature" aria-label="Tema activo">
          <Icon name="i-comando" size={24} />
          <span>Orbit activo</span>
        </div>
      </header>

      <section className="orbit-harness__grid">
        <article className="orbit-harness__panel orbit-harness__panel--featured">
          <div className="orbit-harness__panel-head">
            <div>
              <p className="orbit-harness__eyebrow">Color</p>
              <h2>Paleta operacional</h2>
            </div>
            <span className="orbit-harness__meta">8 tokens canónicos</span>
          </div>
          <div className="orbit-harness__swatches">
            {colors.map(([label, token]) => (
              <div className="orbit-harness__swatch" key={token}>
                <span className={`orbit-harness__swatch-color orbit-harness__swatch-color--${token}`} />
                <strong>{label}</strong>
                <code>--orbit-{token}</code>
              </div>
            ))}
          </div>
          <div
            className="bg-orbit-canvas text-orbit-ink rounded-orbit orbit-harness__tailwind-proof"
            data-testid="orbit-tailwind-proof"
          >
            Tailwind 4 · bg-orbit-canvas · text-orbit-ink · rounded-orbit
          </div>
        </article>

        <article className="orbit-harness__panel">
          <div className="orbit-harness__panel-head">
            <div>
              <p className="orbit-harness__eyebrow">Iconografía</p>
              <h2>Sprite del hub</h2>
            </div>
            <span className="orbit-harness__meta">15 símbolos</span>
          </div>
          <div className="orbit-harness__icons" data-testid="orbit-icon-grid">
            {icons.map((icon) => (
              <div className="orbit-harness__icon" key={icon.name}>
                <span className="orbit-harness__icon-tile">
                  <Icon name={icon.name} size={23} strokeWidth={1.75} />
                </span>
                <span>{icon.label}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="orbit-harness__panel orbit-harness__panel--featured">
          <div className="orbit-harness__panel-head">
            <div>
              <p className="orbit-harness__eyebrow">Marca · D-96</p>
              <h2>La marca como icono · variantes</h2>
            </div>
            <span className="orbit-harness__meta">inactivo / activo · 1× 23 px · 3× 69 px</span>
          </div>
          <div className="orbit-harness__marks" data-testid="orbit-mark-variants">
            {markRows.map((row) => (
              <div className="orbit-harness__mark" key={row.name}>
                <span className="orbit-harness__mark-name">
                  <strong>{row.label}</strong>
                  <code>{row.name}</code>
                  <em>{row.note}</em>
                </span>
                <span className="orbit-harness__mark-tile">
                  <Icon name={row.name} size={23} strokeWidth={1.75} />
                </span>
                <span className="orbit-harness__mark-tile orbit-harness__mark-tile--active">
                  <Icon name={row.name} size={23} strokeWidth={1.75} />
                </span>
                <span className="orbit-harness__mark-tile orbit-harness__mark-tile--xl">
                  <Icon name={row.name} size={69} strokeWidth={1.75} />
                </span>
                <span className="orbit-harness__mark-tile orbit-harness__mark-tile--xl orbit-harness__mark-tile--active">
                  <Icon name={row.name} size={69} strokeWidth={1.75} />
                </span>
              </div>
            ))}
          </div>
        </article>

        <article className="orbit-harness__panel">
          <div className="orbit-harness__panel-head">
            <div>
              <p className="orbit-harness__eyebrow">Tipografía</p>
              <h2>Lectura y telemetría</h2>
            </div>
            <span className="orbit-harness__meta">offline</span>
          </div>
          <div className="orbit-harness__type">
            <p className="orbit-harness__display">Próxima salida</p>
            <p className="orbit-harness__body">Inter variable mantiene el hub claro, cercano y preciso.</p>
            <p className="orbit-harness__mono">14:30:00 · +00.184 · 92.4 L</p>
          </div>
        </article>

        <article className="orbit-harness__panel">
          <div className="orbit-harness__panel-head">
            <div>
              <p className="orbit-harness__eyebrow">Densidad</p>
              <h2>Una escala, tres ritmos</h2>
            </div>
            <span className="orbit-harness__meta">persistente</span>
          </div>
          <div className="orbit-harness__densities">
            {(["compact", "balanced", "comfortable"] as const).map((density) => (
              <div className="orbit-harness__density" data-density={density} key={density}>
                <span>{density}</span>
                <div className="orbit-harness__density-row">
                  <Icon name="i-panel" size={17} />
                  <strong>Perfil activo</strong>
                  <code>{density === "compact" ? "42" : density === "balanced" ? "49" : "57"} px</code>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}

applyTheme(orbitTheme);
initializeDensity();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
);
