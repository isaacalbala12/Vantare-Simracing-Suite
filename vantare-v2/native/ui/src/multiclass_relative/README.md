# Multiclass Relative — ISA-1427, fase 2

> Continuación v4, 2026-09-30: este informe conserva la entrega anterior como
> evidencia histórica. Los gaps ya vienen de `relative_s` y el estado de
> `source_state`; Stale conserva las filas con aviso. Estado vigente de la
> familia, gates y bloqueos: [PARIDAD.md](../relative/PARIDAD.md).
> Multiclass baja a 4,3180 %; aún no supera el gate de 4 %.

Entrega local para revisión del orquestador; issue técnica
https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1427.
Base del worktree: `6973c81f29574a573d76f3fae48e128d6964960a`.
Notion no disponible, excepción explícita del encargo; reconciliación pendiente
del orquestador. Sin push, PR, merge, release ni promoción.

## Alcance y escena

Proyección pura con selección centrada por posición global, 3–7 filas,
filtros all/same/other, separadores de clase, identidad, formatos y ausencia.
La UI usa la configuración congelada: 5 filas, all, separadores, 420 × 155.
El host actual solo pasa Preferences de idioma/unidades; el inspector y otros
tamaños/configuraciones de UI quedan para su propietario. No hay animaciones
temporales en el renderer Eficiencia: Wake::Idle y animating() = false.

`fixtures/multiclass-relative.snapshot.json` reconstruye Workshop
default/race/track/ready de `tools/widget-reference/scene.tsx` y el frame de
`reference/multiclass-relative.geometry.json`, usando la escena hermana de
pedales como DTO v3. Identidades vehicle-000..019 → CarId(1..20).
Es una demostración reconstruida, no una captura de LMU.

Señales sin representación en Snapshot (no se amplió model/IPC/runtime):

- `overlayV2Frame.relative[].gap`: segundos firmados respecto al jugador,
  asociados a identidad, con calidad fresh/stale/missing/invalid. Se necesita
  una señal común Quality<f64> fiable/estimada/obsoleta/no disponible. Rivales
  muestran —; jugador 0.0 como el ViewModel productivo. No se usan gap_leader,
  gap_ahead ni distancias espaciales como sustitutos. Los gaps de la referencia
  +4.5, +9.0, +13.5 y +18.0 no pueden transcribirse a un campo equivalente.
- Estado/razón de `overlayV2Source` (live/stale/stopped/error, enum/texto sin
  unidad): no hay estado de transporte en Snapshot. Aquí ausencia de jugador o
  posición actual → SIN DATOS/NO DATA; posiciones WithData → DATOS ANTIGUOS,
  sin presentar posiciones obsoletas como actuales. No distingue error de
  desconexión.
- `rows[].classColor` ya carece de señal en el producto Overlay V2: se conserva
  su color explícito #8b93a7. No se inventa un color de equipo.

## Evidencia visual (2026-09-30)

Captura exclusivamente con `ui/compare.ps1 -Widget multiclass-relative
-MaxPercent 4`, escritorio 100 % DPI, tamaño 420 × 155, umbral RGBA
premultiplicado 8, sin máscaras ni cambios a la referencia.

Resultado: **3036/65100 píxeles, 4,6636 %; salida 1**. No cumple ≤ 4 %.
El candidato mantiene layout y fuente Inter 650 del contrato; no se retoca
tipografía ni se fabrican gaps para bajar el porcentaje.
Diagnóstico por regiones de la misma comparación: nombres 1827 px
(x=118,y=10,w=229,h=127); gaps 722 px (x=348,y=10,w=58,h=127), incluidos
antialias del 0.0 y los cuatro rivales ausentes; resto 487 px. El texto difiere
por rasterización DirectWrite/Chrome. Desplazar nombres ±1 px en x/y empeora
el resultado: posición original 1827, siguiente mejor 2421 px.
Esta partición no sustituye ni enmascara el gate oficial de 3036 px.

Candidato y diff: `%TEMP%/vantare-parity/multiclass-relative/`.

Para repetir sin superar los dos trabajos (el script compartido incluye -j 4):

```powershell
cd native
$env:CARGO_PROFILE_DEV_DEBUG = '0'
$cargoExe = (Get-Command cargo -CommandType Application).Source
function cargo {
    $compileArgs = @($args)
    for ($i = 0; $i -lt $compileArgs.Count; $i++) {
        if ($compileArgs[$i] -eq '-j' -and $i + 1 -lt $compileArgs.Count) { $compileArgs[$i + 1] = '2' }
    }
    & $cargoExe @compileArgs
    $global:LASTEXITCODE = $LASTEXITCODE
}
.\ui\compare.ps1 -Widget multiclass-relative -MaxPercent 4
```

## Gates y pendientes

Antes de cada commit local: cargo fmt --check, rustfmt explícito del módulo
macro, cargo clippy --workspace --all-targets -j 2 -- -D warnings,
cargo test --workspace -j 2. Perfiles DEV_DEBUG=0 y TEST_DEBUG=0 por memoria;
la primera pasada de dependencias abortó por OOM. Se corrigió un test que
esperaba repintar al modificar un coche fuera de la selección; el test final
comprueba tanto ese caso como cambios de un jugador visible.

Seis tests de dominio y dos de UI: selección, filtros, calidad, formatos
toFixed(1), repintado por dibujo y transcripción de escena DTO.
Las pruebas live LMU/ACC permanecen omitidas por la suite: sin juego activo.
Sin pruebas físicas LMU/OBS ni mediciones de recursos del conjunto.

Salida final verificada, 2026-09-30:

```text
cargo fmt --check: exit 0
rustfmt --edition 2024 --check ui/src/multiclass_relative/mod.rs: exit 0
cargo clippy --workspace --all-targets -j 2 -- -D warnings: exit 0
cargo test --workspace -j 2: exit 0 (domain 21/21, UI 32/32; 4 live omitidas)
compare.ps1 -Widget multiclass-relative -MaxPercent 4: exit 1
3036/65100 px distintos (4.6636 %), umbral por canal 8, delta máx 231
```

La repetición final del comparador reprodujo exactamente 3036 píxeles.

Para subir al kit: brillo de panel 120° y franja superior del marco (ahora hay
un segundo consumidor real); formato firmado con una decimal (0 → 0.0,
1.25 → +1.3, 2.55 → +2.5). format::gap tiene otra semántica y to_fixed es
privado; no se modifican en este porte.

Decisiones pendientes del orquestador: propietario/prioridad del gap al
jugador en modelo común; resolución del 4,6636 %; integración de ajustes de
contenido/estado de fuente en el host cuando corresponda.
