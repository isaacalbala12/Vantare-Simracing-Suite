> **Actualización 2026-09-30:** [entrega de continuación ISA-1427](../fuel_strategy/PARIDAD-1427.md).
> El informe siguiente conserva el histórico del primer porte; sus señales
> ausentes y porcentajes quedan sustituidos por esa entrega.

# Broadcast Tower Eficiencia — ISA-1427

Worker local para [GitHub #1427](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1427).
Base asignada: `6973c81f29574a573d76f3fae48e128d6964960a`, rama
`vantareapp/isa-1427-w-broadcast-tower`. Notion no disponible por encargo de
Isaac: el orquestador debe reconciliar su seguimiento y revisar todo el diff.
Sin push, PR, merge, promoción ni dependencias nuevas.

## Alcance

- Renderer GPUI productivo, registrado como `broadcast-tower`, 1920 × 71 px.
- Configuración congelada: cinco tarjetas, clima visible, SOF oculto y tira
  discreta (sin carrusel). El contrato del host solo entrega `Preferences`;
  las opciones de contenido, tamaño y nivel de movimiento siguen pendientes
  del host/Studio. No se añade una segunda vía de configuración.
- Dominio puro: orden por posición, nombres abreviados, clase y color, número,
  líder, gaps en segundos con tres decimales o en vueltas, idioma/unidades,
  valores ausentes/obsoletos y bandera de sesión. Los datos estimados siguen
  la política común de `Quality::current`.
- Movimiento por identidad: FLIP horizontal (250–360 ms), fundidos de entrada
  y salida (120 ms) y aviso de adelantamiento (450 ms). Los cambios de texto
  no disparan movimiento; época/sesión/calidad reinician el estado.
  `Wake::Idle` termina todos los movimientos y avisos. La duración por
  distancia usa el ancho congelado de tarjeta, no un layout medido en GPUI.
- Escena reconstruida del Workshop `default/race/track/ready`, DTO v3;
  **no es una captura LMU**. Solo los cinco pilotos visibles:
  identidades `vehicle-000..004` → `CarId(1..5)`;
  el jugador es `CarId(1)`. 28 °C → 301,15 K; sin máximo de vueltas conocido.

## Señales ausentes y límites

- `player.lapNumber`: entero de vueltas, fresco/obsoleto/ausente. El modelo
  solo expone `Car::laps` (vueltas completadas): no se deriva la vuelta en
  curso. Se pinta **VUELTA —**, igual que la referencia congelada sin esa señal.
- Estado de fuente (`overlayV2Source.state`, enum sin unidad, más motivo y
  retry): `Snapshot` no distingue desconexión de error ni retry. Se degrada
  con posiciones `Unsupported/Supported` → SIN DATOS y `WithData` → DATOS
  ANTIGUOS; no se inventan estados de transporte. Un retry de transporte sin
  nueva época no puede distinguirse para reiniciar el movimiento.
- SOF no lo muestra el renderer productivo y no se crea una señal para él.
- No valida conducción LMU, OBS, rendimiento conjunto, otros DPI ni monitores.

## Paridad

Capturar únicamente desde `native/` con:

```powershell
# compare.ps1 trae -j 4; limitarlo sin editar el script compartido.
$cargoExe = (Get-Command cargo.exe).Source
function cargo {
    $limitedArgs = @($args)
    for ($i = 0; $i -lt $limitedArgs.Count - 1; $i++) {
        if ($limitedArgs[$i] -eq '-j') { $limitedArgs[$i + 1] = '2' }
    }
    & $cargoExe @limitedArgs
}
.\ui\compare.ps1 -Widget broadcast-tower -MaxPercent 4
```

El monitor principal disponible mide 1920 × 1080. `ui/src/capture.rs` exige
`w.ceil() + 2 <= client_width` para la marca fuera del widget: esta referencia
de 1920 px necesita un monitor/área cliente de al menos **1922 px**. No reducir
la tira ni alterar la referencia para eludir esa condición. La comparación
queda pendiente: el script se ejecutó el 2026-09-30, compiló con `parity-capture`
y `-j 2`, y salió con **1**:

```text
el widget (1920x71) no cabe en el área cliente con su marca de captura
la captura falló
```

Log local: `%TEMP%\broadcast-tower-compare.log`. Sin candidato no hay porcentaje válido
ni diagnóstico de píxeles. El propietario de la infraestructura puede resolver
la marca de captura o repetir el mismo script en un monitor más ancho.

## Reutilización pendiente del kit

Reutiliza `efficiency::{text, col, rect, paint_rect, paint_panel, paint_frame}`
y `domain::format` para sesión, temperatura, líder y vueltas. Quedan locales
la composición de tarjetas, bandas diagonales/bandera, paleta de clases, FLIP
horizontal y evaluación Bézier: el kit actual no los expone. Son candidatos
para el propietario del kit al revisar su segundo consumidor. El formato
de gap a tres decimales es candidato para `domain::format`.

## Validación y continuación

Antes de los hitos de dominio y widget: `cargo fmt --check`, formato explícito
del módulo generado por la macro, `cargo clippy --workspace --all-targets -j 2
-- -D warnings` y `cargo test --workspace -j 2` pasaron (salida 0).
El hito de widget usa `RUST_TEST_THREADS=1`, solo en el proceso de validación:
no se modifica configuración del repo ni se omiten tests adicionales.

Validación final de escena (2026-09-30): los mismos tres gates, salida **0**;
`RUST_TEST_THREADS=1`, compilación `-j 2`. Suite completa: **294 pruebas
pasadas**, contando las siete del harness de ciclo de vida; **4 live omitidas**.
Nueve tests nuevos del widget (4 domain + 5 UI) verifican formatos, calidad,
proyección, movimiento finito, reset de época, repintado y DTO/textos congelados.
La escena JSON decodifica por el IPC existente y conserva el gap del líder
como `Unavailable`; su etiqueta LÍDER no inventa una distancia cero.
También pasó `cargo test -p vantare-ui --features parity-capture --lib -j 2
broadcast_tower`: **5/5**, incluyendo `animating()` inactivo tras la ingesta
inicial de la escena. No constituye una captura ni aceptación visual.

Se conserva el historial de fallos: la compilación inicial dio `LNK1102:
out of memory` en `vantare-core`; pasó al reintentar. Otra pasada encontró
`ipc::latest::tests::put_wakes_a_waiting_reader_and_close_releases_it`
con `(false, true)` en lugar de `(true, true)`. Usa sleeps para su coordinación;
pasó aislada y en la suite serializada. No se toca IPC ni se declara corregida
esa prueba. Cuatro tests live siguen omitidos porque requieren LMU/ACC activos.

El orquestador debe revisar el diff completo, resolver/repetir la captura de
1920 × 71, decidir las extracciones al kit y reconciliar Notion. No hay
aceptación de paridad, rendimiento ni promoción. No se ejecutan gates Go o
frontend: no cambian código ni contratos de esas capas.
