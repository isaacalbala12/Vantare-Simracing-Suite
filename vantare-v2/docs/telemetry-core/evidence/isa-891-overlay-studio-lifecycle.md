# ISA-891 — transporte dirigido de Studio y lifecycle Overlay V2

Fecha: 2026-08-28.

Base: `origin/nightly@741d31bf76740a469b4d91ff21da6817e912db30`.

Rama: `vantareapp/isa-891-overlay-v2-studio-lifecycle`.

## Problemas confirmados

La auditoría previa a retirar Overlay V1 encontró dos huecos concretos:

- Desktop consumía V1 y V2 mediante el pull HTTP acotado de ISA-879, pero
  Studio seguía registrando la proyección V1 en el bus global de Wails.
- Overlay V2 solo publicaba desde `WriteBatch`. Una transición de lifecycle sin
  un frame posterior no llegaba y una ventana que se registraba tarde no podía
  recuperar el estado actual.

El segundo hueco también permitía cualquier string como `source.state` en la
frontera TypeScript. Al cerrarla aparecieron dos literales inválidos que el
typecheck anterior no podía detectar: `detected` y `missing`.

## Corte implementado

El registry V2 retiene exclusivamente el último status JSON y su revisión. No
crea un publisher sin consumidor, no retiene frames y exige revisiones
monótonas. Al registrarse el primer consumidor, el publisher recibe ese status
antes de empezar a entregar snapshots. El runtime publica cada cambio canónico
`stopped/detecting/connecting/live/degraded/stale/error/stopping` como un
`OverlayUpdateV2` sin frame.

Go declara y valida el conjunto cerrado; el generador produce
`OverlaySourceStateV2` y el decoder frontend rechaza cualquier otro valor.

Studio registra V2 y el adapter V1 sobre una misma fuente local, y solo después
inicia una única sesión `/_vantare/overlay-telemetry/pull`. Parar la preview
cierra la sesión, detiene V1 y retira los listeners V2 de forma idempotente. El
estado V2 cruza el provider de Studio como `WidgetRuntimeInput` puro hasta el
`WidgetVisualHost` compartido. Las flags V2 siguen apagadas por defecto: este
corte no cambia la autoridad visual ni retira V1.

## Regresiones deterministas

- status V2 sin consumidor no activa el publisher de frames;
- un consumidor tardío recupera el último status, sin snapshot inventado;
- una revisión regresiva es rechazada;
- el pull entrega el status retenido aunque nunca haya existido `WriteBatch`;
- un estado desconocido falla en proyección Go y en el decoder TypeScript;
- V1 y V2 se registran antes de abrir la única sesión pull de Studio;
- start/stop repetidos y reinicio no duplican sesión ni listeners;
- un fallo al arrancar V1 revierte todos los listeners;
- bajo StrictMode y una respuesta pull que nunca termina hay exactamente una
  petición en vuelo, un solo cierre y cero eventos globales de proyección;
- el runtime V2 puro llega al único `WidgetVisualHost` de Studio.

## Evidencia local del corte

- Commits funcionales: `6bd72d37398dfb6eaed80fbfdfdbe57bc61ff47e`
  y `f6269aaf1a6b71b0ac3c17589d00ec0ea1b4e5c2`.
- Paquetes Go `overlayv2`, `telemetrytransport` y `internal/app`: PASS.
- Tests frontend enfocados: PASS, 6 archivos y 78 tests.
- `go test ./...`: PASS.
- Suite frontend completa: PASS, 418 archivos y 3.148 tests. `happy-dom`
  imprimió el `AbortError` conocido durante teardown; Vitest terminó con código
  0.
- `pnpm --dir frontend typecheck`: PASS.
- `pnpm --dir frontend build`: PASS.
- ESLint sobre los 11 archivos del segundo corte: PASS.
- `go run ./tools/telemetry-contract-gen -check`: PASS.
- Tests de roadmap: PASS, 23.
- Tests de comunicaciones/changelog: PASS, 64.
- `wails3 task windows:build` con canal `nightly`: PASS. El generador temporal
  de configuración se ejecutó en la tarea canónica y eliminó
  `cmd/vantare/supabase_build.go` al finalizar; no quedó diff generado.
- `git diff --check`: PASS.

## Límites de esta evidencia

Los tests deterministas acreditan memoria y colas acotadas en la frontera que
controla Vantare, pero no sustituyen una prueba Wails/WebView2 real. Antes de
cerrar ISA-891 falta una sesión LMU real verificando Studio Live. Retirar V1,
promover V2 a autoridad y corregir Relative pertenecen respectivamente a
ISA-894, ISA-893 e ISA-892.
