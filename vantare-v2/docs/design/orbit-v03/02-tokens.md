# 02 · Tokens

Valores **exactos** del prototipo tras el reescalado ×1.3. Exportables: [`orbit.tokens.css`](orbit.tokens.css) (custom properties), [`tokens.json`](tokens.json) (DTCG-like) y [`vantare-orbit.theme.json`](vantare-orbit.theme.json) (compatible con `frontend/src/lib/theme.ts`, ver notas al final).

## 2.1 Color

### Fondos y superficies
| Token | Valor | Uso |
|---|---|---|
| `--canvas` | `#08090b` | Fondo global del hub |
| `--surface-0` | `#0d0e11` | Reserva (fondos de rail/columna usan valores propios abajo) |
| `--surface-1` | `#121316` | Superficies planas |
| `--surface-2` | `#18191e` | Menús, palette body |
| `--surface-3` | `#202127` | Toasts (`#242429`), keycaps |
| Rail | `#0b0c0e` | `.global-rail` |
| Columna | `#0f1013` | `.sidebar`, `.dock` |
| Panel translúcido | `rgba(16,17,20,.79)` + `backdrop-filter: blur(16px)` | `.panel`, `.surface`, `.stat`, tarjetas |
| Topbar | `rgba(8,9,11,.82)` + blur 23px | `.topbar` |
| Destacado (relleno) | `linear-gradient(rgba(25,25,30,.98), rgba(19,19,23,.99))` | `.command-surface`, `.focal` |

### Tinta
| Token | Valor | Contraste sobre `#0d0e11` | Uso |
|---|---|---|---|
| `--ink` | `#f5f3f2` | 17.9:1 | Títulos, valores |
| `--ink-2` | `#b7b2b2` | 9.4:1 | Cuerpo, inputs |
| `--ink-3` | `#8a858b` | 5.3:1 | Secundario, metadatos (mín. para texto ≥ 11px) |
| Terciario | `#787379` / `#7c777d` | 4.2:1 | Etiquetas de campo, hints (≥ 11px, peso ≥ 700) |
| Apagado | `#57545a` / `#45424a` | — | Solo decorativo (bloqueado, separadores) |

### Líneas
| Token | Valor |
|---|---|
| `--line` | `rgba(255,255,255,.075)` |
| `--line-strong` | `rgba(255,255,255,.13)` |
| Separador de filas | `rgba(255,255,255,.045)` – `.055` |

### Acento y semánticos
| Token | Valor | Uso |
|---|---|---|
| `--carmine` | `#d52f49` | Base del acento, degradados, toggle on |
| `--red` | `#f04755` | Barra activa, bordes de selección, pérdida |
| `--coral` | `#ff6a5f` | Glow, hover de acento, foco (`:focus-visible`), delta propio |
| `--ember` | `#ff9b57` | Atención, "próximamente", Oro/licencia, ámbar |
| `--wine` | `#641526` | Extremo oscuro de degradados |
| `--green` | `#78d68b` | OK, conectado, ganancia |
| Cian de referencia | `#5ccbd5` / `#8fd6dd` | Trazas de referencia, semanal, "Lluvia" |
| Bronce / Plata / Oro | `#d29a6c` / `#c9c9cf` / `#ff9b57` | Chips de licencia |
| Compuestos | soft `#ff8b8b` · medium `#ffd166` · hard `#e6e2e2` | Chips de neumático |

Gradientes canónicos:
- **Marca / iconos**: `linear-gradient(145deg, var(--coral), var(--carmine) 62%, var(--wine))`.
- **Borde destacado**: `linear-gradient(115deg, rgba(240,71,85,.62), rgba(255,106,95,.2), rgba(255,255,255,.06)) border-box` sobre relleno grafito, `border: 1px solid transparent`, radio 25px.
- **Selección de fila**: `linear-gradient(90deg, rgba(213,47,73,.11), rgba(213,47,73,.02))` + barra `3px` `--red` con `box-shadow: 0 0 13px rgba(240,71,85,.6)`.
- **Vista Inicio**: `radial-gradient(circle at 58% -14%, rgba(213,47,73,.12), transparent 32%)` + `radial-gradient(circle at 104% 42%, rgba(255,106,95,.045), transparent 23%)`.

## 2.2 Tipografía
- **Sans**: `Inter, "Segoe UI Variable", "Segoe UI", system-ui, sans-serif` (empaquetada, `font-variant-numeric: tabular-nums`, `-webkit-font-smoothing: antialiased`).
- **Mono**: `"Cascadia Code", "SFMono-Regular", ui-monospace, monospace` — números vivos, ids, horas, kbd.
- Base `16px / 1.5`.

