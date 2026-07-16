# Vantare Engineer — Radio Overlay Visual Spec

> **Tipo:** spec visual de producto. NO codificar hasta aprobación de Isaac.
> **Worktree:** `codex/engineer-release`.
> **Fase:** EN7.1.
> **Aplicable a:** `frontend/src/overlay/widgets/EngineerNotificationsWidget.tsx`.
> **Restricciones:** no tocar `internal/**`, no tocar transportes Wails/SSE, no tocar schema de perfiles, no tocar otros widgets.

## 1. Objetivo

Transformar el widget actual de notificaciones de Ingeniero en un panel de radio estilo F1 que se muestra cuando el ingeniero/spotter "habla". Hoy el widget es una caja estática de texto; el spec define un comportamiento visual por estado, con speaker label, categoría, timing y micro-animaciones que evocan un canal de radio abierto.

## 2. Estados visuales

El widget reacciona al campo `EngineerNotification` recibido por transporte Wails o SSE.

### 2.1 `incoming` (por defecto al recibir una notificación)

Mensaje acaba de entrar. No se ha alcanzado su `ExpiresAt`.

- Borde lateral izquierdo de 3 px en color de severidad (`info` blanco, `warning` amarillo, `critical` rojo).
- Fondo `glass-panel` semitransparente (`backdrop-blur-md`).
- Speaker label `Ingeniero` en mayúsculas compactas (`tracking-wider`).
- Categoría (`spotter`, `engineer`, `pit`, `system`) en mono pequeño a la derecha.
- Texto del mensaje en `font-bold` con severidad.
- Indicador de "radio abierta" en el speaker label: un dot pulsante `bg-vantare-red-500 animate-pulse` mientras no haya expirado.
- Timestamp `HH:MM:SS` en mono `text-[8px]` abajo a la derecha (solo si hay espacio).

### 2.2 `speaking` (futuro, opcional)

No implementable ahora sin TTS real. Marcar como follow-up: cuando llegue audio real, podría añadir waveform animada. Reservar el estado en el spec para no romper arquitectura.

### 2.3 `expired`

`now > ExpiresAt`. El mensaje se oculta (transparente). Si llega otra notificación, reemplaza. El estado `expired` no se renderiza: el widget vuelve a estar invisible.

### 2.4 `priority-warning` (severity=warning)

Severidad media. Hereda de `incoming` con:

- Borde amarillo (`border-yellow-500/30`).
- Fondo amarillento sutil (`bg-yellow-950/20`).
- Speaker label en `text-yellow-400`.
- Texto en `text-yellow-400`.
- Dot pulsante ámbar (no rojo).

### 2.5 `priority-critical` (severity=critical)

Severidad alta. Hereda de `incoming` con:

- Borde rojo intenso (`border-red-500/40`).
- Fondo rojizo (`bg-red-950/30`).
- Speaker label en `text-red-400`.
- Texto en `text-red-400`.
- Dot pulsante rojo, animación más rápida (`animate-pulse` con duración ~600 ms).
- Badge `CRITICAL` opcional en mono pequeño.

## 3. Speaker label

Etiqueta compacta, fija, arriba a la izquierda del widget. Hoy dice `Ingeniero`. Se mantiene por ahora; si más adelante hay varios speakers (spotter vs engineer vs pit), se diferencian aquí.

- Tipografía: `font-bold text-[9px] uppercase tracking-wider`.
- Color según severidad.
- Dot pulsante a la izquierda (`w-1.5 h-1.5 rounded-full animate-pulse`).

## 4. Categoría

Texto pequeño a la derecha del speaker label.

- Valores: `spotter` (default), `engineer`, `pit`, `system`.
- Tipografía: `font-mono text-[8px] text-white/30 uppercase`.
- Si la categoría es desconocida o vacía, no se muestra.

## 5. Mensaje

Cuerpo del mensaje (`EngineerNotification.Text`).

- Tipografía: `text-xs font-bold leading-relaxed break-words`.
- Color según severidad (info blanco, warning amarillo, critical rojo).
- Truncado por `break-words` (no por字数 fijo) para evitar clipping de frases largas tipo "tres en paralelo, mantén tu línea".

## 6. Timing

- `durationMs` por defecto: 3500 ms. Hoy se calcula desde `ExpiresAt - CreatedAt` si existe; si no, el widget no expira por sí mismo.
- Fade-in: 250 ms (CSS `animate-in fade-in slide-in-from-bottom-2`).
- Fade-out: 200 ms al expirar.
- Sin re-render agresivo: el widget solo lee del bus, no calcula frecuencia.

