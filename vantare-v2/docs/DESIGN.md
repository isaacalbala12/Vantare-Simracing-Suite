# DESIGN — Vantare Design System

> Design system canónico de Vantare. Tokens, componentes, estados, principios y reglas para implementación.
> Audience: `@designer` y cualquier worker que toque UI. **Contrato técnico, no marketing.**
> Para la marca conceptual ver [`BRAND.md`](./BRAND.md). Para ver los tokens en vivo, abrir `docs/styleguide.html`.

---

## 0. Estado y fuente de verdad

**Importante:** este documento describe los tokens que el código real usa hoy, no un ideal teórico. Hay tres sistemas visuales compitiendo en el código (ver §13 "Inconsistencias conocidas"). El objetivo de este doc es doble:
1. Documentar exactamente qué hay hoy.
2. Marcar qué está normalizado vs qué necesita normalización.

**Fuente de verdad primaria (en orden de prioridad):**
1. `frontend/src/index.css` — variables CSS en `:root` y `vantare-v5.json` que las sobreescriben.
2. `frontend/tailwind.config.*` — tokens de Tailwind si existen.
3. `frontend/src/overlay/widgets/widget-design-system.ts` — design system de widgets overlay.
4. Componentes reales como referencia de uso.

**Cuando implementes UI:**
- Si el token está en este doc → úsalo.
- Si necesitas un valor nuevo → añádelo a este doc, no lo hardcodees en un componente.
- Si encuentras un valor hardcodeado repetido en ≥3 sitios → proponlo como token en este doc antes de seguir usando el hardcode.

---

## 1. Principios de diseño

1. **El dato es el héroe.** Nada compite con la información en pantalla. Los overlays son la cara de la marca.
2. **Glass + oscuro + acento rojo.** ADN visual: paneles translúcidos sobre fondo casi-negro, con rojo Vantare como acento único.
3. **Uppercase + tracking amplio en chrome.** Headers, badges, navegación, botones: mayúsculas con `tracking-widest`. Es la firma.
4. **Específico > genérico.** Tamaños, pesos, gaps concretos. Nada "a ojo".
5. **Sin ornamentación gratuita.** Sin gradientes innecesarios, sin sombras dramáticas, sin animaciones de relleno. Cada efecto tiene función.
6. **Funciona en OBS Browser Source.** El overlay renderiza sobre `body { background: transparent !important; }`. Diseña para que se vea bien sobre gameplays oscuros y claros.
7. **No se traduce el chrome técnico.** IDs, nombres de widget, enums, columnas, slots son datos. No se localizan.

---

## 2. Tokens de color

### 2.1 Fondos

| Token CSS | Valor | Uso | Estado |
|---|---|---|---|
| `--v-bg` | `#0a0a0a` | Fondo general de la app y hub | ✅ Normalizado |
| `--v-surface` | `#141414` | Cards, paneles, contenedores | ✅ Normalizado |
| `--v-panel` | `#141414` | Paneles interiores | ✅ Normalizado |
| (no token) | `#080808` | Fondo tema v5 (más oscuro) | ⚠️ Inconsistencia con `--v-bg` |

**Regla:** Usa `bg-black` o `bg-[#0a0a0a]` como fondo. Para superficies, `bg-[#141414]` o la clase utilitaria `.card-sleek` / `.glass-panel`.

### 2.2 Acento principal — ROJO VANTARE

El acento es **rojo** (`#C1121F`), no naranja. Los HTMLs de referencia visual mezclan rojo y naranja; **el código real y los widgets usan rojo**.

| Token CSS | Hex | Uso | Estado |
|---|---|---|---|
| `--v-red-400` | `#ff3b3b` | Acento brillante, hover, glow | ✅ |
| `--v-red-500` / `--color-vantare-red-500` | `#C1121F` | **Acento principal** — botones primarios, indicadores activos | ✅ |
| `--v-red-600` | `#9B2226` | Hover de botones, bg de badges | ✅ |
| `--v-red-700` | `#800020` | Gradientes de botones | ✅ |
| `--v-red-900` | `#4A0012` | Fondo de badges/etiquetas red | ✅ |
| `--v-red-950` | `#2A000A` | Fondo de badges muy oscuro | ✅ |
| `--v-wine` | `#722F37` | Gradientes alternos | ✅ |
| `--v-burgundy` | `#4A0E16` | Gradientes de botones/iconos | ✅ |
| `--v-blood` | `#8B0000` | Efectos secundarios | ✅ |

