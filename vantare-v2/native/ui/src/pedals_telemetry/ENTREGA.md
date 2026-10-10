> **Actualización 2026-09-30:** [entrega de continuación ISA-1427](../fuel_strategy/PARIDAD-1427.md).
> El informe siguiente conserva el histórico del primer porte; sus señales
> ausentes y porcentajes quedan sustituidos por esa entrega.

# Pedals telemetry · ISA-1427 · fase 2

Worker Codex para revisión completa del orquestador Claude Opus 5.5.
Seguimiento: [GitHub #1427](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1427).
Proyecto técnico: arquitectura Rust nativa, ADR 0099, fase 2.
Issue releída antes de entregar: `OPEN`, última modificación registrada
`2026-09-29T20:31:18Z`; la entrega local no cierra ni integra la issue.
Notion no disponible por instrucción del encargo: reconciliación y handoff
general pendientes del orquestador. Ninguna escritura Notion simulada.

## Alcance

- `domain/src/pedals_telemetry.rs` y una exportación en `domain/src/lib.rs`.
- `ui/src/pedals_telemetry/mod.rs`, artwork `wheel.svg` y este informe.
- Una línea en `ui/src/registry.rs`.
- `ui/fixtures/pedals-telemetry.snapshot.json`, reconstrucción Workshop
  default/race/track/ready, DTO v3; **no captura LMU**.

Fuente confirmada en `vantare-functional/manifest.ts`:
`PedalsAdvancedEfficiency.tsx`, helpers y tests de `pedals-telemetry-view-model-v2`.
Geometría: `ui/reference/pedals-telemetry.geometry.json`, 300 × 112.
Escena: `tools/widget-reference/scene.tsx`. No hay gráfica de historial en este
renderer; no se reconstruye una serie ficticia.

La proyección conserva ausencia como `None`/`—`, conserva valores stale con
aviso y opacidad 0,55, limita pedales y redondea porcentajes como el producto.
Reutiliza `domain::format` para marcha, unidades/velocidad y rpm menores de 1000.
Respeta idioma español/inglés y unidades métricas/imperiales del host.
Las barras interpolan 60 ms, retoman el valor visible al interrumpirse y
devuelven `Wake::Idle` al acabar; cambios de instrumentos no reinician barras.
Una nueva época y la ausencia de una entrada no interpolan desde datos antiguos.

Sin dependencias nuevas, `unsafe` ni `unwrap` en producción. El SVG es el
artwork genérico productivo con sus variables CSS resueltas; lo rasteriza GPUI.

## Señales y límites

| Señal ausente del modelo común | Unidad / calidad | Resultado |
| --- | --- | --- |
| `OverlayFrameV2.player.steering` | fracción -1..1, `fresh/stale/missing/invalid`; referencia `0.08 fresh` | Volante genérico neutro, igual que el renderer productivo sin steering; no se inventa `0.08`. La referencia está girada 36°. |
| `OverlaySourceStatusV2.state` y `reason` | estado enumerado y texto; sin unidad física | No se puede distinguir connecting/stopping/disconnected/error de una foto sin datos. Se muestra `SIN DATOS`, o `DATOS ANTIGUOS` si hay calidad stale. |

El modelo común, IPC, runtime y kit compartido no se amplían. Se porta la
composición/configuración por defecto; el host actual solo entrega `Preferences`,
sin `content.showClutch`, settings de catálogo de volante ni apariencia/layout
editables. `showPosition` tampoco se dibuja en el renderer productivo Eficiencia.
No hay giro animable sin la señal de steering; su transición productiva de 90 ms
queda pendiente de ese contrato. Este widget no contiene avisos temporales.
No se afirma paridad de estados/configuraciones personalizados, DPI distinto
de 100 %, ni validación física LMU/OBS, rendimiento o consumo de memoria.

## Candidatos para compartir tras revisar el segundo consumidor

- Formato compacto `7.2k` a `domain::format` (actualmente local y probado).
- Artwork genérico y caché SVG para el widget compacto de pedales, si lo consume.
- Fondo Eficiencia con radio configurable: este renderer usa radio 10 y alfa
  0,92; `paint_panel` compartido fija radio 6. Aquí usa `col`, `rect`, `text` y
  `tokens::PANEL/LOSS` existentes, sin cambiar el aspecto de otros widgets.

## Verificación

Captura real mediante `compare.ps1`: **3120/33600 px distintos = 9,2857 %**,
umbral por canal 8, RGBA premultiplicado, sin máscaras. Salida **1**: el gate
de ≤4 % **no pasa**. Tamaño correcto: 300 × 112. La marca de captura en esta
base todavía está a la derecha; el widget no ocupa todo el ancho del monitor
y la captura sí termina. No se modificó infraestructura de captura.

Desglose del comparador: volante 2556 px, texto 483 px, esquinas 63 px y barras
18 px. El volante tiene orientación neutra por ausencia de steering frente a
36° en la referencia; también cambia la rasterización SVG de GPUI frente a
Chrome. Los otros 564 px (1,6786 % del total) corresponden al texto
DirectWrite/Chrome, antialiasing de esquinas y recorte fraccional de barras.
Un análisis de desplazamientos de ±1 px confirma que mover el texto empeora
la comparación; no se aplican compensaciones artificiales ni se inventa giro.

Gates de dominio y widget: fmt/format del módulo, clippy del workspace y tests
del workspace **PASS** (284 tests de resumen estándar y 7 escenarios del harness
de lifecycle, 4 omisiones físicas existentes).
El hito escena añade una prueba del DTO/valores congelados. Últimos gates
**PASS**: `cargo fmt --check`, rustfmt explícito del módulo,
`cargo clippy --workspace --all-targets -j 2 -- -D warnings` y
`cargo test --workspace -j 2`: **285 tests de resumen estándar + 7 escenarios
de lifecycle ejecutados, 4 ignored**, con debug desactivado y dos hilos de test.
Los 4 ignored son REST/SHM de LMU, SHM de LMU repetido en el binario y ACC live;
se dejan intactos. La prueba nueva de 1000 rpm reprodujo primero `1000` en vez
de `1.0k` y pasó después de corregir el orden de la conversión SI, sin epsilon.
Se repiten los tres gates antes de cada commit. Los logs quedan en
`%TEMP%/vantare-pedals-telemetry-gates/`.

Incidencia en una repetición del gate escena: `children_die_with_the_launcher`
falló en `runtime/tests/lifecycle.rs:507` al indexar `starts("overlays")[0]`
con una lista vacía. `running` espera `overlays.log`, pero `lines("status")`
convierte cualquier error de lectura en una lista vacía. No se registró el
error de I/O, por lo que no se afirma su causa exacta. Dos suites previas y
la repetición aislada de los 7 escenarios pasaron; no se modificó runtime ni
se debilitó ninguna prueba. Las 4 pruebas del widget pasaron también aisladas.
La suite completa posterior pasó en el código final (`final-tests.log`).
Pendiente del orquestador: revisar ese acceso directo/lectura del test existente
si reaparece; la evidencia fallida se conserva en `scene-tests.log`.
Dos capturas por el script dieron idéntico porcentaje y desglose.

Los comandos se ejecutan desde `native/` con:

```powershell
$env:CARGO_PROFILE_DEV_DEBUG = '0'
$env:RUST_TEST_THREADS = '2'
cargo fmt --check
rustfmt --edition 2024 --check ui/src/pedals_telemetry/mod.rs
cargo clippy --workspace --all-targets -j 2 -- -D warnings
cargo test --workspace -j 2
```

La versión de `compare.ps1` en esta base contiene `-j 4`. Para cumplir el límite
de dos jobs sin editar ese archivo, se usa una función temporal en el proceso
PowerShell de captura; el script original conserva todo su flujo y mutex:

```powershell
$cargoExe = (Get-Command cargo -CommandType Application).Source
function cargo {
    $cargoArgs = @($args)
    for ($i = 0; $i -lt $cargoArgs.Count - 1; $i++) {
        if ($cargoArgs[$i] -eq '-j') { $cargoArgs[$i + 1] = '2' }
    }
    & $cargoExe @cargoArgs
}
.\ui\compare.ps1 -Widget pedals-telemetry -MaxPercent 4
```

Para verificar manualmente, repetir ese script a 100 % de DPI, con escritorio
visible y sin ventanas encima. El candidato y diff quedan en
`%TEMP%/vantare-parity/pedals-telemetry/`. Revisar datos vacíos y stale con
snapshots que marquen `unavailable` y `stale` (nunca cambiar a reliable cero),
y probar cambios de pedales con fuente viva después de la integración.

## Git y revisión

Worktree asignado: `C:/tmp/vw2-pedals-telemetry/vantare-v2`.
Rama: `vantareapp/isa-1427-w-pedals-telemetry`, base inicial `6973c81f29574a573d76f3fae48e128d6964960a`, limpia al entrar.
`origin/nightly` se obtuvo y sus instrucciones se leyeron; remoto observado
`f29b5fee04022756f9ae59f19bf153f91eebe4ed`. Se conserva la base de integración
asignada al worker; el orquestador reconcilia el conjunto.
Solo commits locales por hito. Sin push, PR, CI remoto, merge, promoción ni release.
Revisión completa del diff y reconciliación del seguimiento pendientes.
Dominio: `cfa3f51dc97cacf6893307a9bb0ed54e05a3bad9`.
Widget: `1a2c200978ccc33df28a71b80178a6f6c1993ba8`.
El commit de escena contiene este informe y se identifica en el entregable.
El repo marca SVG como binario: revisar `wheel.svg` también con `git diff --text`
desde la base, además de abrir su texto (no basta el stat binario).

Pregunta para el orquestador: priorizar steering en el contrato común para
cerrar la paridad del volante; mantener los demás límites explícitos en fase 2.
