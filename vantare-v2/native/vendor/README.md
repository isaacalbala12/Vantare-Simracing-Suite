# Parche de texto GPUI Windows — ISA-1427

Solo se copia `gpui_windows`, de Zed
[`72d28c32c2ba77a579e1c02f984654518552124b`](https://github.com/zed-industries/zed/tree/72d28c32c2ba77a579e1c02f984654518552124b/crates/gpui_windows).
`native/Cargo.toml` sustituye ese paquete mediante
`[patch."https://github.com/zed-industries/zed"]`. El resto de Zed sigue siendo
la dependencia Git fijada; no hay nuevos crates ni dependencias de producción.

El objetivo es la paridad con las referencias Chrome congeladas, no cambiar
ClearType de Windows. Resultados completos y límites en
[`RASTERIZACION.md`](../ui/src/efficiency/RASTERIZACION.md).

## Diferencias con upstream

Todos los archivos no enumerados son idénticos byte a byte a upstream.
El diff reproducible de abajo es la autoridad para los rangos exactos.

Rangos de esta copia: `Cargo.toml:4-5,8-22,34,37-59,59-63,67,71-72`;
`LICENSE-APACHE:1-222`; `src/direct_write.rs:721,727,750,756,822,847-848,860-873,1987-2028`;
`src/shaders.hlsl:1186-1189`. Los rangos incluyen los comentarios y el test;
no hay diferencias ocultas en los demás archivos.

| Archivo | Cambio | Motivo |
| --- | --- | --- |
| `Cargo.toml` | Resuelve `edition`, `publish`, lints y dependencias heredadas de Zed; los tres paquetes por path (`gpui`, `collections`, `gpui_util`) apuntan al Git y revisión originales. Añade un workspace propio vacío. | La copia debe compilar sin copiar otros crates ni heredar los lints de Vantare. Versiones, features y dependencias opcionales originales se conservan. |
| `LICENSE-APACHE` | Materializa la licencia Apache-2.0 original de la raíz de Zed. | El enlace relativo `../../LICENSE-APACHE` no funciona en esta nueva ubicación. |
| `src/direct_write.rs` | `create_glyph_run_analysis` y `raster_bounds` usan ClearType 3×1 para glifos no emoji, también cuando la salida es grayscale. `rasterize_monochrome` compacta la media RGB en un byte de cobertura por píxel. Añade comentarios `SAFETY` y un test de regresión. | La máscara grayscale 1×1 de DirectWrite no reproduce la cobertura de la máscara RGB promediada. La salida sigue siendo grayscale, sin franjas de color. Los emoji conservan su análisis/fallback previo y la salida ClearType RGBA queda igual. |
| `src/shaders.hlsl` | Solo `monochrome_sprite_fragment`: perfil grayscale con gamma 2,2 y contraste 1,5. | La medición aislada y combinada selecciona este perfil; conserva el perfil del sistema en `subpixel_sprite_fragment`. También afecta a sprites SVG monocromos que ya comparten esta ruta. |

La compactación reutiliza el buffer de ClearType: suma tres `u8` en `u16`,
divide por tres y escribe detrás de las muestras aún no leídas. El promedio
queda en 0–255; no introduce `unwrap`, nuevas llamadas unsafe ni otra atlas.
El buffer temporal de esta ruta pasa de un byte a cuatro bytes por píxel;
la máscara persistida sigue ocupando un byte. No se cambian origen, hinting,
medición NATURAL, fuentes, colores, posiciones ni widgets.

La media de cobertura sigue el método
[`SkScalerContext_DW::RGBToA8`](https://chromium.googlesource.com/skia/%2B/d2b9e48baf1697760afc1dc8ea3ad40110b8cacc/src/ports/SkScalerContext_win_dw.cpp).
Es una referencia del algoritmo; no demuestra qué revisión/configuración de
Skia produjo los PNG de Chrome 148. Los valores gamma/contraste son la
calibración medida de este banco, no una afirmación sobre todos los Chrome.

Los cuatro coeficientes del shader son exactamente los `f32` devueltos por
`gpui::get_gamma_correction_ratios(2.2)` en `gpui/src/platform.rs:1349`:
`[0.2046960592, -1.3918368816, 2.0006999969, -0.3514729738]`.
Se fijan en la ruta grayscale para no sustituir la gamma del sistema en el Hub
opaco/ClearType. No se cambia `alpha_correction.hlsl` ni su fórmula de brillo.

## Diff reproducible y actualización

Desde `native/`, con el checkout original de Cargo:

```powershell
$zed = 'C:/Users/isaac/.cargo/git/checkouts/zed-a70e2ad075855582/72d28c3'
git -C $zed rev-parse HEAD
# Debe ser 72d28c32c2ba77a579e1c02f984654518552124b.
git diff --no-index --ignore-space-at-eol -- "$zed/crates/gpui_windows" './vendor/gpui_windows'
# Exit 1 significa que hay diferencias, no que la comparación falló.
```

No dejar un `Cargo.lock` de pruebas dentro del crate al producir el diff.
La evidencia guarda `upstream-vendor.patch`, manifiestos, hashes y los logs
en `C:/tmp/vw3-gpui-texto-evidence/`.

Al subir la revisión:

1. Partir de una copia limpia del nuevo `crates/gpui_windows` y materializar su
   licencia. No copiar crates sin cambios.
2. Resolver la herencia del nuevo `Cargo.toml` contra **su** workspace de Zed:
   mismos valores, features y lints; sustituir los paths Zed por Git/revisión
   nuevos, conservar opcionales y añadir `[workspace]` vacío. No reutilizar
   ciegamente versiones heredadas de la revisión vieja.
3. Reaplicar únicamente los hunks de `direct_write.rs` y `shaders.hlsl`.
   Revisar si upstream ya resuelve la máscara o expone un control equivalente;
   en ese caso retirar el parche que haya dejado de hacer falta.
4. Recalcular los cuatro `f32` con el nuevo
   `get_gamma_correction_ratios(2.2)`, contrastarlos por sus bits y mantener
   intacta la ruta subpixel. Repetir capturas de todos los widgets, Hub y
   espécimen claro/oscuro antes de aceptar el perfil.
5. Actualizar las revisiones de los consumidores y regenerar `Cargo.lock` en
   el ámbito de integración. Comparar el nuevo diff y repetir los gates.

El test nuevo usa máscaras reales de DirectWrite para `A` y `V`, cuatro fases
horizontales y Segoe UI instalado. Falla con upstream y pasa con el parche:

```powershell
cargo test --manifest-path vendor/gpui_windows/Cargo.toml --lib --features test-support grayscale_rasterization_matches_clear_type_coverage -j 2
cargo test --manifest-path vendor/gpui_windows/Cargo.toml --lib --features test-support -j 2
```

El manifiesto propio y `test-support` son necesarios para el arnés upstream.
`cargo test --workspace` verifica Vantare, pero no ejecuta los tests de esta
dependencia; no se presenta como cobertura del test nuevo. Los `Cargo.lock`
generados para esas pruebas se conservan en evidencia, no en el vendor.

## Integración pendiente

El encargo del worker no autoriza `native/Cargo.lock`. Cargo genera un único
cambio necesario: quitar el `source = "git+..."` de `gpui_windows`, manteniendo
versiones y dependencias. La copia de ese lock y su diff están en evidencia;
el lock versionado se restaura. **El orquestador debe incluir ese cambio antes
de ejecutar Cargo con `--locked` o integrar el parche.** No hay push, PR,
merge, promoción ni release en esta entrega.