**Hardcodeados (deberían consolidarse como tokens):**
- `#E63946` — glassmorphism-pro
- `#ff2a3b` — glassmorphism-pro brake/negative
- `#ff4d4d` — hover brillante btn-primary
- `#9a0606` — gradiente btn-primary
- `#ff6b6b` — progress bar Roadmap
- `#e21b1b` — logo gradient

**Reglas de uso:**
- Botón primario: gradiente `from-#ff3b3b to-#9a0606` o `from-vantare-red-500 to-[#9a0606]`.
- Acento en texto/iconos: `--v-red-400` (`#ff3b3b`).
- Acento en badges: `--v-red-500` (`#C1121F`) o `--v-red-900` para fondo.
- Glow rojo: `box-shadow: 0 0 100px rgba(255,59,59,.1)` o `shadow-vantare-red-900/20`.

### 2.3 Estados

| Token | Hex | Uso |
|---|---|---|
| `--v-success` | `#34D399` | Éxito (verde menta) |
| `--v-warning` | `#FFD700` | Advertencia (oro) |
| (no token) | `#22c55e` | Positivo en design system (throttle, gap behind) |
| (no token) | `#ef4444` / `#e74c3c` | Negativo / brake (fallback) |
| (no token) | `#f59e0b` / `#f1c40f` | Adv / RPM yellow |
| (no token) | `#3b82f6` / `#3498db` | Info / RPM blue |
| (no token) | `#a855f7` | Púrpura experimental badge |

**Regla:** Estos son semánticos. No usar el hex directamente; usar `text-green-400`, `text-amber-400`, `text-red-400`, `text-blue-400` (Tailwind) o las CSS vars cuando existan.

### 2.4 Texto

| Token CSS | Valor | Uso |
|---|---|---|
| `--v-text` | `#f5f5f5` | Texto primario (blanco roto) |
| `--v-text-muted` | `rgba(245,245,245,.6)` | Texto secundario |
| `--v-text-dim` | `rgba(245,245,245,.35)` | Texto terciario, etiquetas, badges |
| (no token) | `#9CA3AF` | Texto de gap en relative widget (gray-400) |
| (no token) | `#888` / `#4A4A4A` | Texto pending badge |

**Reglas:**
- Texto principal: `text-white` o `text-[#f5f5f5]`.
- Texto secundario: `text-white/60` o `text-[#f5f5f5]/60`.
- Texto dim (badges, metadata): `text-white/35` o `text-[#f5f5f5]/35`.
- No usar `text-gray-*` de Tailwind salvo para casos puntuales (`text-gray-400` para gaps).

### 2.5 Bordes

**Patrón dominante:**
- `border-white/5` — borde más sutil (cards, glass-panel base)
- `border-white/10` — **borde estándar** en casi todo
- `border-white/20` — bordes más visibles (inputs, botones)
- `border-vantare-red-500/20` — borde rojo tenue
- `border-vantare-red-500/50` — borde rojo activo
- `--v-border` — `rgba(245,245,245,.08)` (alias de `border-white/10`)

**Regla:** Si dudas, `border-white/10`. Para hover, `border-white/20`. Para estado activo, `border-vantare-red-500/50`.

### 2.6 Otros tokens

| Token | Valor | Uso |
|---|---|---|
| `--v-card-shadow` | `0 24px 60px rgba(255,59,59,.18), 0 0 100px rgba(255,59,59,.1)` | Sombra roja de cards |
| `--v-glass-alpha` | `0.6` (default) | Alpha de fondo translúcido en glass panels |
| `--v-glass-blur` | `0px` | ⚠️ Declarado pero NO usado (glass usa `backdrop-filter: none`) |

---

## 3. Tipografía

### 3.1 Familias

Importadas desde Google Fonts en `index.html`:

```
Inter: 300, 400, 500, 600, 700
Rajdhani: 400, 500, 600, 700
Space Mono: 400, 700
```

**En HTMLs de referencia visual también:**
```
Plus Jakarta Sans: 700, 800
```

**CSS vars:**
| Variable | Valor | Uso |
|---|---|---|
| `--v-font-sans` | `'Inter', sans-serif` | Cuerpo general, UI del hub |
| `--v-font-display` | `'Rajdhani', sans-serif` | Headers, títulos grandes, hero, ratings |
| `--v-font-mono` | `'Space Mono', monospace` | **Datos, telemetría, números.** Mono canónica de la marca. |

