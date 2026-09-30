# Pulido acotado de paridad — ISA-1427

2026-09-30. [GitHub #1427](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1427).
Worker Codex; revisión pendiente de Claude Opus 5.5. Proyecto: arquitectura
Rust nativa, ADR 0099, fase 2. Rama `vantareapp/isa-1427-w-pulido`, base/HEAD
de entrada `63a59d0762f33b7e20455a0bc14dee073be175a6`.
Notion no disponible; excepción expresa del encargo. No se leyó ni actualizó
su tarea/proyecto: reconciliación operativa pendiente del orquestador.

## Resultado

Comparador original, umbral 8, RGBA premultiplicado, sin máscaras, referencias
o escenas modificadas. **Los cuatro siguen por encima del 4 %**.

| Widget | Antes px / % | Después px / % | Tinta de texto identificada | Fuera de cajas de texto |
| --- | ---: | ---: | ---: | ---: |
| Relative | 5033 / 5,8091 | 4801 / 5,5413 | 4025 (4,6457 % del total) | 775 |
| Car Damage Numbers | 1259 / 6,0355 | 1259 / 6,0355 | 1113 (5,3356 %) | 120 |
| Fastest Lap | 2347 / 4,7015 | 2347 / 4,7015 | 1847 (3,6999 %) | 407 |
| Multiclass Relative | 2811 / 4,3180 | 2811 / 4,3180 | 2700 (4,1475 %) | 111 |

Totales respectivos: 86640, 20860, 49920 y 65100 píxeles. Las cajas de texto
contienen 4026, 1139, 1940 y 2700 diferencias. `contar_texto.py` cuenta sobre
las cajas congeladas de `reference/*.geometry.json`, excluye padding de badges
y distingue tinta por contraste azul frente al percentil 10 del fondo local.
Es una **estimación conservadora**, no una segmentación perfecta ni una
demostración causal de gamma/hinting. Fastest Lap contiene franjas rojas dentro
de cajas anchas de texto: esos píxeles no se atribuyen a los glifos.

## Correcciones y límites por widget

- **Relative:** baseline del nombre de 19,5 a 20 px CSS, escalada a 304/430.
  El cambio de 0,3535 px físicos corrige el salto de un píxel en los nombres
  del jugador y del primer rival detrás; conserva las demás filas. El error
  medio premultiplicado de toda la imagen baja de 2,8358 a 2,3314. El separador
  inferior del jugador usa blanco al 8 %, como el `box-shadow` productivo,
  frente al separador común de tinta al 10 %. Ese borde aislado empeora en
  86 diferencias: la cobertura de la fila fraccionaria sigue siendo distinta.
  No se cambia el color CSS para compensarla. Hay 300 diferencias en y=284 y
  229 en y=100 fuera de la tinta: no son texto. El fondo/marco se ajusta a
  píxel en GPUI, mientras Chrome compone la superficie escalada; queda ese
  límite de cobertura. La tinta por sí sola ya supera el 4 %.
- **Car Damage Numbers:** se confirma CSS de cuatro paneles, 30,25 px por fila,
  separación 4 px, radio 6, Inter 750 y valores `100/100/100/13 %` de la escena.
  La tinta por sí sola supera el 4 %; las otras 120 diferencias están en los
  bordes/esquinas. Mover las cajas de label o valor ±1 px aumenta el error.
  No se conserva una calibración de tamaño, peso, color o posición.
- **Multiclass Relative:** coincide la composición congelada, incluidos los
  divisores de clase, badges HC/LMP/GTE, jugador y gaps `0/+4,5/+9/+13,5/+18`.
  Tinta 2700 px; las 111 restantes se concentran en esquinas/marco/badges.
  Desplazar los nombres ±1 px empeora. No se modifica el renderer ni la escena.
- **Fastest Lap:** datos, colores, baseline y franjas corresponden a TSX/CSS
  y geometría congelada. **No es un residuo exclusivamente textual.** Además
  de 1847 px de tinta hay 500 restantes: 247 en el cronómetro y 253 en franjas,
  cobertura del marco y otros bordes. Su ruta SVG de GPUI ajusta la caja a
  píxel, crea una máscara ampliada y la compone como sprite (`paint_svg` en
  `gpui/src/window.rs:4805`, revisión fijada `72d28c3`). Se ensayó conservar dentro
  del SVG el tamaño CSS exacto 38 × 44⅓ y y=29⅚ con una caja entera: empeoró
  a 2353 / 4,7135 %, error medio 1,9155 → 1,9364; se retiró. Los desplazamientos
  ±1 px del icono y de las tres líneas también empeoran. No se ha demostrado
  otra corrección local que consiga ≤4 %; tampoco se declara imposible. Queda
  pendiente revisar el raster SVG, separado del problema de texto del kit.

El texto usa el kit existente; su diagnóstico está en
[`../efficiency/RASTERIZACION.md`](../efficiency/RASTERIZACION.md).
No se modifica ese kit, GPUI, fuentes, configuración global, umbral ni datos.
El brillo CSS secundario al 1 % permanece aproximado como en la base; no se
añaden capas para compensarlo. No se alteran reglas de dominio ni animaciones.

## Reproducción y evidencia

Los PNG iniciales de `%TEMP%/vantare-parity` eran de portes anteriores (Relative
sin rivales y Multiclass sin gaps). Se regeneró una línea base propia que
reproduce exactamente las cuatro cifras del encargo. Artefactos:
`%TEMP%/vantare-pulido-1427/`: `baseline/`, `trial-1/`, `after/`, logs por widget,
JSON de recuentos, hashes y logs de gates. No se versionan PNG generados.

`compare.ps1` de esa carpeta es una copia del original con solo `-j 4` → `-j 2`
y `$PSScriptRoot` resuelto a `native/ui`; conserva el mutex global de captura.
Desde `native/`, repetir para cada widget:

```powershell
$env:CARGO_PROFILE_DEV_DEBUG = '0'
$env:CARGO_INCREMENTAL = '0'
$env:RUST_TEST_THREADS = '2'
& "$env:TEMP/vantare-pulido-1427/compare.ps1" -Widget relative -MaxPercent 4
python ui/src/relative/contar_texto.py relative `
  "$env:TEMP/vantare-pulido-1427/after/relative/relative.png" `
  ui/reference/relative.png ui/reference/relative.geometry.json
```

Para actualizar esa captura explícita, añadir `-Out
"$env:TEMP/vantare-pulido-1427/after/relative"` al comparador. Sustituir el nombre
por `car-damage-numbers`, `fastest-lap` o `multiclass-relative` para los otros.
El comparador conserva salida 1 por superar el 4 %; `-MaxPercent 100` se usa
solo en los ensayos para informar cifras, nunca como aceptación.

Las regresiones visuales sustituyen un test unitario que solo repetiría las
constantes del painter. Escenas reconstruidas de Workshop; no son LMU/OBS live.
No se verifican otros DPI, otra GPU ni efectos/configuraciones diferentes.

## Gates y entrega

Todos los gates obligatorios terminan con salida 0, desde `native/`:

- `cargo fmt --check`: PASS.
- `cargo clippy --workspace --all-targets -j 2 -- -D warnings`: PASS,
  `Finished dev profile` en 15 min 21 s, incluida la compilación de DuckDB.
- `cargo test --workspace -j 2`: PASS, 620 tests libtest y 11 de ciclo de vida
  en su harness propio; 0 fallos y 4 pruebas live omitidas por sus requisitos.
  Domain 107/107; UI 98/98; Workshop 4/4. No se presentan las omisiones como
  pruebas físicas. La compilación de tests tarda 4 min 07 s.
- `rustfmt --edition 2024 --check ui/src/relative/mod.rs`: PASS. Se verifica
  también el módulo, que entra al registro mediante macros.
- `git diff --check`, sintaxis Python y recuentos reproducidos: PASS.
- Cuatro capturas finales con `-MaxPercent 4`: FAIL de paridad esperado,
  salida 1; los porcentajes de la tabla siguen por encima del gate.
- Car Damage Numbers, Fastest Lap y Multiclass Relative: imágenes finales
  idénticas a su línea base en RGBA decodificado. `summary.json` conserva
  esa comprobación y los recuentos finales.

No se ejecutan Go/frontend porque no cambian su código ni contratos.
Solo entrega y commit local para revisión. Sin push, PR, merge,
promoción, release ni CI remoto. Solo `relative/mod.rs` cambia producción;
`PULIDO.md` y `contar_texto.py` conservan evidencia diagnóstica en rutas propias.
Ningún otro widget, `domain/`, escena ni kit compartido cambia.
