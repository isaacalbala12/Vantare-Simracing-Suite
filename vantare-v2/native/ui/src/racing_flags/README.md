# Racing flags Eficiencia — ISA-1427

Worker aislado, base `6973c81f29574a573d76f3fae48e128d6964960a`, rama
`vantareapp/isa-1427-w-racing-flags`. Seguimiento técnico:
[GitHub #1427](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1427).
Notion no disponible; Isaac autorizó trabajar con GitHub. La reconciliación
del seguimiento y del handoff compartido corresponde al orquestador.

## Contrato

- `domain::racing_flags` proyecta las banderas de sesión y sector. Respeta el
  orden de relevancia del adaptador y conserva huecos de sector como ausencia.
  Las banderas de coche no se convierten en banderas globales.
- `Unavailable` y la lista vacía dibujan `—`, sobre gris; nunca verde inventado.
  `Stale` conserva el color/valor, como `racing-flags-view-model-v2.ts`.
- Rótulos ES/EN, iniciales de sector del código original, contraste blanco en
  negro por defecto. El dominio admite `show_sector_flags`, `hide_when_green`
  y RGB validado mediante `Config`; el host actual pasa solo `Preferences` y
  utiliza los defaults. Conectar preferencias específicas pertenece al host.
- Un pulso de borde amarillo al entrar, de 920 ms. `Wake::Frame` solo durante
  ese plazo; luego `Wake::Idle`. Repetir la misma bandera no reinicia el aviso.
  El CSS productivo repite el pulso indefinidamente; aquí se acota por encargo.
- Tamaño fijo 280 × 88, geometría de la referencia. No porta resize del Studio,
  efectos configurables ni el halo animado del amarillo.
  La sombra exterior del CSS queda fuera de la captura del rectángulo del widget.

## Escena y señales

`ui/fixtures/racing-flags.snapshot.json` es la reconstrucción del Workshop
`default / race / track / ready`, DTO v3, epoch 3 / sequence 2: bandera de
sesión verde fiable, sin banderas de sector. Es una demostración, no LMU real.
Solo conserva datos de sesión y banderas; no inventa coches o telemetría.

La señal visible `session.flag` (enum, sin unidad, `fresh` → `Reliable`) se representa como
`State.flags` con ámbito `Session`. El productivo V2 deja `sectorFlags` vacío;
el nativo puede usar los ámbitos `Sector` existentes. No se modifica modelo,
IPC ni runtime. No se añade un supuesto mensaje libre de race control.
Falta `OverlaySourceStatusV2.state` (`stopped`/`error`, enum sin unidad,
no representado/Unavailable): el widget solo conoce la calidad de `flags`.
No infiere un error o desconexión de una bandera stale; desaparece la bandera
cuando `flags` pasa a `Unavailable`. Los atributos de estado del renderer web
no tienen un equivalente de transporte en este Snapshot.

## Piezas locales candidatas al kit

- Se reutiliza Inter 800 del kit: el CSS pide 850, pero `frontend/src/fonts.css`
  declara el rango 400–800 y Chrome utiliza 800. No se añaden fuentes.
- Fondo CSS de tres stops, interpolación sRGB a 108° y brillo a 110°: GPUI
  permite solo dos stops. Se calcula una imagen de 280 × 88 por paleta y se
  reutiliza (ocho paletas máximas); nunca lee el PNG de referencia. No añade
  dependencias. Mantener local hasta tener un segundo consumidor real.
- Sombra de texto con convolución gaussiana de los mismos glifos del kit, blur
  8/10 y desplazamiento de 1 px, en una malla de 2 px (121 muestras por línea).
  No usa la referencia ni un rasterizador alternativo. Las runs se cachean en
  el kit; el coste de pintar estos glifos durante el pulso queda sin medir.
  Extraer u optimizar solo con otro consumidor o evidencia de rendimiento.

## Verificación

Desde `native/`, con `CARGO_PROFILE_DEV_DEBUG=0` y `RUST_TEST_THREADS=2`:

```powershell
cargo fmt --check
rustfmt --edition 2024 --check ui/src/racing_flags/mod.rs
cargo clippy --workspace --all-targets -j 2 -- -D warnings
cargo test --workspace -j 2
# Limitar también el -j hardcodeado del script, sin editarlo.
function cargo {
    $taskArgs = @($args)
    for ($i = 0; $i -lt $taskArgs.Count - 1; $i++) {
        if ($taskArgs[$i] -eq '-j') { $taskArgs[$i + 1] = '2' }
    }
    & cargo.exe @taskArgs
}
.\ui\compare.ps1 -Widget racing-flags -MaxPercent 4
```

El `compare.ps1` de esta base lleva `-j 4` hardcodeado. En esta ejecución se
invoca con una función PowerShell local `cargo` que cambia ese argumento a
`-j 2`, sin editar el script. Captura y mutex siguen siendo los del script.
La marca de esta base está a la derecha; 280 px caben con margen. No se toca
el fix de captura de la rama de integración.

Paridad final: **868/24640 px = 3,5227 %**, umbral por canal 8, sin máscaras,
salida 0 con `-MaxPercent 4`. Diferencias: texto central 652 px (DirectWrite
frente a Chrome y aproximación de sombra), borde izquierdo 108 px y derecho
108 px (composición/antialias). Candidato y diff:
`%TEMP%/vantare-parity/racing-flags/racing-flags{,.diff}.png`.
Gates finales (2026-09-30): `cargo fmt --check`, `rustfmt` del módulo,
`cargo clippy --workspace --all-targets -j 2 -- -D warnings` y
`cargo test --workspace -j 2`, todos salida 0. Suite: 19 tests de domain,
32 de UI; 4 tests live heredados omitidos por requerir LMU/ACC físicos.
Adicional: `cargo test -p vantare-ui --features parity-capture racing_flags -j 2`,
2/2 PASS, incluida la terminación de `animating()`. La captura final se repite
con exactamente los mismos 868 píxeles distintos. Log de la suite:
`%TEMP%/racing-flags-final-tests.log`.

Hitos anteriores: dominio `c57e08c89a6fed8b899fd1864b5071d7b3e8df70`,
widget `b0103ad0169ea3e13d50c31b6ee416b0d4bb2b27`. Este hito conserva la escena,
su test de decodificación/proyección y ajusta el mínimo del borde amarillo a
la opacidad .48 del CSS; consultar el SHA de entrega con `git log -1`.
No hay prueba física de LMU/OBS ni medición de rendimiento de este widget.
Sin push, PR, merge, promoción ni release.