**Decisión (BRAND-MONO-FONT-01, 2026-07-08):** la fuente monospace canónica es **Space Mono**. El `index.css` del repo declara `JetBrains Mono` en `--v-font-mono`; alinear el CSS a Space Mono es un PR de normalización pendiente (ver §13.3). Hasta que ese PR se ejecute, los widgets overlay siguen renderizando con JetBrains Mono en runtime; el contrato de marca ya es Space Mono.

**Reglas:**
- UI general: `font-sans` (Inter) por defecto.
- Headers / hero: `font-display` (Rajdhani).
- Números / datos / telemetría: `font-mono` (**Space Mono**).
- NUNCA usar la clase huérfana `font-tech` — no existe. Es un typo de `font-mono`.

### 3.2 Pesos

| Tailwind | Uso |
|---|---|
| `font-bold` | Default de UI (casi todo el texto significativo) |
| `font-semibold` | Subtítulos, labels de sección |
| `font-medium` | Body text, descripciones |
| `font-black` | Números grandes de telemetría (gear, speed, delta) |
| `font-normal` | Body ocasional |

**Regla:** Para UI default, `font-bold`. Para datos grandes (números hero), `font-black`.

### 3.3 Tamaños

| Tamaño | px aprox | Dónde |
|---|---|---|
| `text-[9px]` | 9 | Badges muy pequeños |
| `text-[10px]` | 10 | **Ubicuo** — badges, metadata, timestamps, navegación, botones secundarios, filtros |
| `text-xs` | 12 | Body pequeño, inputs, botones primarios, labels |
| `text-sm` | 14 | Body estándar, descripciones |
| `text-base` | 16 | Encabezados de card, títulos de widget |
| `text-lg` | 18 | Títulos de sección, nombres de perfil |
| `text-xl` | 20 | Títulos grandes, hero |
| `text-2xl` | 24 | Números medianos |
| `text-4xl` | 36 | Precios, speed |
| `text-5xl` | 48 | Speed horizontal |
| `text-6xl` | 60 | Gear, ratings |
| `hero-text-huge` | clamp(3.5rem, 9vw, 6.5rem) | Hero principal |

**Regla:** Para datos numéricos en widgets: ≥ `text-4xl` con `font-black` y `tracking-tight`. Para chrome UI: `text-xs` o `text-[10px]` con `uppercase` y `tracking-widest`.

### 3.4 Tracking y case

- `tracking-widest` — botones, headers mono, badges. **Ubicuo.**
- `tracking-[.18em]` a `tracking-[.22em]` — navegación, filtros, badges.
- `tracking-tight` — números grandes.
- `uppercase` — **prácticamente todo el chrome de UI** (badges, labels, nav, botones). Es ADN visual.

**Regla:** Chrome UI = `uppercase` + `tracking-widest` o `tracking-[.2em]`.

---

## 4. Espaciado y radios

### 4.1 Padding

| Clase | Dónde |
|---|---|
| `p-3` | Cards pequeños, paneles |
| `p-4` | Cards medianos, modales |
| `p-5` | Cards grandes |
| `p-6` | Cards de panel principales |
| `p-8` | Modales grandes |
| `px-3 py-2` | Badges, inputs |
| `px-4 py-2` | Botones estándar |
| `px-2 py-1` | Badges pequeños |

### 4.2 Gap

| Clase | Dónde |
|---|---|
| `gap-2` | Flex items, grupos pequeños |
| `gap-3` | Cards con items, formularios |
| `gap-4` | Secciones principales, grids |
| `gap-5` | Secciones grandes |
| `gap-1.5` | Badges internos, icon groups |
| `space-y-4` / `space-y-5` | Formularios, stacked sections |

### 4.3 Border radius

| Clase | Valor | Dónde |
|---|---|---|
| `rounded-sm` | 4px | Barras de progreso, deltas |
| `rounded` | ~4px | Inputs, botones de auth |
| `rounded-md` | 6-8px | Inputs, selects, items de lista |
| `rounded-lg` | 8-12px | **El más común** — botones, cards, paneles |
| `rounded-xl` | 12-16px | Cards principales, modales, secciones |
| `rounded-2xl` | 16px+ | Modales grandes, hero stats |
| `rounded-full` | 9999px | Avatares, dots, indicators, scrollbar thumb |

