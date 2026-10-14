> Evidencia histórica de #1427; contrato vigente en [README nativo](../../README.md). Estados, versiones DTO y gates siguientes describen su corte, no la base actual.

# Evidencia de paridad — car-damage-numbers (ISA-1427)

Fecha: 2026-09-30. Issue: https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1427.
Base asignada: `6973c81f29574a573d76f3fae48e128d6964960a`.
Notion no disponible; excepción de Isaac en el encargo. Reconciliación pendiente del orquestador.

## Escena y cobertura

`ui/fixtures/car-damage-numbers.snapshot.json` es una demostración reconstruida,
no una captura LMU. Reproduce Workshop default/race/track/ready congelado en
`ui/reference/car-damage-numbers.geometry.json`: dents `[1,2,3,4,5,6,7,8]`
proyectados a daño completo aero/body/suspension (integridad nativa `0`), y goma
restante `[0.98,0.91,0.87,0.93]`. Resultado: `100%, 100%, 100%, 13%`.
Las demás señales del jugador se marcan `unavailable`; fuente `unknown/replay`.
El test del módulo decodifica el DTO real y exige esos valores visibles.

La proyección valida fracciones finitas 0–1, invierte integridad, conserva datos
obsoletos con aviso y exige las cuatro ruedas para afirmar el máximo desgaste.
Reutiliza `domain::format`. Admite etiquetas ES/EN y `show_tyres=false` en
proyección/painter; el host actual usa el valor por defecto `true`.
No hay animaciones ni avisos temporales en este renderer productivo:
`Wake::Idle`, `animating=false`; repinta solo cambios visibles.

## Captura y límite

Captura exclusivamente mediante `ui/compare.ps1 -Widget car-damage-numbers -MaxPercent 4`.
140 × 149 px; umbral por canal 8, RGBA premultiplicado, sin máscaras ni cambios
al comparador o a la referencia. Mejor resultado: **1259 / 20860 px = 6.0355 %**.
**No cumple el gate de paridad de 4 %.**

1139 diferencias están en las bandas de texto; las 120 restantes, fuera de
ellas, se concentran en los bordes/esquinas. Se conserva Inter 750 y la
geometría CSS congelada. Las cajas de los glifos coinciden aproximadamente,
pero DirectWrite y Chrome producen distintas coberturas de antialiasing y
posiciones subpíxel. Es la explicación del exceso, pendiente de revisión visual.
Mover la línea de base de los valores −0.5 px empeoró a 1529 / 20860 = 7.3298 %;
se revirtió. No se conserva un ajuste de geometría que empeore la captura.

Candidato y diff: `%TEMP%/vantare-parity/car-damage-numbers/`.
El widget tiene 140 px de ancho: no alcanza el ancho del monitor ni requiere
el fix de la marca de captura bajo los widgets anchos. Esta base usa marca lateral.

Para respetar dos jobs sin editar el `-j 4` del script compartido se invocó en
una PowerShell de la tarea con este envoltorio temporal (desde `native/`):

```powershell
$env:CARGO_PROFILE_DEV_DEBUG = '0'
$env:RUST_TEST_THREADS = '2'
$global:carDamageCargo = (Get-Command cargo -CommandType Application | Select-Object -First 1).Source
function cargo {
    $captureArgs = @($args)
    for ($jobIndex = 0; $jobIndex -lt $captureArgs.Count; $jobIndex++) {
        if ($captureArgs[$jobIndex] -eq '-j' -and $jobIndex + 1 -lt $captureArgs.Count) {
            $captureArgs[$jobIndex + 1] = '2'
        }
    }
    & $global:carDamageCargo @captureArgs
}
.\ui\compare.ps1 -Widget car-damage-numbers -MaxPercent 4
```

## Señales y kit

Las cuatro señales numéricas del widget existen en `Player.damage`.
Falta `overlayV2Source.state`: estado categórico de fuente
`live/stale/degraded/error/stopped/stopping`, sin unidad ni calidad `q` propia.
`Snapshot` no lo representa: no se inventan error/desconexión; se muestran
`SIN DATOS` o `DATOS ANTIGUOS` según disponibilidad/calidad. No se amplió el modelo.
`overheating`, `detached` y `wheelDetachedCount` no los dibuja este productivo.

Candidatos para el kit, cuando lo revise el orquestador:

- Inter 750: instancia Latin de la misma `Inter-Variable.woff2`, generada con
  `ui/assets/make-fonts.py` ajustando solo peso/destino al módulo. Licencia OFL
  existente en `ui/assets/fonts/OFL-Inter.txt`. Sin dependencias nuevas.
- Redondeo de porcentajes en empates como `toFixed(0)`: ajuste local antes de
  llamar a `format::percent`, que usa redondeo al par.

## Validación y alcance

Gates antes de los commits: `cargo fmt --check`, rustfmt explícito del módulo
(macros del registro), `cargo clippy --workspace --all-targets -j 2 -- -D warnings`
y `cargo test --workspace -j 2`. Perfil DEV debug=0, tests con dos hilos.
Una ejecución previa con debug completo cayó por OOM; se repitió con estos límites.
Cuatro tests live quedan omitidos por sus condiciones explícitas (LMU/ACC).
Los corpus/replays y la captura GPUI no demuestran este widget en LMU/OBS live.

Solo rutas asignadas. Commits locales; sin push, PR, merge, promoción ni release.
Revisión del diff, captura y límite pendiente de Claude Opus 5.5.
