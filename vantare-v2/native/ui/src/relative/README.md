# Relative Eficiencia — entrega del worker (ISA-1427)

> Continuación v4, 2026-09-30: este informe conserva la entrega anterior como
> evidencia histórica. La ventana ya consume `relative_s`/`relative_laps` y
> `source_state`. Estado vigente de la familia, gates y bloqueos:
> [PARIDAD.md](PARIDAD.md). Relative baja a 5,8091 %; aún no supera el gate de 4 %.

Issue: [#1427](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1427).
Rama: `vantareapp/isa-1427-w-relative`; base asignada `6973c81f`.
Verificación local: 2026-09-30. Proyecto técnico: Arquitectura Rust nativa,
ADR 0099, fase 2. Estado: candidato parcial para revisión del orquestador,
**paridad no aceptada**.
Notion no disponible por instrucción explícita de Isaac: reconciliación pendiente
del orquestador. Solo commits locales; sin push, PR, merge ni release.

## Alcance y límite de aceptación

Porte **parcial** del Signature congelado de 304 × 285 px, rango 3 + jugador + 3,
clases todas, columnas posición/clase/número/nombre/gap/mejor vuelta. Reutiliza
el kit Eficiencia (Inter, tracking, colores, rectángulos) y `domain::format`.
No añade dependencias, `unsafe`, renderer paralelo ni señales a domain/IPC.

`Snapshot` tiene clasificación, pero no la ventana relativa canónica en pista.
La proyección solo muestra al jugador y seis huecos vacíos, como los huecos de
presentación del productivo. No convierte posición, gaps al líder, pose ni
vueltas completadas en vecinos/gaps/doblados inventados. Un coche doblado puede
estar delante en pista y detrás en la clasificación. Los campos `Unavailable`
no se convierten en ceros; los `Stale` conservan su valor y atenúan la celda.

El renderer incluye filas, clase, truncado, badge de vueltas, metadatos, clima,
fundidos de 120 ms, FLIP 220–300 ms y avisos de cruce de 480 ms. Los tests usan
un reloj inyectado: las animaciones terminan, no se reinician por texto y la
primera foto queda quieta. **Los rivales y sus animaciones solo se ejercitan con
ViewModels en tests**, no con datos de Snapshot ni con un simulador físico.

No se portan aquí otras configuraciones/columnas, footer slots, estabilidad de
membresía de rivales ni estados completos de conexión. El modelo común tampoco
contiene `OverlaySourceStatusV2.state/reason`: sin jugador se muestra SIN DATOS,
sin afirmar que sea desconexión o error de la fuente.

## Señales ausentes que debe resolver el propietario del modelo

| Señal productiva | Unidad | Calidad requerida | Falta en Snapshot |
| --- | --- | --- | --- |
| `OverlayFrameV2.relative` / `relative[].id`, `side`, orden | Identidad estable; delante/jugador/detrás; vecinos cerca → lejos | Ventana canónica publicada en la misma revisión; ausencia explícita | Membresía y orden en pista, independientes de clasificación |
| `relative[].gap` | Segundos con signo: positivo delante, negativo detrás | `Reliable`/`Estimated`/`Stale`/`Unavailable` por rival | Gap temporal canónico al jugador; `gap_leader` y `gap_ahead` no lo sustituyen |
| `relative[].lapDelta` | Vueltas enteras con signo | `Reliable`/`Estimated`/`Stale`/`Unavailable` por rival | Déficit canónico de vueltas; no equivale a restar vueltas completadas |
| `OverlaySourceStatusV2.state`, `reason` | Estado enumerado y texto | Estado de fuente explícito y vigente | Distinguir conexión, desconexión, espera, datos antiguos y error |

Siguiente paso: el orquestador coordina esas señales con el propietario de
domain/IPC; después se alimentan los rivales, se prueba su estabilidad y se
repite la paridad. Este worker no amplía el modelo común ni sus transportes.

## Escena y verificación

`../../fixtures/relative.snapshot.json` es una demostración reconstruida del
Workshop `default/race/track/ready`, **no una captura LMU**. Parte del DTO v3 de
la escena versionada; conserva identidades de clasificación y convierte clima
del frame congelado a SI (21 °C → 294,15 K; 28 °C → 301,15 K; 14 km/h → 3,888… m/s).
Para las filas relativas, las mejores vueltas ausentes permanecen ausentes:
no se sustituyen por el valor fresco de otra sección del frame.

Captura siempre mediante `ui/compare.ps1`, mutex global, DPI 100 %, umbral 8,
RGBA premultiplicado, sin máscaras ni referencias modificadas. En esta base
el script contiene `-j 4`: la ejecución del worker sustituye ese argumento por
`-j 2` con una función PowerShell local que llama al Cargo original; el script
versionado permanece intacto. `CARGO_PROFILE_DEV_DEBUG=0` y
`RUST_TEST_THREADS=2` en gates y capturas.

Primera captura: 8906 / 86640 px = **10,2793 %**. Tras ajustar la baseline del
nombre y la cobertura de bordes menores de 1 px: 7962 / 86640 = **9,1898 %**.
Resultado final, repetido tras cerrar los cambios: **7258 / 86640 px = 8,3772 %**,
tras compensar la cobertura del marco escalado en GPUI. Sigue superando el gate
de 4 %: **salida 1**, no se da por aprobado.

Las bandas de los seis rivales ausentes (y=21..79 y y=101..159) concentran
4987 píxeles distintos. El resto: meta 405, banda del jugador 911 y pie 955;
la banda vacía y=160..262 tiene 0 diferencias al umbral 8. Quedan diferencias
de rasterización Inter Chrome/DirectWrite y de bordes/descendentes en texto
pequeño. No se rellenan los huecos ni se cambian referencias para reducir el
porcentaje: falta la ventana canónica y su calidad antes de completar las filas.

Artefactos locales: `%TEMP%/vantare-parity/relative/relative.png` y
`relative.diff.png`. El tamaño cabe en el monitor: 304 × 285, sin necesidad de
cambiar el host ni la marca de captura. La paridad no demuestra LMU/OBS real.

## Posibles piezas para el kit

El kit ajusta rectángulos a píxel; un borde CSS escalado de 0,707 px puede quedar
vacío. `line` distribuye su cobertura entre un máximo de dos píxeles, respetando
el origen del widget. Considerar subir esta primitiva cuando haya otro consumidor.
También quedan locales la curva Bézier de Relative, panel/marco escalados y
las barras de metadatos. No se extraen ni se cambia el kit en este encargo.

## Gates y revisión

Antes de cada commit: `cargo fmt --check`, `cargo clippy --workspace --all-targets
-j 2 -- -D warnings` y `cargo test --workspace -j 2`, todos con salida 0.
Además, `rustfmt --edition 2024 --check ui/src/relative/mod.rs` (módulo declarado
por macro) y Clippy de UI con `--features parity-capture --all-targets -j 2`:
salida 0. Resultado final de tests: **287 pruebas estándar + 7 de lifecycle
PASS, 0 fallos, 4 omitidas** porque requieren juegos físicos. Relative aporta
4 tests de dominio y 5 de UI/movimiento/escena. La reentrada conserva opacidad
y no inventa un aviso de cruce comparando contra un fantasma de salida.

Logs locales: `%TEMP%/relative-final-gates.log` y
`%TEMP%/relative-final-parity.log`. No se ejecutaron CI remoto, LMU/ACC en vivo,
OBS ni pruebas de rendimiento; no hay promoción ni publicación. La compilación
incremental no se presenta como medición controlada: corresponde al orquestador.

Archivos: `domain/src/relative.rs`, una línea en `domain/src/lib.rs`,
`ui/src/relative/{mod.rs,motion.rs,README.md}`, una línea en `ui/src/registry.rs`
y `ui/fixtures/relative.snapshot.json`. Balance Rust respecto a la base:
758 líneas de producción (incluidos comentarios y exports), 224 de tests,
0 eliminadas netas; escena JSON reconstruida, no código generado.

Reproducir manualmente desde `native/`, usando el Cargo original a dos jobs:

```powershell
$env:CARGO_PROFILE_DEV_DEBUG = '0'
$env:RUST_TEST_THREADS = '2'
$cargoExe = (Get-Command cargo.exe).Source
function cargo {
    $cargoArgs = @($args)
    for ($i = 0; $i -lt $cargoArgs.Count - 1; $i++) {
        if ($cargoArgs[$i] -eq '-j') { $cargoArgs[$i + 1] = '2' }
    }
    & $cargoExe @cargoArgs
}
.\ui\compare.ps1 -Widget relative -MaxPercent 4
```

La aceptación restante es concreta: acordar la representación común de las
señales listadas, completar sus proyecciones, revisar estabilidad de membresía
y alcanzar ≤4 % con el mismo script. No requiere una decisión de producto del
usuario; requiere coordinación con el propietario de domain/IPC.