**Regla:** Por defecto, `rounded-lg`. Para cosas circulares, `rounded-full`. Para hero stats, `rounded-2xl`.

---

## 5. Glassmorphism y efectos

### 5.1 Clases CSS utilitarias (en `index.css`)

| Clase | Efecto |
|---|---|
| `.glass-panel` | `background: rgba(20,20,20,var(--v-glass-alpha))` + `border: 1px solid rgba(245,245,245,.08)` + hover con borde rojo. ⚠️ **`backdrop-filter: none`** (el glass viene de la transparencia, no del blur) |
| `.card-sleek` | `background: rgba(20,20,20,0.55)` + `border: 1px solid rgba(245,245,245,.08)` + hover con `translateY(-2px)` y `card-shadow` |
| `.btn-primary` | Gradiente `#ff3b3b → #9a0606`, border blanco 10%, hover glow |
| `.btn-secondary` | `rgba(245,245,245,.05)` bg, hover rojo |
| `.hero-text-huge` | Gradiente blanco→gris con `text-shadow` |
| `.v52-shell-bg` | Múltiples radial gradients rojos + fondo oscuro |
| `.v52-vignette` | Viñeta overlay con radial+linear gradients negros |
| `.v52-grain` | SVG noise grain con `mix-blend-mode: overlay` |
| `.v52-dock` | `backdrop-filter: blur(12px)`, fondo `rgba(15,15,15,.6)` |
| `.premium-bg` | Dot pattern con `radial-gradient` |
| `.preview-grid-bg` | Chessboard pattern (Figma-like) |

### 5.2 Patrones Tailwind dominantes

**Transparencias (fondos semitransparentes):**
- `bg-black/40`, `bg-black/50`, `bg-black/60` — fondos sobre overlay
- `bg-white/5`, `bg-white/10`, `bg-white/20` — fondos hover, badges
- `bg-white/[0.01]` a `bg-white/[0.03]` — opacidades muy sutiles
- `bg-vantare-red-500/10`, `bg-vantare-red-950/40` — fondos rojos translúcidos

**Blur:**
- `backdrop-blur-sm` — calendario cards, modales
- `backdrop-blur-md` — hero, engineer notifications, modales
- `backdrop-blur-[12px]` — dock

**Sombras:**
- `shadow-lg` — botones, iconos, cards
- `shadow-xl` — dropdowns
- `shadow-2xl` — hero, modales, banners
- `shadow-inner` — widgets telemetría, items seleccionados
- `shadow-vantare-red-900/20` — botones primarios
- `shadow-black/50` — modales/banners
- `drop-shadow-md` — gear numbers, ratings

**Gradientes frecuentes:**
- `from-white/10 to-white/5` — icon containers "coming soon"
- `from-white/[0.01] to-white/[0.03]` — backgrounds sutiles
- `from-vantare-red-700 to-vantare-burgundy` — botones/iconos principales
- `from-vantare-red-500 to-[#9a0606]` — botones acción fuerte
- `from-vantare-red-700 to-vantare-burgundy` (to-r) — Settings/PlanStatus
- `from-vantare-red-500/15 to-transparent` — widget item seleccionado
- `from-amber-700 to-amber-400` / `from-emerald-700 to-emerald-400` — barras de rating

**Regla para glassmorphism:**
- El "glass" del código actual NO usa `backdrop-filter` salvo en `.v52-dock` y casos puntuales con `backdrop-blur-*` de Tailwind.
- El efecto glass viene de la combinación: `bg-white/5` o `bg-[#141414]/60` + `border-white/10` + (opcional) `backdrop-blur-sm`.
- Si quieres blur real, usa `backdrop-blur-md` explícito.

---

## 6. Componentes

### 6.1 Botones

**Primario** — acción principal de la pantalla.
```html
<button class="btn-primary px-4 py-2 rounded-lg font-bold uppercase tracking-widest text-xs">
  Acción principal
</button>
```
O con Tailwind:
```html
<button class="px-4 py-2 rounded-lg font-bold uppercase tracking-widest text-xs
               bg-gradient-to-br from-vantare-red-500 to-[#9a0606]
               border border-white/10 shadow-vantare-red-900/20
               hover:from-vantare-red-400 hover:to-vantare-red-600
               transition-colors">
  Acción principal
</button>
```

