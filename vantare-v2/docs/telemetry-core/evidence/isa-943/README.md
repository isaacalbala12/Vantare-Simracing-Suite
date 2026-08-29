# ISA-943 — Perfil v4 y Ajustes › Rendimiento

## Smoke Wails real

Se construyó primero la aplicación completa con `wails3 task build` y después
una copia diagnóstica no `production`, `bin/vantare-isa943-smoke.exe`, para
habilitar el gancho CDP existente. Se lanzó únicamente esa copia con:

- perfil aislado `C:\tmp\vantare-isa943\runtime-smoke\profile.json`;
- HTTP propio en `127.0.0.1:29245`;
- CDP propio en `127.0.0.1:9245`;
- WebView2 identificado por `--webview-exe-name=vantare-isa943-smoke.exe` y
  `--user-data-dir=...\vantare-isa943-smoke.exe\EBWebView`.

Antes de abrirla no existían procesos `vantare-baseline*`, `vantare-isa893*` ni
`vantare-isa940*`, y el puerto 9245 estaba libre. LMU permaneció abierto y no se
automatizó ni se cerró.

El helper reproducible
[`isa-943-performance-smoke.mjs`](../../../../scripts/bench/isa-943-performance-smoke.mjs)
abrió el overlay activo, conservó su target CDP, navegó mediante los controles
reales a Ajustes › Rendimiento y pulsó **Ahorro**. El frame v2 observado por el
pull HTTP cambió así:

| Medida | Antes | Después |
|---|---:|---:|
| `capabilities.performance.level` | 1 | 4 |
| `capabilities.performance.rafCap` | `null` | 30 |
| target CDP del overlay | `C73BD031CFCA6BBF007933B524151D40` | `C73BD031CFCA6BBF007933B524151D40` |

`sameOverlayTarget: true` demuestra que el cambio llegó en caliente sin recrear
la ventana. El resultado completo, incluidos `widgetHz`, diagnóstico y dump de
las siete opciones, está en
[`performance-hot-reload.json`](./performance-hot-reload.json). La pantalla real
queda en [`settings-performance.png`](./settings-performance.png).

Al terminar, CDP pidió `Application.Quit()` y se comprobó que solo el PID propio
14716 había terminado y que el puerto 9245 ya no escuchaba.

## Dump semántico · Personalizado con tres widgets

Vitest monta un perfil activo `triple` con `delta-main`, `standings-main` y
`relative-main`, una política `custom` de nivel 3 y override de Delta a 60 Hz +
`full`. Después inyecta el payload real de `performance:level` con los techos
20/5/15 Hz. El DOM observable es equivalente a:

```text
table[data-testid="orbit-settings-performance-table"]
  Widget       Hz del nivel  Override de cadencia  Efectos  Coste
  Delta        20            60 Hz                  full     +CPU +GPU
  Clasificación 5            Heredar                Heredar  —
  Relativo     15            Heredar                Heredar  —
```

Las filas estables para el pase visual son:

- `orbit-settings-performance-row-delta-main`
- `orbit-settings-performance-row-standings-main`
- `orbit-settings-performance-row-relative-main`

La prueba exige cuatro filas contando la cabecera y verifica explícitamente
`20`, `+CPU` y `+GPU` en Delta. No usa datos sintéticos en runtime: este dump es
evidencia del contrato de UI bajo Vitest, separada del smoke Wails anterior.

Los `updateHz` fast atípicos de un perfil v3 se conservan además como avisos
estructurados (`path`, widget, tipo y valor). Ajustes › Rendimiento los muestra
en el perfil activo y explica que la política v4 los sustituye; el log de Go
registra los mismos campos y el primer guardado conserva el original en
`<perfil>.v3.bak`.

## Alcance de la evidencia

Esta prueba demuestra Wails/WebView2 real, el control productivo de Ajustes y la
propagación caliente hasta `capabilities.performance`. No es una medición del
banco de huella, no valida las variantes visuales `noBlur`/`flat` y no presenta
los mismatches del shadow V1/V2 como hallazgos de ISA-943.
