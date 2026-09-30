# Rasterización del kit Eficiencia — #1427

## Parche GPUI autorizado — 2026-09-30

Worker Codex; revisión pendiente de Claude Opus 5.5. Tarea autorizada por Isaac:
[GitHub #1427](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1427),
proyecto Rust nativo / Eficiencia, ADR 0099 y fase 2 del plan.
Notion no disponible: excepción expresa del encargo; no se declara actualizado
su seguimiento ni se cierra la fase 2. Entrega local **parcial respecto al
objetivo absoluto del 4 %**.

### Resultado y alcance

Se copia únicamente `gpui_windows` de Zed
`72d28c32c2ba77a579e1c02f984654518552124b` y se aplica el patch de Cargo.
No se modifican widgets, kit, fuentes, escenas ni referencias. El algoritmo
mantiene la salida grayscale de las ventanas transparentes, pero deriva su
cobertura del promedio RGB de una máscara DirectWrite ClearType 3×1. Los
emoji conservan la ruta previa; la salida subpixel RGBA permanece igual.
El shader monocromo aplica gamma 2,2 y contraste 1,5. La ruta subpixel conserva
los parámetros del sistema: aquí gamma 1,8, contraste grayscale 1,0 y contraste
subpixel 0,5. No se cambia la configuración de ClearType de Windows.

El mecanismo, coeficientes, líneas exactas diferentes de upstream, licencia,
test y diff reproducible están en [`native/vendor/README.md`](../../../vendor/README.md).
Los coeficientes son los `f32` de `gpui::get_gamma_correction_ratios(2.2)`;
la calibración no afirma que todos los Chrome usen estos parámetros.

**17/18 widgets registrados cumplen ≤4 %.** Ninguno supera la regresión
autorizada de +0,1 puntos: máximo **+0,0677**, Pedals de 3,9323 % a 4,0000 %.
Se eliminan **10.656 píxeles distintos** en el conjunto y el cambio medio
no ponderado es **−0,8383 puntos**. Fastest Lap queda en **4,3109 %**;
no se da por cumplido el objetivo completo ni se oculta con una máscara.

### Experimentos aislados

Todos los experimentos recorren los **18 tipos de `registry.rs`**, incluido
Fastest Lap. Se conserva el mismo dato y referencia por widget en cada tanda.
No se reutiliza la referencia histórica 474×364 de Standings: fue retirada
de esta base. Se usa su escena/referencia vigente de fase 2, **440×664**.
Por ello, la tabla anterior del kit no es la línea base de este parche.

Método: copia externa de `compare.ps1`, `-MaxPercent 100`, umbral 8 por canal,
RGBA premultiplicado, sin máscaras; compilación `-j 2`, DPI 100 %, mutex
`Global\VantareParityCapture`. La copia solo fija las rutas de esta tarea y
sustituye `-j 4` por `-j 2`; el script del repo no se cambia. Target propio en
la carpeta de evidencia, sccache compartido del entorno sin copiar ni borrar
sus cachés. GPU AMD Radeon RX 7800 XT, driver 32.0.31041.1004; hay también un
Meta Virtual Monitor. Las referencias registran Chrome 148.0.7778.96 / DPR 1.

La configuración vendorizada sin parche es **idéntica píxel a píxel** al
upstream en los 18 widgets. Eso separa el efecto de vendoring del parche.
Para gamma, contraste, shader, hinting y modo se restaura el original antes
de cambiar una única variable. Las tandas combinadas están nombradas aparte.

| Tanda | Cambio medio pp | Regresión máxima pp | Cambio píxeles distintos | Widgets >4 % | Límite +0,1 pp |
| --- | ---: | ---: | ---: | ---: | --- |
| gamma1.4 | +0.1038 | +0.4445 | +989 | 6 | DESCARTADO |
| gamma1.0 | +0.3406 | +0.9195 | +4497 | 8 | DESCARTADO |
| contrast0 | +0.0694 | +0.7184 | +368 | 7 | DESCARTADO |
| raw | +0.3410 | +1.3375 | +4453 | 7 | DESCARTADO |
| hinting | -0.0053 | +0.0104 | -23 | 4 | PASS |
| gamma2.2 | -0.0815 | +0.5804 | -1875 | 4 | DESCARTADO |
| contrast1.5 | +0.0083 | +0.0962 | +91 | 4 | PASS |
| contrast2 | +0.0405 | +0.3693 | +274 | 5 | DESCARTADO |
| symmetric | +0.0000 | +0.0000 | +0 | 4 | PASS |
| quant64 | -0.0007 | +0.0162 | -18 | 4 | PASS |
| quant-y4 | +0.1935 | +1.9271 | +1281 | 6 | DESCARTADO |
| lcd-gray | -0.6490 | +0.0729 | -6025 | 3 | PASS |
| lcd-gray-gamma1.4 | -0.0430 | +0.5111 | +1235 | 6 | DESCARTADO |
| lcd-gray-gamma2.2 | -0.8580 | +0.2435 | -10932 | 1 | DESCARTADO |

`gamma*` fija solo la gamma; `contrast*` fija solo el contraste grayscale;
`raw` quita la corrección del shader; `hinting` desactiva grid fitting;
`symmetric` fuerza NATURAL_SYMMETRIC. `quant64` prueba 64 fases horizontales
y `quant-y4` cuatro verticales, cada una contra el original, en una copia
experimental de `gpui` **fuera del repo**; no se conserva ese crate.
`lcd-gray` cambia únicamente la generación de máscara. Las otras tandas
`lcd-gray-gamma*` añaden gamma al mecanismo ya aislado. Finalmente se prueba
contraste 1,5 sobre `lcd-gray-gamma2.2`, que elimina la regresión de Flags.

La **máscara ClearType promediada** explica la mayor mejora aislada:
−6.025 píxeles y Car Damage Numbers de 6,0355 % a 0,7574 %. La gamma sola
no la reproduce. Conservar solo el shader original deja tres widgets >4 %;
el perfil combinado deja uno. Natural Symmetric coincide con upstream;
hinting y cuantización horizontal aportan muy poco. La cuantización vertical
empeora varios widgets. Los resultados descartados quedan en evidencia.

El código final (promedio en el mismo buffer, emoji preservados y perfil
limitado a grayscale) es **idéntico píxel a píxel** a la tanda calibrada
`lcd-gray-balanced` en los 18 widgets.

### Tabla completa: base asignada frente al parche final

| Widget | Antes % | Después % | Diferencia pp | Píxeles distintos antes / después |
| --- | ---: | ---: | ---: | ---: |
| standings | 3.6641 | 2.5133 | -1.1508 | 10705 / 7343 |
| radar | 2.1839 | 2.1839 | +0.0000 | 1057 / 1057 |
| pedals | 3.9323 | 4.0000 | +0.0677 | 755 / 768 |
| delta | 3.7388 | 3.7798 | +0.0410 | 1005 / 1016 |
| car-damage-visual | 3.9511 | 2.6283 | -1.3228 | 1132 / 753 |
| input-telemetry | 2.2619 | 1.6052 | -0.6567 | 1140 / 809 |
| multiclass-relative | 4.3180 | 3.0983 | -1.2197 | 2811 / 2017 |
| broadcast-tower | 3.3891 | 2.6607 | -0.7284 | 4620 / 3627 |
| delta-trace | 0.6874 | 0.6489 | -0.0385 | 1911 / 1804 |
| track-map | 1.8838 | 1.7465 | -0.1373 | 1495 / 1386 |
| track-weather | 3.9861 | 1.8000 | -2.1861 | 1435 / 648 |
| car-damage-numbers | 6.0355 | 2.6318 | -3.4037 | 1259 / 549 |
| head-to-head | 1.3780 | 1.3260 | -0.0520 | 635 / 611 |
| fuel-strategy | 2.4048 | 1.9038 | -0.5010 | 3336 / 2641 |
| pedals-telemetry | 3.5179 | 2.9702 | -0.5477 | 1182 / 998 |
| relative | 5.5413 | 3.4372 | -2.1041 | 4801 / 2978 |
| racing-flags | 3.5227 | 2.7638 | -0.7589 | 868 / 681 |
| fastest-lap | 4.7015 | 4.3109 | -0.3906 | 2347 / 2152 |

### Límite de Fastest Lap

No se añaden ajustes por widget al backend. El porte redondea sus líneas de
base antes de GPUI (`fastest_lap/mod.rs:296,310,320,331`). Por ejemplo,
`text::baseline(36.48, 30.38, 30.38)` devuelve 62,48 y el caller entrega 62.
Una cuantización posterior más fina no puede recuperar esa fracción perdida.
Esto prueba una pérdida de posición en el caller, **no** que explique todo el
residuo. El diff final también incluye texto pequeño, SVG y diagonales;
su revisión requiere el ámbito del porte/kit, que este worker no puede editar.
No se simula una corrección con offsets o perfiles por widget dentro de GPUI.

### Evidencia, checks y continuidad

Todos los crudos están en **`C:/tmp/vw3-gpui-texto-evidence/`**: tandas y PNG
por widget, logs redirigidos, hashes de escenas/referencias/binarios, fuentes
de cada variante, `summary.json`, equivalencia RGBA del control/final,
`upstream-vendor.patch`, el comparador externo y `measure.ps1`.
El primer bootstrap tuvo una ruta de captura mal resuelta y una escena
histórica retirada: se conserva como inválido y no cuenta como medición.

El test nuevo compara máscaras reales de DirectWrite de A/V, Segoe UI y
cuatro fases horizontales, sin mocks. En upstream falla con A/fase 0;
con el parche pasa. Logs `regression-red.log` y `regression-green.log`.
Se necesita el manifiesto propio y `--features test-support`; el arnés sin
esa feature no compila en upstream, y ese intento no cuenta como test rojo.

Validación del código final, Rust/Cargo 1.95.0 y sccache 0.18.0:

| Check | Resultado | Log externo |
| --- | --- | --- |
| `cargo fmt --check` | PASS, exit 0 | `final-fmt.log` |
| `cargo fmt --manifest-path vendor/gpui_windows/Cargo.toml --check` | PASS, exit 0 | `vendor-fmt.log` |
| `cargo clippy --workspace --all-targets -j 2 -- -D warnings` | PASS, exit 0 | `final-clippy.log` |
| `cargo test --workspace -j 2` | PASS, 666 pasados, 0 fallos, 4 ignorados | `final-test.log` |
| `cargo test --manifest-path vendor/gpui_windows/Cargo.toml --lib --features test-support -j 2` | PASS, 18 pasados, 0 fallos | `vendor-tests.log` |
| Shader modificado, `fxc /T ps_4_1 /E monochrome_sprite_fragment /O3` | PASS, exit 0 | `shader-release.log` |
| Builds de Hub y espécimen, `-j 2` | PASS, exit 0 | `hub-after-build.log`, `probe-after-build.log` |

Los cuatro tests ignorados requieren LMU/ACC activos; no se inicia ningún
simulador ni se presentan esos casos como prueba física. El test del vendor
incluye además los dos casos upstream de emoji, que pasan. Los crudos y
conteos están en `gates.json` y `workspace-test-counts.json`.

Se capturó y revisó visualmente el Hub real, con directorios de datos propios
y un pipe ausente: `hub-after.png` (1600×1000). Abre y muestra texto legible;
no prueba conexión al core. Se revisaron las capturas finales de los overlays
productivos en Workshop. Un espécimen externo usa el mismo GPUI, fuentes Inter
y ruta transparente, tamaños 8–32 px y paneles negro/blanco:
`probe-before.png` y `probe-after.png` (976×550). El texto pequeño gana algo
de peso; no se observa pérdida de legibilidad ni halos de color en ambos
fondos. Es una inspección visual, sin referencia Chrome ni gate porcentual
para ese espécimen. Los hashes de los ejecutables acompañan las capturas.

No se ejecutan packaging/release completos, CI remoto, OBS/LMU físicos,
otros DPI/GPU ni presupuestos CPU/RSS/latencia. La compilación `/O3` verifica
el shader cambiado; no sustituye una build release del producto. El buffer
temporal crece a cuatro bytes por píxel, conservando la atlas de un canal;
no se atribuye a este parche una mejora de rendimiento.

`native/Cargo.lock` está fuera de las rutas autorizadas. Los gates regeneran
el lock necesario y mantienen las versiones originales; se conserva esa
copia/diff en evidencia y se restaura el archivo versionado. **Opus debe
incluir la retirada del source Git de gpui_windows antes de integrar o usar
`--locked`.** El README del vendor documenta el paso; no se oculta el límite.
Con el lock restaurado, `cargo metadata --locked --offline` rechaza exactamente
esa actualización pendiente (`locked-check.log`); es un bloqueo de integración
de alcance, no un gate verde ni un fallo del código ocultado.

Base asignada y HEAD inicial `a9a5f5fe36cc10139b05557ce683fa623c59c165`, rama
`vantareapp/isa-1427-w-gpui-texto`. Nightly remoto leído/fetch
`f29b5fee04022756f9ae59f19bf153f91eebe4ed`; merge-base
`5838de5a4abee3e99d9d50aebd5dc20609c53611`. Se conserva la base específica
asignada del encargo, sin rebase ni mezclar cambios de otros workers.
Sin push, PR, CI remoto, merge, promoción ni release.

Verificación manual: desde `native/`, fijar `CARGO_TARGET_DIR` al target de
evidencia y ejecutar la copia externa del comparador con `-MaxPercent 100`;
`measure.ps1 -Stage revision` recorre todos los tipos. Con `-MaxPercent 4`,
Fastest Lap debe fallar; ese fallo es el pendiente declarado. Repetir Hub y
espécimen claro/oscuro antes de aceptar otro perfil o revisión de Zed.

Preguntas para el orquestador: aceptar este parche con la revisión del porte
Fastest Lap separada; incluir el cambio mínimo de lock en integración; decidir
cómo invocar el test del vendor en CI (los gates de workspace no prueban una
dependencia). No se ejecutan esas ampliaciones de rutas dentro de esta entrega.

## Informe previo del kit (conservado como histórico)

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
