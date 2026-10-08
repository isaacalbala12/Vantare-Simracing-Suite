> **Actualización 2026-09-30:** [entrega de continuación ISA-1427](PARIDAD-1427.md).
> El informe siguiente conserva el histórico del primer porte; sus señales
> ausentes y porcentajes quedan sustituidos por esa entrega.

# Fuel Strategy Eficiencia — worker ISA-1427

Issue: https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1427.
Base asignada: `6973c81f29574a573d76f3fae48e128d6964960a`.
Rama: `vantareapp/isa-1427-w-fuel-strategy`. Solo commits locales.
Notion no disponible por instrucción del encargo; reconciliación pendiente del
orquestador. No se modifica el handoff compartido fuera de las rutas permitidas.

## Alcance

Proyección pura de `Player.fuel`, textos ES/EN, litros incluso con preferencia
imperial (contrato productivo), guiones para ausencia/obsolescencia/invalidación,
estados de capacidad y composición por defecto de 680 × 204. No calcula consumo,
autonomía ni combustible requerido en el widget. `fuelPercent` sigue sin
publicarse como en el ViewModel V2 productivo: la barra queda vacía.

El productivo no contiene animaciones ni avisos temporales de combustible;
`frame` devuelve `Wake::Idle` y `animating()` es siempre falso. El repintado
compara solo textos y etiquetas visibles, ignorando revisiones, cambios de
capacidad del depósito y cambios numéricos que no alteran el redondeo.

## Señales que faltan

| Señal productiva | Unidad y calidad de la referencia | Degradación |
| --- | --- | --- |
| `fuel.requiredFuel` | L, fresh, 169.1 | Guion en NEC. y EST. META; no multiplicar por vueltas en la UI. |
| `fuel.history.lap` + `fuel.history.consumed` | Vuelta + L/vuelta, fresh; vueltas 14–17, consumos 2.21/2.08/2.26/2.12 | Sin filas ni panel de historial, igual que el productivo con historial vacío. |
| `fuel.estimatedLaps` + `fuel.basis` | Vueltas, fresh, 79; base `session` | La escena deja `fuel_laps_left` unavailable. `Fuel.laps_left` solo expresa autonomía del depósito; no se le asignan 79 vueltas de sesión. |
| `source.state` / `source.reason` | Estado/reason del origen (sin unidad), `live` en referencia | Snapshot no distingue desconexión/error ni lleva motivo; estado visible según presencia de jugador y capacidad `fuel`. |

La configuración por widget (`showProjection`, `historyRows`, selector de energía
virtual) no entra en el registro actual: se porta el default congelado. No se
reinterpretan litros como energía virtual ni se añade configuración al host.

## Escena y evidencia

`ui/fixtures/fuel-strategy.snapshot.json` es una reconstrucción Workshop
default/race/track/ready del frame congelado, DTO v3; **no es una captura LMU**.
Representa 42 L, capacidad 100 L y consumo 2.14 L/vuelta como `reliable`.
Conserva 79 vueltas de sesión en el campo de sesión, sin usarlas como autonomía.

Hitos locales: dominio `c50947c830daf5a1a2e1bf500ab877f31bdc07d5`; widget y
registro `e631f55246b373e1b7c45f1be4bfb5f7bdc82aaf`. Cada hito ejecutó formato,
Clippy con warnings como errores y tests completos del workspace antes de commit.

Gates finales (2026-09-30), `CARGO_PROFILE_DEV_DEBUG=0`, `RUST_TEST_THREADS=2`:

| Comando | Resultado |
| --- | --- |
| `rustfmt --edition 2024 --check ui/src/fuel_strategy/mod.rs` | PASS, código 0; la macro no descubre este módulo para `cargo fmt`. |
| `cargo fmt --check` | PASS, código 0. |
| `cargo clippy --workspace --all-targets -j 2 -- -D warnings` | PASS, código 0. |
| `cargo test --workspace -j 2` | PASS, código 0: 291 pruebas, 4 omitidas; incluye los 7 escenarios del harness propio de lifecycle. |
| `cargo test -p vantare-ui --features parity-capture --lib fuel_strategy::tests -j 2` | PASS: 2 pruebas, también comprueba `animating() == false`. |

