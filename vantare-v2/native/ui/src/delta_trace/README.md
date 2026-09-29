# Delta-trace Eficiencia — ISA-1427, fase 2

Entrega aislada del worker Codex, 2026-09-30, pendiente de revisión por el
orquestador Claude Opus 5.5. [Issue GitHub #1427](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1427)
abierta; Notion no disponible por excepción explícita del encargo de Isaac.
No se ha actualizado ni verificado una tarea Notion; el orquestador debe
reconciliar ese seguimiento. Sin push, PR, CI remota, merge ni promoción.

Base asignada: `6973c81f29574a573d76f3fae48e128d6964960a`.
Rama: `vantareapp/isa-1427-w-delta-trace`.
Hitos previos: dominio `fee79215ba0d15d77df9c6991ca46d1573a449ad`;
widget `5cc8a525f7c6a8987e6fbbb6f4c87209d3e7444c`.

## Alcance y límites

- Proyección pura de `player.delta_best_s`: fiable o estimado y finito → delta
  con signo y tres decimales; cero observado → `+0.000`; ausente, no finito o
  `Stale` → `—`. Se usa `Quality::current`, como los widgets nativos existentes.
  El VM Wails acepta valores `stale`; esta diferencia de frescura es explícita.
- La tendencia permanece `DESCONOCIDO` / `UNKNOWN`: el signo del delta actual
  no permite calcular la comparación de las últimas dos ventanas de 10 puntos.
- Sin buffer de UI, reloj local ni muestras reconstruidas entre snapshots.
  Se dibuja la guía estática del eje, pero no el punto a cero que fabrica el
  fallback vacío del TSX. No representa una medición.
- Geometría del renderer congelado: layout 1000 × 144, superficie visible
  1000 × 277.71875; PNG 1000 × 278. Inter, tokens, panel y marco del kit.
  La cobertura de la guía SVG se conserva por fila de píxeles físicos.
- TSX/CSS no tienen animaciones ni avisos temporales para este widget:
  `Wake::Idle`, `animating() == false`. Solo repinta si cambia el texto dibujado.
- La sombra exterior que queda fuera del PNG y los modos de efectos distintos
  de `noBlur` no se reproducen aquí. El brillo conserva la aproximación existente
  de Standings (primer tramo de 120°, el resto suma menos de 1 % de blanco).

## Señales sin representación

| Señal productiva | Unidad / calidad | Consecuencia |
| --- | --- | --- |
| `delta.history.capturedAtMS` y `delta.history.seconds` | Instantes Unix absolutos en ms y deltas en s; arrays alineados, tope 120; calidad `fresh` / `stale` | No hay serie en Snapshot/DTO v3. Curva y punto final ausentes; tendencia desconocida. No usar `origin.received_at` como sustituto. |
| `sectorDeltas` | Diferencias en segundos; sin señal/calidad canónica en el VM V2 productivo | Sectores ocultos, aunque `showSectors` sea true. `last_sectors_s` no contiene diferencias frente a una referencia. |
| `trackPath` | Geometría SVG en viewBox 100 × 50; sin señal/calidad canónica | Mapa oculto, aunque `showTrackMap` sea true. |
| `turnInsight` | Texto; sin señal/calidad canónica | Consejo de curva oculto. |

El propietario del modelo/IPC debe coordinar la representación de la historia.
Este worker no amplía esas capas. La ventana de 1–8 s no se puede aplicar sin la
serie; el renderer productivo filtra contra su muestra más nueva, nunca el reloj
del navegador. Los otros tres gaps ya están declarados en el VM V2 Wails.

## Escena y paridad

`ui/fixtures/delta-trace.snapshot.json` reconstruye datos del Workshop
`default/race/track/ready`, partiendo del DTO v3 de pedales y de
`ui/reference/delta-trace.geometry.json`. Conserva la identidad del jugador y
el escalar fresco `0.214` como `Reliable`. Es una demostración reconstruida,
no una captura LMU real. La referencia muestra `+0.257` porque prioriza el
último punto de su historia (`0.2569571616254974`); no se sustituye el escalar.

Captura oficial: **8524 / 278000 px distintos, 3.0662 %**, umbral por canal 8,
RGBA premultiplicado, sin máscaras, salida 0. La primera pasada dio 3.7683 %;
corregir la cobertura parcial de la guía eliminó 1952 píxeles distintos.
Quedan 7556 px en la curva/punto ausentes, 480 en el valor, 442 en la tendencia
y 46 en esquinas. El umbral numérico pasa, pero falta la función de traza por
la señal ausente. No acredita LMU/ACC en vivo, OBS ni multimonitor/DPI mixto.

Candidato y diff: `%TEMP%\vantare-parity\delta-trace\delta-trace.png` y
`delta-trace.diff.png`. No se modifican las referencias.

Desde `native/`, en una sesión PowerShell temporal, con escritorio visible y
DPI 100 %, reproducir con el script oficial y su mutex. Su `-j 4` fijo se
limita localmente a 2 sin editar el script:

```powershell
$env:CARGO_PROFILE_DEV_DEBUG = '0'
$env:CARGO_PROFILE_TEST_DEBUG = '0'
function cargo {
    $TaskCargoArguments = @($args)
    for ($TaskArgIndex = 0; $TaskArgIndex -lt $TaskCargoArguments.Count - 1; $TaskArgIndex++) {
        if ($TaskCargoArguments[$TaskArgIndex] -eq '-j') { $TaskCargoArguments[$TaskArgIndex + 1] = '2' }
    }
    & cargo.exe @TaskCargoArguments
}
.\ui\compare.ps1 -Widget delta-trace -MaxPercent 4
```

## Gates y candidatos compartidos

Antes de los commits de dominio/widget: `cargo fmt --check`, `rustfmt` explícito
del módulo UI, `cargo clippy --workspace --all-targets -j 2 -- -D warnings` y
`cargo test --workspace -j 2`: salida 0, **289 aprobadas y 4 omitidas** que
requieren LMU/ACC en vivo. La primera compilación de tests con símbolos falló
en `windows`: `memory allocation of 3129344 bytes failed`; no ejecutó tests.
Se repitieron los gates con `CARGO_PROFILE_DEV_DEBUG=0` y
`CARGO_PROFILE_TEST_DEBUG=0`, sin cambiar manifests, dependencias o tests.

Cierre de escena: los mismos gates, salida 0, **290 aprobadas, 4 omitidas y
0 fallos**. Además, `cargo clippy -p vantare-ui --all-targets --features
parity-capture -j 2 -- -D warnings` pasó y `cargo test -p vantare-ui --lib
--features parity-capture delta_trace -j 2` aprobó **3/3**, incluido el fin de
animación. Log completo de la suite: `%TEMP%\delta-trace-final-gates.log`.

Candidatos a compartir por sus propietarios, sin tocar el kit en este encargo:
formato de delta con signo y tres decimales en `domain::format`; brillo de panel
120° y borde superior 24 % en `ui::efficiency`; cobertura de trazos horizontales
SVG en píxeles físicos. No se añaden dependencias ni abstracciones anticipadas.
