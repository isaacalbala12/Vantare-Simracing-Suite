# Delta Eficiencia — worker ISA-1427

Entrega local para revisión de Claude Opus 5.5. Base del worktree:
`6973c81f29574a573d76f3fae48e128d6964960a`, rama
`vantareapp/isa-1427-w-delta`. Referencia técnica:
[GitHub #1427](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1427).
Notion no disponible según el encargo; el orquestador debe reconciliar el
seguimiento. Sin push, PR, merge, release ni promoción.

## Alcance

- Instrumento por defecto de 280 × 96, panel sin blur como el golden,
  delta con signo y escala ±1,5 s. Referencia personal del núcleo;
  `Unavailable` y números no finitos dan guion y ninguna barra.
- Un valor `Stale` se conserva con el rótulo DATOS ANTIGUOS. Se desactivan
  avisos al perder la calidad ready, cambiar época, sesión, jugador o referencia.
- La barra interpola left/width durante 140 ms. El cruce conserva el último
  lado no neutro y dura 700 ms, con fundido de 350 ms. Vuelta completada:
  2600 ms; mejor personal: 4000 ms, prioridad sobre vuelta completada.
  Avisos con entrada/salida de 180 ms, temporizador durante el tramo quieto.
  La renovación sustituye el plazo anterior. `animating()` termina.
- El widget guarda cambios de los tiempos laterales sin repintar mientras
  permanecen ocultos; la secuencia de la foto no pertenece al dibujo.
- La escena DTO v3 reconstruye solamente al jugador de Workshop
  `default/race/track/ready`, con delta +0,214 y vueltas 1:31.234/1:30.964.
  Es una demostración reconstruida, no una captura LMU.

## Señales y configuración fuera de este corte

| Señal productiva ausente del modelo común | Unidad / tipo | Calidad necesaria |
| --- | --- | --- |
| `delta.references[requested=session-best].seconds` | segundos, firmado | Reliable / Estimated / Stale / Unavailable |
| `delta.references[requested=previous-lap].seconds` | segundos, firmado | Reliable / Estimated / Stale / Unavailable |
| `delta.references[].requested`, `.reference`, `.authority`, `delta.available` | identidades de referencia, procedencia y lista | ausencia explícita; asociadas a la calidad de seconds |
| `overlayV2Source.state`, `.reason` | estado de conexión y texto diagnóstico, sin unidad | estado explícito; no deducible de una foto conservada |

`Player.delta_best_s` sí representa la referencia personal; no se deduce otra
referencia a partir de la diferencia entre tiempos de vuelta. La proyección
`project_reference` devuelve SIN DATOS y el aviso de referencia no disponible
para las otras dos solicitudes. El contrato actual del registro solo recibe
`Preferences` (idioma/unidades): no permite seleccionar referencia, plantilla
capsule, efectos ni movimiento reducido. Este worker conserva el instrumento
personal por defecto y no amplía el host/modelo/IPC. La selección de esas
preferencias queda para el propietario común.

No están verificadas visualmente las variantes capsule, los estados vacíos o
stale, los avisos en movimiento ni una sesión física LMU/OBS. Los tests de reloj
determinista prueban plazos y continuidad, no la rasterización de cada frame.
Los fundidos temporales son una aproximación acotada de las curvas CSS.

## Posibles aportaciones al kit, sin extraer aquí

- Formato delta firmado con tres decimales: `domain::format` ya tiene
  `lap_time`, pero `to_fixed` es privado; se conserva localmente su regla JS.
- Fuente monoespaciada: el kit registra solo Inter; la escala usa Inter en las
  cajas congeladas de JetBrains Mono. No se añadió fuente ni dependencia.
- Fondo con degradado de 120 grados y marco superior al 24 %: misma composición
  concreta que Standings, candidata a compartir en una revisión del kit.
  Solo se reproduce el primer tramo del degradado como hace Standings.

## Verificación

Captura física por `compare.ps1`: **1005/26880 px distintos (3,7388 %)**,
umbral por canal 8, sin máscaras, 280 × 96; salida 0 con `-MaxPercent 4`.
Artefactos en `%TEMP%/vantare-parity/delta/delta.png` y `delta.diff.png`.
SHA-256 del candidato:
`9a69d9eccfd26019b3fd318c812e7eba50035b923e9beeb7b84cd101fb3cad7f`.

La zona principal de texto tiene 682 px residuales; la flecha, 39 px. Las otras
zonas corresponden a escala/brillo y antialiasing de esquinas/marcas. La geometría
coincide; quedan diferencias de rasterización DirectWrite/Chrome y la fuente de
la escala indicada arriba. No se retoca la referencia ni se enmascaran zonas.

Antes de **cada** commit: `cargo fmt --check`,
`cargo clippy --workspace --all-targets -j 2 --offline -- -D warnings` y
`cargo test --workspace -j 2 --offline`. Los gates de dominio y widget pasan
completos; el de escena también pasa completo antes del commit de evidencia
(verificado el 2026-09-30). Resultado final: dominio 20 tests, UI 37 tests,
incluidos los 12 tests nuevos de Delta; ningún fallo en el workspace.
Formato adicional: `rustfmt --edition 2024 ui/src/delta/mod.rs`, que descubre
sus submódulos. Tests: `CARGO_PROFILE_DEV_DEBUG=0`, `RUST_TEST_THREADS=2`;
no se omiten ni alteran tests para pasar. Cuatro tests live existentes quedan
ignorados por diseño (tres LMU y uno ACC; requieren los juegos en marcha).

El primer `cargo test --workspace -j 2` con debuginfo falló en dependencias
gráficas por OOM de Windows (error 1455: archivo de paginación demasiado pequeño;
no pudo mapear metadata de `alloc`). Clippy normal ya pasa. El reintento de tests
y la captura usan `CARGO_PROFILE_DEV_DEBUG=0`, sin cambiar archivos de Cargo,
dependencias ni configuración de Windows. Todas las compilaciones tienen `-j 2`.
Un intento completo falló también en el test heredado
`ipc::latest::tests::put_wakes_a_waiting_reader_and_close_releases_it`: recibió
`(false, true)` frente a `(true, true)`. El test duerme 20 ms antes de publicar y
20 ms antes de cerrar; el lector pudo ver el cierre antes de correr. Pasó al
repetir el gate. No se modificó IPC; queda como riesgo de intermitencia bajo carga.
La captura se hace exclusivamente con `ui/compare.ps1`. El script contiene
`-j 4`; durante esta tarea se usa una función PowerShell local que cambia ese
argumento a `2` al invocar Cargo, sin editar el script ni el comparador.

Reproducción con el mismo límite de compiladores, desde `native/`:

```powershell
$env:CARGO_PROFILE_DEV_DEBUG = '0'
$deltaCargo = (Get-Command cargo -CommandType Application).Source
function cargo {
    $deltaArgs = @($args)
    for ($i = 0; $i -lt $deltaArgs.Count; $i++) {
        if ($deltaArgs[$i] -eq '-j') { $deltaArgs[$i + 1] = '2' }
    }
    & $deltaCargo @deltaArgs
    $global:LASTEXITCODE = $LASTEXITCODE
}
.\ui\compare.ps1 -Widget delta -MaxPercent 4
```

Hitos locales: dominio `bc101c291c0fd1f3a2bc9da62c8545c6ef4b9429`, widget
`b7ba7db64fd79fe4e9613133b86ef582821e3728`; escena/evidencia en el commit
que incorpora este handoff. Logs completos de tests en
`%TEMP%/vantare-delta-gates-{domain,widget,scene}.log`.

Preguntas para el orquestador: resolver en el contrato común la selección de
referencia/plantilla/movimiento reducido y decidir la incorporación de formato,
fuente y superficie al kit. No bloquean el instrumento congelado.