**Secundario** — acción alternativa.
```html
<button class="btn-secondary px-4 py-2 rounded-lg font-bold uppercase tracking-widest text-xs">
  Acción secundaria
</button>
```

**Terciario / ghost** — acción contextual, sin peso.
```html
<button class="px-3 py-1.5 rounded-md text-xs text-white/60 hover:text-white hover:bg-white/5 transition-colors">
  Cancelar
</button>
```

### 6.2 Cards

**Card estándar** — `card-sleek` con hover.
```html
<div class="card-sleek rounded-lg p-4">
  <!-- contenido -->
</div>
```

**Card glass** — transparencia + borde sutil + (opcional) blur.
```html
<div class="rounded-xl border border-white/10 bg-white/[0.02] backdrop-blur-sm p-5">
  <!-- contenido -->
</div>
```

**Card destacada** — con borde rojo y glow.
```html
<div class="rounded-xl border border-vantare-red-500/30 bg-vantare-red-950/20 p-5 shadow-vantare-red-900/20">
  <!-- contenido -->
</div>
```

### 6.3 Badges y pills

**Badge estándar** (small, dim):
```html
<span class="px-2 py-0.5 rounded-md text-[10px] uppercase tracking-widest text-white/60 bg-white/5 border border-white/10">
  FREE
</span>
```

**Badge de tier** (PRO / TESTER / EXPERIMENTAL):
```html
<span class="px-2 py-0.5 rounded-md text-[10px] uppercase tracking-widest font-bold
               bg-vantare-red-500/15 text-vantare-red-400 border border-vantare-red-500/30">
  PRO
</span>
```

**Pill de estado** (success / warning / danger):
```html
<span class="px-2 py-0.5 rounded-full text-[10px] uppercase tracking-widest font-bold bg-green-400/15 text-green-400">
  CONECTADO
</span>
```

### 6.4 Inputs

```html
<input class="w-full rounded-md border border-white/20 bg-white/5 px-3 py-2 text-sm
              placeholder:text-white/35
              focus:outline-none focus:border-vantare-red-500/50 focus:bg-white/10
              transition-colors" />
```

### 6.5 Headers de sección

```html
<header class="flex items-center justify-between mb-4">
  <h2 class="font-display text-lg uppercase tracking-widest text-white">Sección</h2>
  <span class="text-[10px] uppercase tracking-widest text-white/40">metadata</span>
</header>
```

### 6.6 Navigation items (Topbar / dock)

```html
<button class="px-3 py-1.5 rounded-md text-[11px] uppercase tracking-[.2em] font-bold
               text-white/60 hover:text-white hover:bg-white/5
               data-[active=true]:text-white data-[active=true]:bg-vantare-red-500/10
               transition-colors">
  Item
</button>
```

### 6.7 Widgets overlay

Los widgets de telemetría/standings/relative tienen su propio sub-sistema en `frontend/src/overlay/widgets/`. Estilos:
- Fondos `bg-black/40` a `bg-black/60` (transparente sobre gameplay).
- Glass panels según el estilo activo (`vantare-racing`, `glassmorphism-pro`, `vantare-crystal`).
- Datos numéricos con `font-mono font-black text-4xl` o mayor.
- Headers en mayúsculas tracking amplio.

**Reglas específicas de overlay:**
- `html.desktop-overlay`, `body:not(.hub)`, `#root.desktop-overlay` → `background: transparent !important`.
- Diseñar para verse bien sobre gameplays oscuros Y claros.
- Sin `backdrop-blur` global (consume FPS en OBS). Usarlo solo si es necesario y testeado.

---

## 7. Layout

### 7.1 Hub shell

- Layout principal: `V52Shell` = Topbar + Dock + contenido.
- Fondo: `v52-shell-bg` (radial gradients rojos + fondo oscuro).
- Viñeta sutil con `.v52-vignette`.
- Grain opcional con `.v52-grain`.

### 7.2 Grids comunes

