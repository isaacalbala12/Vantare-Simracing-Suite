# Rasterización del kit Eficiencia — #1427

Entrega parcial para revisión de Opus, 2026-09-30. Referencia técnica:
[GitHub #1427](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1427),
ADR 0099 y fase 2 del plan nativo. Notion no disponible: excepción explícita del
encargo; su reconciliación queda pendiente del orquestador.

## Cambio comprobado

`paint_highlighted_frame` reúne el marco CSS al 12 % con su borde superior al
24 %. Sobre una capa al 12 %, el refuerzo debe ser `(0.24 - 0.12) / (1 - 0.12)`:
la composición source-over devuelve 24 %. Broadcast Tower aplicaba otro 24 %
encima y llegaba a 33,12 %. Fuel Strategy duplicaba la misma composición con
un refuerzo aproximado de 0,136; ambos llaman ahora al kit, sin calibración por
widget. Son los valores del `::after` en `vantare-functional/tokens.css`.

La primitiva anterior `paint_frame` conserva su contrato. Standings y los
otros widgets no necesitan cambios. El radio sigue siendo el CSS de 6 px y el
trazo de 1 px. No se añadió ninguna dependencia ni código unsafe.

En el píxel (500, 0) de Broadcast Tower, RGBA antes `(104,104,105,233)`, después
`(81,82,83,230)`, referencia `(81,81,83,230)`. Se eliminan 1.900 píxeles del diff.

## Diagnóstico del texto y esquinas

Fuentes leídas en `~/.cargo/git/checkouts/zed-a70e2ad075855582/72d28c3/crates/`,
revisión fijada `72d28c32c2ba77a579e1c02f984654518552124b`:

- `gpui/src/window.rs:4643`: `paint_glyph` cuantiza el origen físico a cuatro
  variantes horizontales y una vertical (`text_system.rs:49`).
  `should_use_subpixel_rendering` fuerza grayscale en ventanas transparentes;
  seleccionar ClearType no lo evita.
- `gpui_windows/src/direct_write.rs:667`: `CreateGlyphRunAnalysis` usa medición
  NATURAL, el modo/hinting recomendado por DirectWrite y máscara GRAYSCALE.
- `gpui_windows/src/directx_renderer.rs:853`: gamma y contraste proceden de
  `CreateRenderingParams` del sistema, se cachean en el renderer.
  `shaders.hlsl:1184` aplica a la cobertura la corrección de
  `alpha_correction.hlsl`, dependiente del brillo del color del texto.
- `gpui/src/text_system.rs:562`: rasterización, bounds y dilatación son
  `pub(crate)`; no hay controles públicos de gamma/contraste para este kit.
- `gpui_windows/src/shaders.hlsl:638-846`: las esquinas de los quads usan SDF y
  cobertura lineal saturada; bordes y fondo se componen antes de aplicar la
  cobertura exterior. Cambiar radio o grosor cambia geometría, no ese filtro.
- `gpui/src/window.rs:4507` vuelve a ajustar bounds y grosores al píxel físico.
  `efficiency::rect` ya ajusta tras sumar el origen del widget. A DPI 100 %, el
  segundo ajuste no cambia los bounds enteros.

La Inter variable original solo tiene eje `wght`; las siete instancias TTF
conservan hhea 1984/-494, unidades 2048 y tabla gasp `{65535: 15}`. El kit ya
reproduce ascenso/descenso CSS y semi-interlineado, tracking y números tabulares.
No se ha demostrado un peso o radio común incorrecto.

Comprobación sobre el texto AERO de Car Damage Numbers, caja (17,14)-(52,30):
las filas con tinta visible coinciden, 18–26. El error medio RGBA sin desplazar
es 3,7393; desplazar el candidato -1/+1 px lo aumenta a 23,4312/22,5705.
En el valor, caja (83,14)-(123,30), el error es 3,0707 frente a 16,2949/16,8738
al desplazarlo. Esto descarta una corrección global de un píxel en esas muestras;
no prueba las métricas de todos los textos. Las coberturas residuales varían
con color/tamaño, compatibles con gamma/hinting y composición diferentes.
No se ha aislado cuantitativamente cuánto aporta cada mecanismo.

Kerning: el kit solicita `kern=1` y conserva las posiciones de la línea completa
al aplicar tracking. GPUI usa `IDWriteTypography` pero no llama a
`SetPairKerning`. No se considera demostrado que todas las parejas coincidan
con HarfBuzz; requiere una muestra de pares específica, no números por widget.
[API de Microsoft](https://learn.microsoft.com/en-us/windows/win32/api/dwrite_1/nf-dwrite_1-idwritetextlayout1-setpairkerning).
Skia tiene su propia elección de modo y preblend de máscaras:
[código DirectWrite de Skia](https://chromium.googlesource.com/skia/+/5eefb853c68f76fc5001bc6e8e9e5db2772ac135/src/ports/SkScalerContext_win_dw.cpp).
Ese código orienta el diagnóstico; no se ha verificado que sea la revisión de
Chrome que generó los PNG congelados.

**Pendiente:** no hay corrección de rasterización de texto demostrada dentro
exclusivamente del kit. Modificar gamma/hinting requiere controles que GPUI no
expone en esta revisión. No se parcheó GPUI, no se cambió ClearType global ni
se construyó otro renderer. Las esquinas siguen mostrando cobertura diferente:
por ejemplo, Broadcast Tower (3,0) tras el arreglo es `(80,80,82,121)` frente a
`(47,47,47,86)` de Chrome. Esta entrega no cierra el objetivo de texto/esquinas.

## Todas las capturas registradas, antes y después

17 tipos en `registry.rs` de la base asignada `13dc3b22a3d4c24bbceb1cbbb0700d6ed7a3168f`,
rama `vantareapp/isa-1427-w-texto`. Referencia histórica de Standings 474×364,
escena `standings-44`; no se usa su referencia de fase 2 de 440×664.
Las referencias/escenas se conservan; datos reconstruidos de Workshop, no LMU live.

Método: `compare.ps1 -MaxPercent 100`, uno a uno, umbral 8, RGBA premultiplicado,
sin máscaras, DPI 100 %, mutex `Global\VantareParityCapture`. El script versionado
fija `-j 4`: se ejecutó una copia local con esa única opción cambiada a `-j 2`
y su raíz fijada a `native/ui`, sin modificarlo en Git ni cambiar perfil Cargo.
El límite 100 permite medir; no es una aprobación de paridad al 4 %.

| Widget | Antes % | Después % | Diferencia en puntos | Píxeles distintos antes / después |
| --- | ---: | ---: | ---: | ---: |
| standings | 3.6752 | 3.6752 | +0.0000 | 6341 / 6341 |
| radar | 2.1839 | 2.1839 | +0.0000 | 1057 / 1057 |
| pedals | 3.9323 | 3.9323 | +0.0000 | 755 / 755 |
| delta | 3.7388 | 3.7388 | +0.0000 | 1005 / 1005 |
| car-damage-visual | 3.9511 | 3.9511 | +0.0000 | 1132 / 1132 |
| input-telemetry | 13.0040 | 13.0040 | +0.0000 | 6554 / 6554 |
| multiclass-relative | 4.6636 | 4.6636 | +0.0000 | 3036 / 3036 |
| broadcast-tower | 4.7829 | 3.3891 | -1.3938 | 6520 / 4620 |
| delta-trace | 3.0662 | 3.0662 | +0.0000 | 8524 / 8524 |
| track-map | 1.8838 | 1.8838 | +0.0000 | 1495 / 1495 |
| track-weather | 3.9861 | 3.9861 | +0.0000 | 1435 / 1435 |
| car-damage-numbers | 6.0355 | 6.0355 | +0.0000 | 1259 / 1259 |
| head-to-head | 1.3780 | 1.3780 | +0.0000 | 635 / 635 |
| fuel-strategy | 4.5992 | 4.5992 | +0.0000 | 6380 / 6380 |
| pedals-telemetry | 9.2857 | 9.2857 | +0.0000 | 3120 / 3120 |
| relative | 8.3772 | 8.3772 | +0.0000 | 7258 / 7258 |
| racing-flags | 3.5227 | 3.5227 | +0.0000 | 868 / 868 |

Ningún widget empeora: máximo +0,0000 puntos, por debajo de +0,1.
15 candidatos son idénticos píxel a píxel en RGBA decodificado. Fuel cambia 583
píxeles RGBA por el refuerzo exacto, sin cambiar el recuento al umbral 8;
Broadcast Tower cambia 1.924. Las señales ausentes y otros límites de cada
porte no forman parte de este cambio y no se consideran corregidos.

Evidencia cruda en `%TEMP%\vantare-texto-1427`: `before/`, `after/`, logs por
widget, `before.json`, `after.json`, `comparison.json`, hashes de binarios,
`fixture-hashes.json`, `compare.ps1` y `measure.ps1`. Incluye candidato y diff
por widget. Los PNG no sustituyen pruebas de LMU, OBS, otros DPI ni otra GPU.

## Validación y continuidad

Gates finales, todos exit 0:

- `cargo fmt --check`: PASS.
- `cargo clippy --workspace --all-targets -j 2 -- -D warnings`: PASS,
  `Finished dev profile` en 12,31 s.
- `cargo test --workspace -j 2`: PASS, 396 pruebas libtest más 7/7 de ciclo
  de vida en su harness propio; 4 pruebas live omitidas según sus requisitos.
  UI 76/76; Workshop 4/4. Las omisiones no se presentan como pruebas físicas.
- 34 ejecuciones de `compare.ps1 -MaxPercent 100`: exit 0; comparación de las
  17 parejas: PASS para el límite de regresión de +0,1 puntos.
- `git diff --check`: PASS.

Logs: `final-fmt.log`, `final-clippy.log`, `final-test.log` y `gates.json` en la
carpeta de evidencia. No se incrementó el límite Cargo de dos trabajos.

La primera compilación encontró artefactos heredados de
`C:\tmp\vantare-fase2` que omitían módulos existentes en el código actual.
Se renovaron únicamente artefactos Cargo de los paquetes del workspace. La
limpieza coincidió con la primera suite y eliminó un ejecutable antes de
lanzarlo: esa suite es inválida. `clippy.log` y `test.log` conservan los fallos
iniciales; los gates finales se repitieron completos con el caché estable.

La regresión visual se verifica con las referencias congeladas y las 34
capturas, incluidos los píxeles del borde arriba; no se añade un test unitario
que solo repita la fórmula de composición y no observe el renderer.
No se ejecutan Go/frontend: el cambio no toca sus contratos ni código.
Sin push, PR, CI remoto, merge, promoción ni release. Solo entrega local.
No se editaron `domain/`, `ipc/`, `runtime/`, `standings/` ni escenas.

Verificación manual: repetir Broadcast Tower y Fuel Strategy con
`compare.ps1 -MaxPercent 100` limitando la compilación a dos trabajos como
arriba, y Standings con la escena/referencia histórica indicada en `ui/README.md`.
Para reproducir la tabla entera, `measure.ps1 -Stage revision` recorre el registro.

Decisiones pendientes para el orquestador: cómo obtener controles de
rasterización compatibles con la prohibición de parchear GPUI y de otro
renderer; y qué muestra de pares/colores/tamaños usar para cuantificar kerning
y gamma antes de autorizar otra corrección. No se solicita ampliar alcance
para datos, escenas o Standings.
