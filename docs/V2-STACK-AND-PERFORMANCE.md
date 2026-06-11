# Vantare Overlays v2 — Stack, Arquitectura y Optimizaciones

> **Estado**: Confirmado | **Fecha**: 2026-06-11  
> Documento de referencia para el reinicio del proyecto. Reemplaza las decisiones de Electron v1.

---

## Tabla de contenidos

1. [Resumen ejecutivo](#1-resumen-ejecutivo)
2. [Stack confirmado](#2-stack-confirmado)
3. [Arquitectura del sistema](#3-arquitectura-del-sistema)
4. [Telemetría LMU (traducción)](#4-telemetría-lmu-traducción)
5. [Modelo de ventanas: perfil compuesto](#5-modelo-de-ventanas-perfil-compuesto)
6. [Presupuestos de rendimiento](#6-presupuestos-de-rendimiento)
7. [Optimizaciones — Telemetría (Go)](#7-optimizaciones--telemetría-go)
8. [Optimizaciones — Shell (Wails)](#8-optimizaciones--shell-wails)
9. [Optimizaciones — Overlays (React)](#9-optimizaciones--overlays-react)
10. [Optimizaciones — Hub y app general](#10-optimizaciones--hub-y-app-general)
11. [Optimizaciones — OBS / HTTP](#11-optimizaciones--obs--http)
12. [Optimizaciones — Temas y personalización](#12-optimizaciones--temas-y-personalización)
13. [Benchmarking — qué hacen otros repos](#13-benchmarking--qué-hacen-otros-repos)
14. [Checklist de cobertura](#14-checklist-de-cobertura)
15. [Capas de optimización](#15-capas-de-optimización)
16. [Roadmap de optimizaciones P0–P3](#16-roadmap-de-optimizaciones-p0p3)
17. [Anti-patrones (no hacer)](#17-anti-patrones-no-hacer)
18. [Estructura del repo v2](#18-estructura-del-repo-v2)
19. [Orden de implementación](#19-orden-de-implementación)
20. [Referencias](#20-referencias)

---

## 1. Resumen ejecutivo

Vantare v2 es un reinicio completo del producto. Se descarta **Electron + Node** por consumo de recursos. El objetivo es competir en rendimiento con apps como RacePulse e iOverlay, manteniendo UI moderna, personalización profunda y desarrollo asistido por LLMs.

**Decisiones clave:**

| Decisión | Elección |
|---|---|
| Shell desktop | Wails v3 (WebView2 nativo de Windows) |
| Backend / telemetría | Go 1.22+ |
| Frontend | React 19 + TypeScript + Tailwind v4 + shadcn/ui |
| Sim inicial | Le Mans Ultimate (LMU) |
| Ventanas overlay | **Una ventana compuesta por perfil** (shrink-wrap, no fullscreen en carrera) |
| Traducción LMU | Offsets generados desde Python ctypes; parser Go por offsets |
| OBS | HTTP embebido en Go + SSE; modo OBS-only sin ventana desktop |
| Optimización datos | Deadband + diff payload + FPS configurable por widget |

---

## 2. Stack confirmado

### 2.1 Tabla completa

| Capa | Tecnología | Versión | Propósito |
|---|---|---|---|
| Runtime desktop | Wails | v3 | WebView2, ventanas nativas, bindings Go↔JS |
| Lenguaje backend | Go | 1.22+ | Telemetría, lógica, HTTP, gestión de ventanas |
| Lenguaje frontend | TypeScript | 5.7+ | Tipado compartido con schemas |
| UI framework | React | 19 | Hub + widgets overlay (máximo soporte LLM) |
| CSS | Tailwind CSS | v4 | Utilidades + `@theme` para tokens |
| Componentes UI | shadcn/ui | latest | Dashboard premium sin diseñar desde cero |
| Bundler | Vite | 6+ | Build frontend |
| Codegen LMU | Python + ctypes | 3.11+ | **Solo build-time** — generador de offsets |
| Streaming OBS | Go `net/http` + SSE | — | Browser Sources en localhost |
| Persistencia | JSON + SQLite (opcional) | — | Perfiles, layouts, temas |
| Auth (post-MVP) | Supabase | — | Licencias freemium |
| Testing Go | `testing` + testify | — | Parser, normalizer |
| Testing frontend | Vitest + Testing Library | — | Componentes |
| E2E | Playwright | — | Hub + overlay compuesto |

### 2.2 Por qué este stack (objetivo vs alternativa)

| Objetivo | Esta elección | Alternativa descartada | Motivo |
|---|---|---|---|
| Rendimiento | Go + WebView2 | Electron | Sin Chromium embebido (~200 MB menos) |
| UI bonita | React + Tailwind + shadcn | WPF / Avalonia | CSS/HTML imbatible para diseño moderno |
| LLMs | React + Go | Rust/Tauri | Menos errores de compilación con IA |
| Personalización | CSS variables + JSON layouts | Templates rígidos | Temas y widgets configurables |
| LMU | Offsets desde Python ctypes | Struct Go con `unsafe` | Alineación C++ ≠ Go |

### 2.3 Lo que NO es el stack v2

- Electron, Node.js en runtime, koffi, sidecar Python en carrera
- Una ventana WebView2 por overlay
- React state a 60 Hz para RPM/speed/delta
- Unmarshal del struct LMU completo en Go

---

## 3. Arquitectura del sistema

### 3.1 Capas

```
┌─────────────────────────────────────────────────────────────┐
│ CAPA 1 — EXTRACCIÓN (Go)                                    │
│  mmap / UDP → bytes crudos del sim                          │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│ CAPA 2 — LÓGICA (Go)                                        │
│  parser por offsets → normalizer → cálculos (gap, delta)    │
└──────────────────────────┬──────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
┌─────────▼────────┐ ┌─────▼─────┐ ┌───────▼────────┐
│ CAPA 3a — Wails  │ │ CAPA 3b   │ │ CAPA 3c — Hub  │
│ Ventana overlay  │ │ HTTP+SSE  │ │ Ventana config │
│ (compuesta)      │ │ OBS       │ │ (normal)       │
└──────────────────┘ └───────────┘ └────────────────┘
```

### 3.2 Flujo de datos

```
LMU (mmap "LMU_Data")
  → Go Reader (poll 60 Hz, zero-copy slice)
  → Go Parser (offsets fijos)
  → Go Normalizer → Telemetry (struct unificado)
  → Go Event Bus (deadband + diff + throttle por widget)
       ├→ Wails binding → ventana overlay compuesta (shrink-wrap)
       ├→ Wails binding → hub (solo si visible)
       └→ HTTP SSE → OBS browser source (modo streaming: sin ventana Wails)
```

### 3.3 Regla de frecuencias

| Etapa | Frecuencia | Notas |
|---|---|---|
| Lectura mmap | 60 Hz | Goroutine dedicada, sin bloquear UI |
| Parse + normalize | 60 Hz | Debe completar en < 2 ms |
| Broadcast a UI | **30 Hz max** | Throttle en Go antes de cruzar a JS |
| Broadcast a OBS SSE | 30 Hz | Mismo throttle |
| Pintado RPM/delta | rAF | DOM directo, sin React state |
| Hub / settings | On demand | Solo en interacción usuario |

---

## 4. Telemetría LMU (traducción)

### 4.1 Problema

LMU expone ~325 KB de shared memory (`LMU_Data`) con structs C++ `#pragma pack(4)`. Go no puede mapear el struct completo con alineación correcta.

### 4.2 Solución (portar del repo v1)

1. **Fuente de verdad**: `pyLMUSharedMemory` (Python ctypes).
2. **Generador**: `tools/generate-lmu-offsets.py` → emite `internal/telemetry/lmu/offsets.go`.
3. **Parser runtime**: lectura por offset con `encoding/binary` (equivalente a `lmu-parser.ts`).
4. **Python en runtime**: **prohibido**. Solo codegen y dumps de test.

### 4.3 Archivos clave a portar

| Origen v1 | Destino v2 |
|---|---|
| `tools/generate-lmu-offsets.py` | Mismo script + salida Go |
| `packages/sim-core/src/lmu-parser.ts` | `internal/telemetry/lmu/parser.go` |
| `packages/sim-core/src/lmu-offsets.ts` | `internal/telemetry/lmu/offsets.go` (generado) |
| `test-data/lmu-fixture.bin` | `testdata/lmu-fixture.bin` |

### 4.4 Validación

- Test unitario contra fixture binario.
- Comparación en vivo: Go vs script Python ctypes (speed, gear, rpm deben coincidir).
- Sentinel checks: `mID >= 0`, driver name no vacío, `playerHasVehicle`.

---

## 5. Modelo de ventanas: perfil compuesto

### 5.1 Decisión confirmada

**Un perfil = una ventana overlay transparente** que contiene todos los widgets activos posicionados con CSS absolute/flex.

**Modo carrera (shrink-wrap):** la ventana se dimensiona al bounding box combinado de los widgets activos + padding — no ocupa el monitor entero.

**Modo edición:** ventana fullscreen (o maximizada) para drag & drop de widgets.

```
┌─ Ventana shrink-wrap (~900×500, solo donde hay widgets) ─────┐
│  ┌─────────────┐              ┌──────────────────┐         │
│  │  Standings  │              │     Relative     │         │
│  └─────────────┘              └──────────────────┘         │
│         ┌──────────────────────────┐                       │
│         │         Delta Bar          │                       │
│         └──────────────────────────┘                       │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Ventajas

| Métrica | N ventanas | 1 ventana compuesta |
|---|---|---|
| Instancias WebView2 | N | 1 |
| RAM estimada | ~50–80 MB × N | ~50–80 MB total |
| Suscripciones telemetría | N | 1 |
| Contextos GPU compositor | N | 1 |

### 5.3 Ventana hub (separada)

- Ventana **normal** (no transparente) para configuración.
- Solo se actualiza con telemetría cuando está visible (`Visibility API` + flag Go).

### 5.4 Modo avanzado (post-MVP)

Ventanas separadas por widget como opt-in para usuarios multi-monitor extremos. No es el default.

### 5.5 OBS

- **Un browser source** apuntando a `http://localhost:PORT/overlay/{profileId}`.
- Opcional: crop en OBS si solo quieren un widget en stream.

### 5.6 Shrink-wrap (P0)

Inspirado en [irDashies PR #447](https://github.com/tariknz/irdashies/pull/447).

| Modo | Tamaño ventana | Motivo |
|---|---|---|
| **Racing** | Bounding box de widgets + 8px padding | Menos superficie GPU (incluso transparente consume) |
| **Edit** | Fullscreen del monitor destino | Espacio para drag/resize |
| **OBS-only** | Sin ventana Wails | Cero compositor encima del sim |

Algoritmo Go:

```
minX = min(widget.x)
minY = min(widget.y)
maxX = max(widget.x + widget.w)
maxY = max(widget.y + widget.h)
windowW = maxX - minX + padding*2
windowH = maxY - minY + padding*2
```

- Recalcular bounds solo cuando cambia el layout (no cada tick de telemetría).
- Flag `skipWindowRefresh` al guardar layout: redimensionar, no recrear ventana (patrón irDashies).

### 5.7 Modos de perfil (P0)

| Modo | Ventana desktop | Hz UI | Click-through | Uso |
|---|---|---|---|---|
| **Racing** | Shrink-wrap, 1 compuesta | 30 (por widget, ver §7.10) | Sí | En pista |
| **Streaming** | Ninguna (OBS-only) | 30 vía SSE | N/A | Stream sin ventana sobre el juego |
| **Edit** | Fullscreen transparente | 10 | No | Posicionar widgets |

El perfil JSON incluye `displayMode: 'racing' | 'streaming' | 'edit'`.

---

## 6. Presupuestos de rendimiento

Objetivos medibles para v2 (Windows 11, sim corriendo):

| Métrica | Objetivo v2 | v1 Electron (referencia) |
|---|---|---|
| Binario instalado | < 40 MB | ~150 MB |
| RAM total (hub + 1 overlay compuesto) | < 120 MB | 250–400 MB |
| RAM por overlay compuesto | < 80 MB | 80–150 MB × N ventanas |
| CPU proceso Vantare | < 2% | 5–15% |
| Latencia telemetría (sim → UI) | < 33 ms | 50–100 ms |
| Parse LMU por tick | < 2 ms | — |
| Arranque a overlay visible | < 2 s | 3–5 s |
| FPS impacto en sim | Imperceptible | Variable |

---

## 7. Optimizaciones — Telemetría (Go)

### 7.1 Zero-copy mmap

```go
// Slice sobre memoria mapeada — NO copiar 325 KB por tick
hdr := (*[objectOutSize]byte)(unsafe.Pointer(addr))[:objectOutSize:objectOutSize]
```

Copiar solo si necesitas snapshot para replay; en hot path, leer in-place.

### 7.2 Parse parcial (lazy)

No parsear scoring completo si el widget activo no lo necesita:

| Perfil activo | Parse mínimo |
|---|---|
| Solo delta bar | player telemetry |
| Standings + relative | scoring + vehicles |
| Full | parse completo |

Implementar `ParseLevel` enum: `PlayerOnly`, `Scoring`, `Full`.

### 7.3 Throttle antes de JS

```go
const uiBroadcastHz = 30
ticker := time.NewTicker(time.Second / uiBroadcastHz)
// Acumular latest en atomic.Value; emitir solo en tick
```

Nunca emitir a Wails/JS a 60+ Hz.

### 7.4 Goroutine dedicada

```
[Reader goroutine]  → raw bytes
[Parser goroutine]  → Telemetry (channel buffered size 1, drop stale)
[Broadcast goroutine] → Wails + SSE (throttled)
```

Channel buffer size 1 = siempre datos más recientes, nunca cola creciente.

### 7.5 Evitar allocations en hot path

- Reutilizar `Telemetry` struct con campos mutados (sync.Pool si hace falta).
- Preallocar slice de vehicles con capacidad 104 (max LMU).
- `strings.Builder` solo fuera del hot path.

### 7.6 Detección de sim

- Poll proceso cada 2 s (`LMU.exe`), no cada tick de telemetría.
- Abrir/cerrar mmap solo en transiciones connect/disconnect.

### 7.7 REST API LMU (fase 2)

Datos no disponibles en mmap (weather, brake wear): poll a 1–5 Hz en goroutine separada, merge en normalizer. No bloquear el pipeline principal.

### 7.8 Deadband / umbral de emisión (P0)

Inspirado en [irDashies PR #426](https://github.com/tariknz/irdashies/pull/426) (reducción de precisión para evitar re-renders).

No emitir a UI si el cambio es imperceptible:

```go
func shouldEmit(prev, curr float64, threshold float64) bool {
    return math.Abs(curr-prev) > threshold
}
```

Umbrales recomendados:

| Campo | Umbral | Motivo |
|---|---|---|
| speed | 0.1 km/h | Oscilación del sim en último decimal |
| gap / delta | 0.001 s | Suficiente para UI; evita parpadeo |
| rpm | 50 | Aguja estable sin perder redline |
| fuel | 0.05 L | |
| lapDistPct[] | 0.0001 | Arrays de relative/track map |

Aplicar deadband **en Go** antes de serializar hacia JS/SSE.

### 7.9 Diff payload (P1)

En lugar de enviar `Telemetry` completo cada tick, enviar solo campos que cambiaron:

```json
{ "t": 1234567890, "d": { "speed": 287.3, "rpm": 8420 } }
```

- Go mantiene `lastEmitted Telemetry` y calcula diff.
- Frontend mergea diff en ref mutable.
- Reducir tamaño del bridge Wails y parsing JSON en WebView2.

### 7.10 FPS budget por widget (P1)

Inspirado en [RacePulse Features](https://racepulse.racing/features/) (60 / 30 / 15 FPS por widget).

Cada widget en el perfil JSON declara `updateHz`:

```json
{ "id": "standings", "type": "standings", "updateHz": 15 }
{ "id": "delta", "type": "delta", "updateHz": 30 }
{ "id": "rpm", "type": "telemetry-core", "updateHz": 60 }
```

Go emite eventos por widget o filtra en el broadcaster según el Hz configurado. El throttle global de 30 Hz (§7.3) actúa como techo; el Hz por widget actúa como sub-techo.

| Widget | Hz recomendado | Render |
|---|---|---|
| Standings / Relative | 15 | React state |
| Delta bar | 30 | DOM directo + CSS |
| RPM / speed / gear | 60 | DOM directo (rAF) |
| Track map | 20 datos / 60 paint | Canvas (§9.8) |
| Input trace | 30 | Canvas |

---

## 8. Optimizaciones — Shell (Wails)

### 8.1 WebView2 runtime

- Usar WebView2 del sistema (Wails default) — no empaquetar Chromium.
- Verificar WebView2 Runtime instalado en installer; fallback download si falta.

### 8.2 Ventanas

| Ventana | Opciones Wails |
|---|---|
| Overlay compuesto | `Frameless`, `BackgroundTypeTransparent`, `AlwaysOnTop`, `HiddenOnTaskbar` |
| Hub | Ventana normal, `BackgroundTypeSolid` |

### 8.3 Hardware acceleration

- Probar con aceleración **desactivada** en overlay si hay stutter con G-Sync (patrón iOverlay FAQ).
- Documentar toggle en settings: "Disable GPU acceleration".

### 8.4 DPI / multi-monitor

- Probar resize y cambio DPI temprano (bugs conocidos Wails v3 alpha).
- Workaround documentado: `SetFrameless(true)` post `WindowRuntimeReady`.

### 8.5 Click-through selectivo

- `IgnoreMouseEvents: true` en overlay compuesto por defecto (clicks pasan al sim).
- Zonas interactivas (drag en editor): hit-test custom o overlay de edición separado en hub preview.

### 8.6 No crear/destruir ventanas en runtime

- Crear ventana overlay una vez al activar perfil.
- Show/hide en lugar de new/destroy.

### 8.7 Shrink-wrap en Wails (P0)

- Implementar `ResizeWindow(x, y, w, h)` al cambiar layout o activar perfil racing.
- Posicionar ventana en coordenadas del monitor destino (`Profile.monitorIndex`).
- En modo edit: `SetFullscreen(true)`; al salir: restaurar shrink-wrap.

### 8.8 skipWindowRefresh (P0)

Al guardar layout desde hub:

- Actualizar JSON de posiciones.
- Redimensionar ventana existente.
- **No** destruir/recrear WebView2 (evita picos de RAM y flash visual).

Patrón de [irDashies PR #303](https://github.com/tariknz/irdashies/pull/303).

### 8.9 Process priority y compat GPU (P1)

Settings expuestos al usuario (patrones SimHub + iOverlay):

| Setting | Default | Notas |
|---|---|---|
| Process priority | Normal | Opción: Above normal |
| Disable GPU acceleration | Off | Toggle si G-Sync/HAGS causan stutter |
| Warn if game GPU > 90% | On | WMI/psutil; banner en hub |

Documentar conflictos conocidos: G-Sync/Freesync, Game Mode, Afterburner/RivaTuner (ver iOverlay FAQ).

---

## 9. Optimizaciones — Overlays (React)

### 9.1 Separar datos hot vs cold

| Tipo | Campos | Actualización |
|---|---|---|
| **Hot** | rpm, speed, delta, gear, lap time | DOM directo vía rAF |
| **Cold** | standings rows, driver names, pits | React state @ 30 Hz max |
| **Static** | theme tokens, layout positions | Solo en mount / config change |

### 9.2 Hook `useFastBind` (hot path)

```typescript
// frontend/lib/use-fast-bind.ts
export function useFastBind(ref: RefObject<HTMLElement>, getValue: () => string) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const tick = () => {
      el.textContent = getValue();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [getValue]);
}
```

Telemetría hot se lee de un ref mutable actualizado por Wails event, **no** de useState.

### 9.3 Store de telemetría

```typescript
// Ref global mutada por Wails callback — NO Zustand para hot fields
export const telemetryRef = { current: null as Telemetry | null };

// Wails event handler (Go → JS):
window.runtime.EventsOn('telemetry', (data) => {
  telemetryRef.current = data;
});
```

Zustand/Context solo para cold data y UI del hub.

### 9.4 Componentes

- `React.memo` en filas de standings (comparar por id + campos visibles).
- Keys estables (`vehicle.id`), nunca index.
- Virtualizar standings si > 30 filas (`@tanstack/react-virtual`).
- Evitar Framer Motion en datos hot; CSS transitions solo en cold.

### 9.5 CSS / compositing

```css
.overlay-widget {
  contain: layout style paint;
  will-change: transform; /* solo durante drag */
  transform: translateZ(0); /* layer propio, usar con moderación */
}
```

- Preferir `transform` + `opacity` para animaciones.
- Evitar `box-shadow` animado y `filter: blur` en widgets hot.
- `backdrop-filter` solo en widgets cold o estáticos.

### 9.6 Layout compuesto

- Posiciones en JSON: `{ widgetId, x, y, width, height, zIndex }`.
- Render: un `WidgetLayer` por widget, posición absolute.
- Editor drag en hub preview; overlay en carrera solo lee JSON (sin DnD library en overlay).

### 9.7 Bundle overlay

- Code-split: hub bundle ≠ overlay bundle.
- Overlay entry: minimal — sin router pesado, sin auth, sin devtools.
- Tree-shake shadcn: importar componentes individuales, no barrel completo.

### 9.8 Canvas para widgets gráficos (P1)

Inspirado en [irDashies PR #334](https://github.com/tariknz/irdashies/pull/334) (canvas caching + interpolación).

Usar `<canvas>` solo para:

- Track map / flat map
- Input trace (throttle/brake/steer scrolling graph)
- Delta bar animada (opcional; DOM también válido)

Patrón double-buffer:

```
Datos telemetría @ 20 Hz → state buffer
requestAnimationFrame @ 60 Hz → interpolar y pintar canvas
```

DOM/CSS para standings, relative, text overlays.

### 9.9 Redondeo en selectores React (P0)

Complemento al deadband Go — en frontend, comparar arrays float con precisión configurable:

```typescript
function roundEq(a: number, b: number, decimals = 3): boolean {
  const m = 10 ** decimals;
  return Math.round(a * m) === Math.round(b * m);
}
```

Aplicar en `React.memo` comparators y Zustand selectors para `CarIdxLapDistPct`, gaps, etc.

Hook: `useTelemetryRounded(decimals)` — evita re-render cuando deadband Go no cubrió un campo derivado.

### 9.10 Modo visual "Lite" (P2)

Toggle de perfil/tema para PCs débiles:

- Sin `backdrop-filter` / blur
- Sin animaciones CSS
- Solo texto plano + bordes sólidos
- Fuentes system-ui (sin web fonts)

---

## 10. Optimizaciones — Hub y app general

### 10.1 Hub no compite con el sim

- Hub window: pausar telemetría UI cuando minimizada u oculta.
- Preview en hub: mock data o throttle 10 Hz (no pipeline completo).

### 10.2 Arranque

- Lazy init: HTTP server y mmap solo cuando usuario lanza perfil o sim detectado.
- Splash mínimo; no cargar todos los widgets en hub al start.

### 10.3 Persistencia

- `electron-store` → JSON files o bbolt/SQLite en Go.
- Escribir config en debounce (500 ms), nunca por tick de telemetría.

### 10.4 System tray

- App vive en tray; hub se abre bajo demanda.
- Overlay compuesto persiste mientras perfil activo.

### 10.5 Logs

- `slog` estructurado en Go, nivel `warn` en producción.
- Sin `console.log` en overlay hot path.

### 10.6 Auto-update

- Go updater o WinSparkle; verificar post-MVP.
- Delta updates para binario pequeño (< 40 MB full update aceptable).

### 10.7 Widget "System Performance" (P1)

Inspirado en [TinyPedal FAQ](https://github.com/TinyPedal/TinyPedal/wiki/Frequently-Asked-Questions).

Widget opcional (hub o overlay) que muestra:

- CPU % proceso Vantare
- RAM MB (Go runtime + WebView2 estimado)
- Latencia telemetría (sim → UI) en ms
- Hz efectivo de broadcast

Útil para soporte, debugging y confianza del usuario ("¿Vantare me come FPS?").

### 10.8 Detección foco del sim (P1)

- Si LMU pierde foco / usuario en desktop: reducir broadcast a 5 Hz o pausar parse `Full`.
- Si hub minimizado: pausar telemetría hub (ya en §10.1).
- No pausar SSE si OBS browser source activo (flag de clientes conectados).

---

## 11. Optimizaciones — OBS / HTTP

### 11.1 SSE vs WebSocket

- **SSE** para OBS (unidireccional, simple, reconexión automática).
- WebSocket solo si bidireccional necesario (post-MVP).

### 11.2 Una conexión SSE por cliente

- OBS browser source = 1 EventSource.
- Payload JSON compacto; omitir campos no usados por perfil (`?fields=speed,rpm,gear`).

### 11.3 Compresión

- `gzip` en HTTP para assets estáticos del overlay page.
- SSE sin comprimir (overhead no worth it en localhost).

### 11.4 Cache headers

- HTML/CSS/JS del overlay: `Cache-Control: max-age=3600` en producción.
- SSE endpoint: no cache.

### 11.5 Mismo renderer

- La página HTTP del overlay compuesto usa **el mismo HTML** que la ventana Wails (mismo build Vite, distinto mode flag si hace falta).

### 11.6 Modo OBS-only (P1)

Perfil con `displayMode: 'streaming'`:

- Go inicia HTTP server + SSE.
- **No** crea ventana Wails overlay.
- Cero compositor encima del sim — máximo rendimiento para streamers.
- Hub sigue disponible para configurar; preview en hub con mock/throttle.

---

## 12. Optimizaciones — Temas y personalización

### 12.1 CSS variables (runtime)

```css
:root {
  --v-primary: #e10600;
  --v-bg-glass: rgba(0, 0, 0, 0.6);
  --v-font-display: 'Inter', sans-serif;
}
```

Cambio de tema = swap de clase en `:root`, sin re-mount de widgets.

### 12.2 Tokens compartidos

- `packages/tokens/` o JSON → genera CSS + Go constants.
- LLMs editan JSON de tema, no CSS suelto.

### 12.3 Widget schema (personalización)

```typescript
interface WidgetConfig {
  id: string;
  type: 'standings' | 'relative' | 'delta' | 'alerts';
  enabled: boolean;
  updateHz: 15 | 30 | 60; // FPS budget — ver §7.10
  position: { x: number; y: number; w: number; h: number };
  props: Record<string, unknown>; // columnas visibles, max rows, etc.
}

interface ProfileConfig {
  id: string;
  displayMode: 'racing' | 'streaming' | 'edit'; // ver §5.7
  monitorIndex: number;
  widgets: WidgetConfig[];
}
```

Validar con Zod en hub; Go recibe JSON ya validado.

### 12.4 Sin iframe por widget

- Un DOM tree, un CSS context.
- iframes prohibidos en overlay compuesto (coste GPU × N).

---

## 13. Benchmarking — qué hacen otros repos

Patrones validados en producción que informan las decisiones de v2.

### 13.1 irDashies (Electron + TypeScript, open source)

| Técnica | Referencia | Adoptado en v2 |
|---|---|---|
| Ventana contenedor única | [PR #303](https://github.com/tariknz/irdashies/pull/303) | ✅ §5 |
| −80–95% IPC (N×25 Hz → 1×25 Hz) | PR #303 | ✅ (Wails events, no IPC Electron) |
| Shrink-wrap bounding box | [PR #447](https://github.com/tariknz/irdashies/pull/447) | ✅ §5.6 |
| Redondeo floats / menos re-renders | [PR #426](https://github.com/tariknz/irdashies/pull/426) | ✅ §7.8, §9.9 |
| Canvas double-buffer track map | [PR #334](https://github.com/tariknz/irdashies/pull/334) | ✅ §9.8 |
| skipWindowRefresh en layout | PR #303 | ✅ §8.8 |
| Fix memory leaks IPC bridges | PR #303 | ⚠️ Aplicar a Wails event listeners |

**Lección:** la arquitectura importa más que el shell. irDashies logró mejoras masivas sin cambiar de Electron.

### 13.2 RacePulse (Go + Wails + React, closed source)

| Técnica | Adoptado en v2 |
|---|---|
| Go + Wails + React + Tailwind | ✅ Stack |
| ~21 MB single exe | ✅ Objetivo §6 |
| Telemetría 60 Hz, UI normalizada | ✅ §3.3 |
| FPS configurable por widget (60/30/15) | ✅ §7.10 |
| Modo edit vs click-through | ✅ §5.7 |
| Ventana por widget | ❌ Vantare usa 1 compuesta (mejor) |
| Session recording | 🔜 Post-MVP |

### 13.3 TinyPedal (Python + Qt nativo)

| Técnica | Adoptado en v2 |
|---|---|
| `update_interval` ms por widget | ✅ → `updateHz` §7.10 |
| Widget System Performance | ✅ §10.7 |
| Enable/disable widgets | ✅ `enabled` en WidgetConfig |
| Draw optimizado (−10 MB en release) | ⚠️ Profiling continuo |
| Qt nativo sin HTML | ❌ Sacrifica UI moderna |

**Lección:** control granular de Hz y auto-monitoreo de recursos.

### 13.4 SimHub (C# + WPF/HTML)

| Técnica | Adoptado en v2 |
|---|---|
| Ventanas borderless sobre el juego | ✅ Wails |
| Reducir superficie overlay (incluso transparente) | ✅ Shrink-wrap |
| GPU del sim < 90–95% | ✅ Aviso §8.9 |
| G-Sync puede bloquear render overlay | ✅ Toggle GPU §8.9 |
| HTML renderer > WPF para overlays dinámicos | ✅ WebView2 |
| NCalc / expresiones custom en loops | ❌ Evitar en hot path |
| Higher process priority | ✅ §8.9 |

### 13.5 iOverlay (cerrado)

| Técnica | Adoptado en v2 |
|---|---|
| Disable hardware acceleration | ✅ §8.9 |
| Conflictos G-Sync, HAGS, Afterburner | ✅ Documentar en hub |
| Solo iRacing | ❌ Vantare multi-sim |

### 13.6 Sequential (Go, open source)

| Técnica | Adoptado en v2 |
|---|---|
| mmap sin JSON en hot path | ✅ §7.1 |
| Batching solo para red/cloud | ✅ SSE local sin batch |
| Channel buffer size 1 | ✅ §7.4 |
| Paths live vs persistence separados | ✅ §7.4, §10.3 |

### 13.7 Enfoques descartados para v2

| Enfoque | Por qué no |
|---|---|
| DirectX inject (`electron-game-overlay`) | Máximo perf en fullscreen exclusive; complejidad extrema; malo para LLMs |
| Sidecar Python runtime | Latencia + proceso extra |
| Qt/WPF nativo | UI bonita difícil; peor ecosistema LLM para diseño |
| Tauri/Rust | Borrow checker vs LLMs |

---

## 14. Checklist de cobertura

Estado de optimizaciones planificadas:

| Optimización | Sección | Prioridad | Estado |
|---|---|---|---|
| Ventana compuesta | §5 | P0 | ✅ Documentado |
| Shrink-wrap | §5.6, §8.7 | P0 | ✅ Documentado |
| Modos racing / stream / edit | §5.7 | P0 | ✅ Documentado |
| Throttle Go→JS 30 Hz | §7.3 | P0 | ✅ Documentado |
| Deadband emisión | §7.8 | P0 | ✅ Documentado |
| Parse parcial LMU | §7.2 | P0 | ✅ Documentado |
| DOM directo hot fields | §9.1–9.2 | P0 | ✅ Documentado |
| Redondeo selectores React | §9.9 | P0 | ✅ Documentado |
| skipWindowRefresh | §8.8 | P0 | ✅ Documentado |
| FPS por widget | §7.10 | P1 | ✅ Documentado |
| Diff payload | §7.9 | P1 | ✅ Documentado |
| Modo OBS-only | §11.6 | P1 | ✅ Documentado |
| Canvas map/inputs | §9.8 | P1 | ✅ Documentado |
| System Performance widget | §10.7 | P1 | ✅ Documentado |
| Settings compat GPU | §8.9 | P1 | ✅ Documentado |
| Detección foco sim | §10.8 | P1 | ✅ Documentado |
| Modo visual Lite | §9.10 | P2 | ✅ Documentado |
| Web Worker sort standings | — | P2 | 🔜 Pendiente spec |
| SharedArrayBuffer telemetría | — | P2 | 🔜 Prematuro |
| DirectX inject | §13.7 | P3 | ❌ Descartado |

---

## 15. Capas de optimización

Mapa de impacto — implementar de abajo hacia arriba:

```
[Nivel 7] Compat      GPU toggles, process priority, avisos G-Sync     §8.9
[Nivel 6] Modos       racing / streaming / edit                       §5.7
[Nivel 5] Render      DOM hot / Canvas graphs / Lite theme            §9
[Nivel 4] Transporte  diff payload + Hz por widget + deadband        §7.8–7.10
[Nivel 3] Ventana     shrink-wrap + skipWindowRefresh                 §5.6, §8.7–8.8
[Nivel 2] Datos       parse parcial + zero-copy mmap                  §7.1–7.2
[Nivel 1] Arquitectura 1 ventana compuesta                           §5
[Nivel 0] Stack       Go + Wails + React                              §2
```

Cada nivel depende del anterior. No optimizar render (Nivel 5) antes de tener shrink-wrap (Nivel 3).

---

## 16. Roadmap de optimizaciones P0–P3

### P0 — Implementar en MVP

1. Ventana compuesta + shrink-wrap en modo racing.
2. Deadband Go antes de emitir a JS/SSE.
3. Modos `racing` / `edit` (streaming puede ser P1).
4. skipWindowRefresh al guardar layout.
5. DOM directo para RPM/speed/delta/gear.
6. Redondeo en comparadores React (standings/relative).

### P1 — Primera release estable

1. FPS configurable por widget (`updateHz` en JSON).
2. Diff payload en bridge Wails.
3. Modo OBS-only (`displayMode: 'streaming'`).
4. Canvas para track map e input trace.
5. Widget System Performance.
6. Settings: GPU acceleration off, process priority.
7. Pausa/reducción Hz cuando sim sin foco.

### P2 — Post-lanzamiento

1. Modo visual Lite (sin blur/animaciones).
2. Web Worker para sort standings / class positions.
3. Virtualización standings > 30 filas.
4. Profiling automatizado en CI (benchmark parse LMU).

### P3 — No planificado v2

1. Inyección DirectX en pipeline del juego.
2. SharedArrayBuffer cross-thread.
3. Sidecar Python en runtime.
4. VR / OpenXR.

---

## 17. Anti-patrones (no hacer)

| Anti-patrón | Por qué |
|---|---|
| Una ventana WebView2 por widget | RAM × N, GPU × N |
| `useState` para RPM a 30+ Hz | Re-renders innecesarios |
| Sidecar Python en carrera | Latencia + proceso extra |
| Struct Go completo para LMU | Alineación incorrecta |
| Electron "optimizado" | Sigue embebiendo Chromium |
| Parse completo LMU cada tick | CPU waste si solo necesitas speed |
| Framer Motion en delta bar | JS overhead en hot path |
| Telemetría sin throttle a JS | Saturación WebView2 bridge |
| shadcn en overlay hot widgets | Bundle bloat; CSS custom ligero |
| Logs por tick | I/O disk en hot path |
| Ventana overlay fullscreen en carrera | GPU waste; usar shrink-wrap |
| Emitir telemetría sin deadband | Re-renders por ruido float |
| Recrear WebView2 al mover widget | Flash + pico RAM; usar skipWindowRefresh |
| Superficie overlay > bounding box widgets | SimHub documenta coste GPU |
| NCalc / JS eval en loops de telemetría | CPU alto (lección SimHub) |

---

## 18. Estructura del repo v2

```
vantare-v2/
├── cmd/vantare/main.go              # Wails entry (próximo)
├── cmd/lmu-debug/main.go            # CLI telemetría LMU ✅
├── internal/
│   ├── app/                         # Orquestador
│   ├── telemetry/lmu/               # reader, parser, offsets (gen)
│   ├── core/                        # normalizer, gap, delta, fuel
│   ├── windows/                     # overlay compuesto, shrink-wrap, modos
│   └── server/                      # HTTP + SSE (+ OBS-only mode)
├── pkg/models/                      # Telemetry, Profile, WidgetConfig, DisplayMode
├── frontend/
│   ├── hub/                         # React dashboard
│   ├── overlay/                     # Composite overlay entry (minimal)
│   ├── widgets/                     # standings, relative, delta, perf...
│   └── lib/                         # fast-bind, telemetry-ref, round-eq
├── tools/
│   ├── generate-lmu-offsets.py      # ctypes → Go offsets
│   └── dump-lmu-memory.py           # fixtures
├── testdata/
│   └── lmu-fixture.bin
├── configs/                         # perfiles ejemplo JSON
├── go.mod
├── wails.json
└── docs/
    └── V2-STACK-AND-PERFORMANCE.md  # este documento
```

---

## 19. Orden de implementación

| Fase | Entregable | Validación |
|---|---|---|
| **1** | Go LMU reader + parser + CLI debug | Consola muestra speed/rpm/gear |
| **2** | Normalizer + deadband + throttle 30 Hz | Benchmark < 2 ms/parse |
| **3** | Wails ventana compuesta shrink-wrap (1 widget) | < 80 MB RAM, bounds correctos |
| **4** | Layout JSON + modos racing/edit + 3 widgets | Posiciones persisten, skipWindowRefresh |
| **5** | Hub React + shadcn | Config sin tocar JSON manual |
| **6** | HTTP SSE + modo OBS-only | Browser source sin ventana desktop |
| **7** | FPS por widget + diff payload | Standings @ 15 Hz, delta @ 30 Hz |
| **8** | Temas CSS variables + Lite mode | Swap en runtime |
| **9** | System Performance widget + GPU settings | Usuario ve CPU/RAM propios |
| **10** | iRacing, AC adapters | Multi-sim |

---

## 20. Referencias

| Recurso | Uso |
|---|---|
| [RacePulse](https://racepulse.racing/) | Go + Wails + React; FPS por widget; ~21 MB |
| [RacePulse Features](https://racepulse.racing/features/) | Hz configurable, modos edit/click-through |
| [irDashies PR #303](https://github.com/tariknz/irdashies/pull/303) | Ventana contenedor única, −80–95% IPC |
| [irDashies PR #447](https://github.com/tariknz/irdashies/pull/447) | Shrink-wrap overlay |
| [irDashies PR #426](https://github.com/tariknz/irdashies/pull/426) | Redondeo telemetría |
| [irDashies PR #334](https://github.com/tariknz/irdashies/pull/334) | Canvas caching track map |
| [Sprint (kratofl/sprint)](https://github.com/kratofl/sprint) | Monorepo Go + Wails + React |
| [TinyPedal](https://github.com/TinyPedal/TinyPedal) | update_interval, System Performance widget |
| [SimHub DashStudio performance](https://github.com/SHWotever/SimHub/wiki/DashStudio-performance) | GPU load, superficie overlay, G-Sync |
| [goLMUSharedMemory](https://pkg.go.dev/github.com/stephenhoran/goLMUSharedMemory) | Referencia mmap LMU en Go |
| [Wails v3 window options](https://github.com/wailsapp/wails/blob/master/v3/pkg/application/webview_window_options.go) | Ventanas transparentes |
| [iOverlay FAQ](https://ioverlay.app/help) | GPU acceleration, G-Sync, terceros |
| Repo v1 `lmu-parser.ts` / `generate-lmu-offsets.py` | Parser validado a portar |

---

## Changelog de este documento

| Fecha | Cambio |
|---|---|
| 2026-06-11 | Creación — stack v2 confirmado, ventana compuesta, optimizaciones |
| 2026-06-11 | Benchmarking industria, shrink-wrap, deadband, modos perfil, P0–P3, checklist |