- Sidebar + content: `grid-cols-1 xl:grid-cols-[260px_1fr]` (calendario).
- 3 columnas: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`.
- Stats: `grid-cols-2 lg:grid-cols-4`.

### 7.3 Contenedores

- Página: `mx-auto max-w-7xl px-4 md:px-6 lg:px-8`.
- Sección: `py-6 md:py-8`.

---

## 8. Estados

### 8.1 Estados de UI

| Estado | Implementación |
|---|---|
| **Default** | Tokens base. |
| **Hover** | `border-white/20` o `bg-white/10` en chrome. Glow rojo en botones primarios. |
| **Focus** | `outline-none ring-2 ring-vantare-red-500/50`. |
| **Active / Selected** | `bg-vantare-red-500/10` + `text-white` + `border-vantare-red-500/50`. |
| **Disabled** | `opacity-40 cursor-not-allowed pointer-events-none`. |
| **Loading** | Spinner rojo (`border-vantare-red-500`) o pulse con `bg-white/5`. |

### 8.2 Estados de datos

| Estado | Cómo se muestra |
|---|---|
| **Conectado / éxito** | Verde (`text-green-400`, `--v-success` `#34D399`). |
| **Esperando** | Texto dim (`text-white/35`). |
| **Advertencia** | Amarillo (`text-amber-400`). |
| **Crítico / alerta** | Rojo (`text-vantare-red-400`). |
| **Bloqueado (gating)** | `AccessGate` con copy honesta ("Disponible para testers y planes de pago"). |

---

## 9. Iconografía

- Iconos sociales: SVG sprite en `frontend/public/icons.svg` (Bluesky, Discord, GitHub, X).
- Iconos UI: **línea fina, minimalistas**, estilo "dashboard técnico". Sin gradientes, sin sombras.
- Tamaño default: `h-4 w-4`. En headers: `h-5 w-5`. En stats: `h-6 w-6`.
- Color: heredar del texto (`text-current`). Para acento, `text-vantare-red-400`.

**Reglas:**
- Sin emoji como icono UI en chrome persistente.
- Logo Vantare es SVG inline en `Topbar.tsx` (líneas 85-113). Rombo/estrella con gradiente `#ff4d4d → #e21b1b → #9a0606`, drop-shadow rojo, texto "VANTARE" en `font-sans font-bold text-xl`.

---

## 10. Logo y assets de marca

- **Logo SVG**: inline en `frontend/src/hub/components/Topbar.tsx` (líneas 85-113).
  - Forma: rombo/estrella.
  - Gradiente: `#ff4d4d → #e21b1b → #9a0606`.
  - Drop-shadow: rojo.
  - Texto acompañante: "VANTARE" en `font-sans font-bold text-xl`.
- **Hero image**: `frontend/src/assets/hero.png` (probablemente screenshot del overlay).
- **No hay archivo de logo dedicado** (.svg/.png) en el repo. Si necesitas uno aislado, extraer del inline de Topbar.

---

## 11. Animación

- **Default duration**: 150-200ms.
- **Easing**: `ease-out` por defecto. `ease-in-out` solo en transiciones de estado (loading).
- **Sin rebotes, sin bouncy**. La animación es precisa y técnica.
- **Patrones:**
  - Hover: `transition-colors duration-150`.
  - Aparición: `transition-opacity duration-200` con `opacity-0 → opacity-100`.
  - Scale sutil en botones primarios al click: `active:scale-[0.98]`.
  - Skeleton de carga: `animate-pulse` con `bg-white/5`.

---

## 12. i18n (en UI)

- Módulo: `frontend/src/i18n/`.
- Idiomas: `es`, `en`, `pt`, `it`.
- Provider global en `HubApp` (vía `I18nProvider`).
- Selector de idioma en onboarding y Settings. Persistencia: `localStorage` (`vantare.locale`).
- **NO traducir** (datos, no copy):
  - IDs técnicos (widget/column/slot/design/variant).
  - Datos runtime/telemetría (pilotos, marcas, "VANTARE", "LE MANS ULTIMATE", nombres de carreras).
  - Nombres de simuladores (Le Mans Ultimate, iRacing, Assetto Corsa).
  - Keys de enum en código.
- **SÍ traducir**: copy visible de UI (botones, labels, mensajes).

---

## 13. Inconsistencias conocidas (a normalizar)

Estas son las grietas que un worker de normalización debería cerrar. Documentadas aquí para que ningún agente nuevo las amplíe sin querer.

### 13.1 Acento rojo vs naranja en documentación
- **Código real**: rojo (`#C1121F`, `#ff3b3b`).
- **`02-brand-strategy.md`**: proponía naranja (`#FF6B35`).
- **HTMLs de referencia**: mezclan ambos.
- **Decisión**: rojo gana. `BRAND.md` y este `DESIGN.md` están alineados con rojo. `02-brand-strategy.md` se actualiza en este mismo PR para no contradecir.