## 7. Edit mode

Comportamiento existente, sin cambios:

- Caja con `border-dashed border-white/20 bg-black/40`.
- Texto `Ingeniero` + `Widget de Notificaciones`.
- `min-width: 180px`, `min-height: 60px`.
- Sin simulaciones de estado.

## 8. Runtime mode sin mensajes

Sin cambios: `null` (transparente). El widget es invisible en runtime cuando no hay notificación activa.

## 9. Transporte

Sin cambios:

- Wails en overlay desktop: `engineer:notification`.
- SSE en OBS: `GET /engineer/stream` evento `engineer-notification`.
- `transport: "none"` en preview/edit mode.

La selección visual de estado se aplica **idéntica** en Wails y SSE, basada en `severity` y `expiresAt` del payload.

## 10. Mock-ups HTML (referencia visual)

> Estos son bocetos ASCII para visualizar el layout. La implementación real usará Tailwind.

### Estado `incoming` (info)

```
┌──────────────────────────────────────────┐
│ ● INGENIERO                       SPOTTER│
│ Coche a la izquierda                     │
│                              14:32:07    │
└──────────────────────────────────────────┘
```

### Estado `priority-warning`

```
┌──────────────────────────────────────────┐
│ ● INGENIERO                       SPOTTER│
│ Tres en paralelo                         │
│                              14:32:21    │
└──────────────────────────────────────────┘
  (borde y texto amarillos)
```

### Estado `priority-critical`

```
┌──────────────────────────────────────────┐
│ ● INGENIERO                       ENGINEER│
│ Frenos, frenos, frenos                   │
│                              14:32:34    │
└──────────────────────────────────────────┘
  (borde y texto rojos, badge CRITICAL opcional)
```

## 11. Estructura de props del widget (sin cambio de contrato público)

```ts
type EngineerNotificationsWidgetProps = {
  editMode: boolean;
  telemetryMode?: "live" | "mock";
  updateHz?: number;
  props?: Record<string, unknown>;
  transport?: "wails" | "sse" | "none";
};
```

Los `props` internos relevantes son opcionales y no rompen widgets existentes:

- `maxVisible?: number` (default 1; cola breve en futuro).
- `showTimestamp?: boolean` (default true si hay espacio).
- `criticalBadge?: boolean` (default true).

## 12. Criterios de aceptación

- Los tres estados de severidad (`info`, `warning`, `critical`) son visualmente distinguibles sin leer texto.
- El dot pulsante aparece siempre que hay notificación activa y desaparece al expirar.
- Edit mode muestra placeholder sin cambios.
- Runtime mode sin mensajes: `null`.
- Wails y SSE producen el mismo render.
- Test de snapshot (o render test) cubre los 4 estados.
- `pnpm test -- EngineerNotificationsWidget` pasa.
- `pnpm build` y `pnpm lint` pasan.
- `git diff --check` sin errores bloqueantes.

## 13. Fuera del scope de EN7

- TTS real / audio playback.
- Animación de waveform (reservada para `speaking` cuando llegue TTS).
- Multi-mensaje en cola visible (solo se mantiene el actual; el store guarda hasta 50 en historial).
- Cambios al bus de notificaciones, SSE o Wails events.
- i18n (textos siguen viniendo pre-traducidos desde el backend).
- Settings persistidos del widget.

## 14. Decisiones pendientes de Isaac

- ¿Dot pulsante siempre? ¿O solo en `critical`?
- ¿Badge `CRITICAL` visible o solo color?
- ¿Timestamp visible por defecto o solo en `critical`?

## 15. Próximo paso tras aprobación

EN7.2: implementar el polish en `frontend/src/overlay/widgets/EngineerNotificationsWidget.tsx` solo visual (helper puro `engineer-radio-style.ts` si crece), tests focales, verificación manual desktop+OBS.

No tocar:
- `internal/**` (Go).
- `frontend/src/engineer/**` (tipos y hooks).
- `frontend/src/hub/pages/EngineerPage.tsx` (Hub, no overlay).
- `frontend/src/hub/preview/WidgetRenderer.tsx`, `frontend/src/overlay/CompositeApp.tsx`, `frontend/src/overlay/ObsOverlayApp.tsx`, `frontend/src/hub/preview/WidgetList.tsx` (ya registran el widget).
- Schema de perfiles, configs, `cmd/vantare/main.go`, `pkg/models/**`.