| Rol | Tamaño / peso / tracking | Uso |
|---|---|---|
| Saludo (`.greet`) | 39px / 690 / -.045em | Hero de Inicio (34px ≤ 940px alto) |
| `.t-page` / `.module-head h2` | 34px / 690 / -.04em · 31px | Título de sección |
| `.focal h2` | 28px / 690 / -.03em | Título de la focal |
| Evento (`.ev-copy h2`) | 26px / 720 / -.035em | Cabecera de estrategia |
| Valor KPI (`.stat-v`) | 22px mono / 700 / -.03em | Stat tiles (19px en Estrategia) |
| `.t-sect` | 20px / 650 / -.02em | Subtítulos |
| `.t-panel`, `.surface-head h3` | 15px / 700 / -.01em | Títulos de panel (**caja normal**) |
| Cuerpo (`.btn`, filas) | 13–14px / 650 | Texto de fila principal |
| Secundario | 11.5–12px / 400–600 | Metadatos, descripciones |
| `.eyebrow` | 12px / 800 / .15em uppercase | Solo cabeceras y tarjetas destacadas |
| Micro-rótulos | 10–11px / 700–800 / .06–.1em uppercase | `.stat-k`, `.field > label`, chips |
| Mono pequeño | 11–12px mono / 600–700 | Horas, ids, kbd, cadencias |

## 2.3 Espaciado y forma
| Token | balanced | compact | comfortable |
|---|---|---|---|
| `--row` | 49px | 42px | 57px |
| `--space` | 21px | 16px | 26px |
| `--radius` | 18px | 14px | 22px |

Radios fijos: destacado 25px · palette 23px · botones/inputs 12px · chips 8px · pills/toggles 999px · keycaps 7px · mini-lienzo 14px.
Anchos: rail **81px** · columna **296px** (216 ≤ 1152px) · inspector Studio **395px** · detalle de serie 338px · panel Pilotos 340px · columna de entradas 400px (Telemetría mapa) · `min-width` body 1180px.
Alturas: topbar **70px** · botón 39px (sm 34px) · input 39px · pill 30px · chip 26px · toggle 44×25 · rail-button 52px · fila de lista 46–60px · statusbar 39px.
Contenido: `.inicio-wrap, .module-wrap { width: min(1508px, calc(100% - 62px)); padding: 24px 0 }`.

## 2.4 Sombras y glow
| Nombre | Valor |
|---|---|
| Elevación panel destacado | `0 32px 91px rgba(0,0,0,.42), 0 0 42px rgba(213,47,73,.04)` (hover `0 39px 110px rgba(0,0,0,.5), 0 0 62px rgba(213,47,73,.07)`) |
| Primario | `0 13px 34px rgba(0,0,0,.35)` |
| Toast | `0 23px 78px rgba(0,0,0,.5)` |
| Palette | `0 44px 143px rgba(0,0,0,.66), 0 0 58px rgba(213,47,73,.05)` |
| Menú | `0 24px 70px rgba(0,0,0,.6)` |
| Glow punto activo | `0 0 13px rgba(240,71,85,.6)` |
| Glow OK | `0 0 10px currentColor` (dot verde) |
| Inset cristal | `inset 0 1px 0 rgba(255,255,255,.08–.2)` |

## 2.5 Motion
| Token | Valor |
|---|---|
| `--ease` | `cubic-bezier(.2,.8,.2,1)` |
| `--fast` | 130 ms (hover, color) |
| `--med` | 200 ms (toggle, plegado de secciones) |
| Entrada de contenido | 260–340 ms `--ease`, `translateY(6–8px)` → 0, cascada 30–40 ms |
| Recolocación (timeline) | 350 ms `--ease` en `left`/`width` |
| Toggle knob | 220 ms `cubic-bezier(.34,1.4,.64,1)` |
| Órbita/dial | 1 s lineal por tick |
| Reduced motion | todo a 0 s |

## 2.6 Z-index
rail 20 · topbar 15 · menú 30 · tooltip del rail 40 · palette 100 · toasts 120 · QA 130.

## 2.7 Breakpoints
`max-width: 1500px` (oculta rótulo Browser View) · `max-width: 1152px` (columna 216px, layouts a 2 columnas, oculta hero-side) · `max-height: 940px` (compacta Inicio) · `max-height: 790px` (compacta más) · `prefers-reduced-motion`.

## 2.8 Iconografía
Sprite `<symbol id="i-*" viewBox="0 0 18 18">` (inicio, studio, launcher, carreras, estrategia, ingeniero, telemetria, roadmap, ajustes, cuenta, comando 24×24, panel 16×16, flask, lock 14×14). Trazo 1.5 (1.75 en rail), `stroke-linecap/linejoin: round`, `fill: none`. Tamaños: rail 23px · botones 17px · listas 19px · paleta 20px · lock 15px.
Marca: chevrón Vantare (PNG transparente 128px) sobre losa grafito 49px radio 16 con `drop-shadow(0 4px 10px rgba(240,71,85,.45))`. Avatar: logo del usuario 30px sobre losa 39px radio 12.

## Notas para el tema del frontend
`vantare-orbit.theme.json` mapea Orbit al tipo `VantareTheme` actual (`bg/surface/panel/border/…/red400…`). El tipo **no** contempla coral, ember, wine, líneas alfa, radios ni densidades: hay que extender `ThemeColors`/`ThemeEffects` (ver `10-plan-de-porte.md`, fase 0) o cargar `orbit.tokens.css` junto al tema.