### 13.2 Dos definiciones de tema
- `index.css` con `--v-bg: #0a0a0a` y `--v-surface: #141414`.
- `vantare-v5.json` con `bg: #080808` y `surface: #0F0F0F`.
- El JSON sobreescribe al CSS al cargarse, pero hay un flash visible.
- **Acción sugerida**: alinear JSON a `#0a0a0a` / `#141414` o documentar la diferencia como "intencional" y bloquearla.

### 13.3 Dos fuentes mono
- `index.css`: `--v-font-mono: 'JetBrains Mono'`.
- `vantare-v5.json`: usa `'Space Mono'`.
- En la práctica, widgets overlay usan JetBrains Mono; el hub usa Space Mono (vía Chart canvas).
- **Resuelto a nivel de contrato (2026-07-08, BRAND-MONO-FONT-01):** la mono canónica de marca es **Space Mono**. La inconsistencia queda reducida a un PR de código que alinee `index.css` y `vantare-v5.json` a Space Mono.
- **Acción de código pendiente**: cambiar `--v-font-mono` en `index.css` de `'JetBrains Mono'` a `'Space Mono'`, y verificar que el import de Google Fonts en `index.html` siga trayendo `Space Mono` (peso 700). Test de regresión visual recomendado con Playwright.

### 13.4 `font-tech` huérfano
- Usado en `TelemetryWidget.tsx`, `TelemetryVerticalWidget.tsx`, `DeltaWidget.tsx`.
- **No existe** como clase Tailwind ni CSS. El browser lo ignora o hereda.
- **Acción obligatoria**: reemplazar por `font-mono` o `font-display` según intención.

### 13.5 `--v-glass-blur` declarado pero no usado
- `index.css` define `--v-glass-blur: 0px`.
- Las clases glass no la usan. La variable es decorativa.
- **Acción sugerida**: o eliminarla o usarla en `.glass-panel` para soportar blur configurable por tema.

### 13.6 Tres estilos de widget compitiendo
- `vantare-racing`, `glassmorphism-pro`, `vantare-crystal`.
- Cada uno con su paleta y assets.
- **Decisión**: documentar los tres como temas oficiales (ver §14) en vez de consolidar a uno solo.

### 13.7 Hex hardcodeados en componentes
- `#E63946`, `#ff2a3b`, `#ff4d4d`, `#9a0606`, `#ff6b6b`, `#e21b1b` aparecen en componentes sin pasar por tokens.
- **Acción**: PR de normalización para mapearlos a `--v-red-*` o `--v-blood`.

---

## 14. Temas de widget (overlay)

El código tiene **tres estilos oficiales** de widget overlay, definidos en `widget-design-system.ts` y reflejados en los HTMLs de referencia visual:

| Tema | Acento | Background | Notas |
|---|---|---|---|
| **Vantare Racing** | `#C1121F` | `#0a0a0a` | Default. El más limpio y de marca. |
| **Glassmorphism Pro** | `#E63946` | `#060608` | Más translúcido, más blur, más "premium". |
| **Vantare Crystal** | `#ff3b3b` | `#0a0a0a` | Variante con borde y paneles más sutiles. |

**HTMLs de referencia visual** (en `docs/`) que muestran los temas:
- `docs/overlay-vantare-crystal-widgets.html` — Vantare Crystal.
- `docs/overlay-glassmorphism-pro.html` — Glassmorphism Pro.
- `docs/overlay-cyber-oled.html` — Cyber OLED (preview/experimental, no usar en producción).
- `docs/overlays-vantare-aesthetic-mock.html` — Comparativa lado a lado.

**Reglas:**
- Para implementar un widget nuevo, elegir UNO de los tres temas.
- El tema se aplica vía `widget-appearance.ts` o `widget-design-system.ts`. No hardcodear paleta en el widget.
- Cyber OLED existe solo como referencia experimental. No activarlo en producción.

---

## 15. Paths clave