Las 6 pruebas nuevas cubren formato, cero real, ausencia/obsolescencia/valores
inválidos, capacidad, idioma/unidad, repintado solo por cambios visibles,
inactividad y decodificación de la escena sin convertir vueltas de sesión en
autonomía del depósito. Sin dependencias nuevas, sin `unwrap()` ni unsafe nuevos.

Captura con `ui/compare.ps1 -Widget fuel-strategy -MaxPercent 4`:
**6380 / 138720 píxeles distintos = 4.5992 %**, umbral por canal 8,
RGBA premultiplicado, sin máscaras; tamaño 680 × 204. Salida **1**: el objetivo
del 4 % **no se alcanza**. Candidato y diff quedan en
`%TEMP%/vantare-parity/fuel-strategy/fuel-strategy.png` y
`%TEMP%/vantare-parity/fuel-strategy/fuel-strategy.diff.png`.

4474 píxeles distintos están en la columna de historial (x=371..679), cuyo panel,
filas, título y separadores no aparecen al faltar la señal, como en el productivo.
1906 están en la columna principal: proyecciones ausentes y rasterización de
texto DirectWrite frente a Chrome. El valor de combustible conserva el mismo
bounding box de píxeles brillantes (270,21)..(350,41), aunque difieren 315 píxeles
en su región. No se dibuja un historial ficticio para reducir el porcentaje.

Los primeros intentos se interrumpieron por falta de memoria según el nuevo
encargo de Isaac. Se repitió con `CARGO_PROFILE_DEV_DEBUG=0`, `-j 2` y
`RUST_TEST_THREADS=2`. Una suite completa falló en el test heredado de procesos
`a_hung_overlays_does_not_block_the_core_and_is_killed_on_stop` por
`runtime/tests/lifecycle.rs:202` (PID no parseable). La suite de ciclo de vida
pasó aislada y las suites completas posteriores pasaron, sin editar ese test.
Las cuatro pruebas de simuladores en vivo omitidas por el workspace siguen
omitidas: estos gates no demuestran una carrera física LMU/ACC ni captura OBS.

Para repetir la captura con el límite de memoria del encargo, desde `native/`
(el script de esta base fija internamente `-j 4`; no se modifica):

```powershell
$env:CARGO_PROFILE_DEV_DEBUG = '0'
$env:RUST_TEST_THREADS = '2'
function cargo {
    $fuelCargoArgs = @($args)
    for ($fuelArgIndex = 0; $fuelArgIndex -lt $fuelCargoArgs.Count - 1; $fuelArgIndex++) {
        if ($fuelCargoArgs[$fuelArgIndex] -eq '-j') { $fuelCargoArgs[$fuelArgIndex + 1] = '2' }
    }
    & cargo.exe @fuelCargoArgs
    $global:LASTEXITCODE = $LASTEXITCODE
}
.\ui\compare.ps1 -Widget fuel-strategy -MaxPercent 4
```

La captura de esta base usa marca a la derecha; el fix de integración la mueve
debajo. 680 px no agotó el ancho del monitor: la captura con marca terminó.
No se modificó la infraestructura ni se incorporó el fix fuera del alcance.

## Candidatos para el kit (sin modificarlo aquí)

- Exponer `domain::format::to_fixed` para reutilizar el redondeo de JS en litros.
- Brillo del panel y marco con borde superior al 24 %: segundo consumidor tras
  Standings. Siguen locales para respetar la propiedad del kit compartido.

## Preguntas para el orquestador

1. ¿Qué tarea y propietario publicarán requiredFuel, historial por vuelta y
   estimatedLaps con su base y calidad en Snapshot/IPC, para cerrar esta paridad?
2. ¿El propietario del kit extrae el brillo/marco compartidos y expone
   `format::to_fixed`, ahora que Fuel Strategy es un segundo consumidor?

No se añaden dependencias ni código unsafe. Faltan aceptación del orquestador,
señales canónicas anteriores y prueba física LMU/OBS; no hay integración,
promoción, release, push ni PR de este worker.