### Sistema de widgets
- `frontend/src/overlay/widgets/widget-design-system.ts` — tokens de widget.
- `frontend/src/overlay/widgets/widget-appearance.ts` — resolución de apariencia.
- `frontend/src/overlay/widgets/widget-catalog.ts` — catálogo de widgets.
- `frontend/src/overlay/widgets/widget-config-model.ts` — modelo de configuración.
- `frontend/src/lib/widget-factory.ts` — factory de tipos.
- `frontend/src/lib/widget-variants.ts` — variantes.
- `frontend/src/lib/profile.ts` — tipos de perfil.

### Componentes hub clave
- `frontend/src/hub/components/V52Shell.tsx` — shell.
- `frontend/src/hub/components/Topbar.tsx` — topbar (logo inline).
- `frontend/src/hub/components/LauncherDock.tsx` — dock lateral.
- `frontend/src/hub/components/V52SectionHeader.tsx` — header de sección.
- `frontend/src/hub/components/V52InfoCard.tsx` — card info.
- `frontend/src/hub/components/AccessGate.tsx` — gating.

### CSS / tokens
- `frontend/src/index.css` — variables CSS raíz, clases utilitarias.
- `frontend/tailwind.config.*` — config Tailwind.
- `frontend/src/i18n/` — i18n.

### HTMLs de referencia
- `docs/overlay-vantare-crystal-widgets.html`
- `docs/overlay-glassmorphism-pro.html`
- `docs/overlay-cyber-oled.html` (experimental)
- `docs/overlays-vantare-aesthetic-mock.html`

---

## 16. Anti-patrones

**No hacer:**
- ❌ Usar Tailwind `text-gray-*` para texto principal. Usar `text-white` o `text-white/60`.
- ❌ Hardcodear hex rojo en un componente. Usar `vantare-red-*` o las CSS vars.
- ❌ Usar `bg-white` sólido para cards. Usar `bg-white/5` o `bg-[#141414]`.
- ❌ Usar `backdrop-blur` global en el body o en containers grandes (consume FPS).
- ❌ Usar `font-tech` (no existe).
- ❌ Traducir IDs, nombres de widget, columnas, slots, enums.
- ❌ Añadir emoji como icono UI persistente.
- ❌ Usar naranja (`#FF6B35`) como acento en producción — el código es rojo.
- ❌ Animaciones con bounce o scale exagerado.
- ❌ Botones con `rounded-full` salvo que sean chips/avatares.

**Sí hacer:**
- ✅ `border-white/10` por defecto. `border-white/20` en hover.
- ✅ `rounded-lg` por defecto. `rounded-xl` para cards grandes.
- ✅ `uppercase` + `tracking-widest` en chrome de UI.
- ✅ `font-mono font-black tracking-tight` en datos numéricos.
- ✅ `font-display` en headers y hero.
- ✅ Glass via `bg-white/[0.02]` + `border-white/10` + opcional `backdrop-blur-sm`.
- ✅ Botón primario con gradiente `from-vantare-red-500 to-[#9a0606]`.
- ✅ Estado activo con `bg-vantare-red-500/10` + `border-vantare-red-500/50`.

---

## 17. Checklist para nuevos componentes

Antes de hacer merge de un componente nuevo, verificar:

- [ ] ¿Usa tokens de este doc, no hex hardcodeados?
- [ ] ¿Bordes `border-white/10` o `border-white/20`?
- [ ] ¿Botones con gradiente rojo si son primarios?
- [ ] ¿Chrome UI con `uppercase tracking-widest`?
- [ ] ¿Datos numéricos con `font-mono font-black`?
- [ ] ¿Estados (hover, focus, active, disabled) implementados?
- [ ] ¿Funciona sobre fondo transparente (overlay)?
- [ ] ¿Copy traducible pasado por `t()`?
- [ ] ¿No usa `font-tech`, naranja acento, o `text-gray-*` para texto principal?
- [ ] ¿Sigue `BRAND.md` en tono de voz si tiene copy?
- [ ] ¿Tests visuales pasan (Playwright harness si aplica)?

---

## 18. Documentos relacionados

- [`BRAND.md`](./BRAND.md) — Identidad de marca conceptual.
- `docs/styleguide.html` — Style guide HTML navegable.
- `docs/marketing/02-brand-strategy.md` — Estrategia detallada (mapping actualizado al final de este PR).
- `docs/widget-architecture.md` — Arquitectura canónica de widgets.
- `docs/widget-glassmorphism-parity.md` — Inventario de widgets por sección HTML.
- `docs/overlays-studio-visual-analysis-ui1.md` — Análisis visual del studio.
