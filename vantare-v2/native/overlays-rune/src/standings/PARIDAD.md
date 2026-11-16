# Standings Vantare — port literal GPUI

A1 prepara geometría; no registra un widget ni cambia la imagen publicada.
Origen: `native/ui/src/standings/vantare.rs` de nightly `178611306`.
No se usa `domain::standings::Plan`. El Board y las plantillas compartidas
siguen siendo los de domain. No cambia GPUI, domain, IPC ni Cargo.

| GPUI | Rune A1 |
| --- | --- |
| `Kind`, `Cols::from_settings`, `Options::from_settings` | `layout.rs`, misma selección y orden |
| `Options::layout`, `driver_max`, `numeric_sectors` | Casos 340/520/900, pit 56, punto de clase, S1/S2/S3 |
| `shown_group`, `rows` | Clase del jugador, general o multiclase; entorno de tres filas |
| `plan`, `fixed_height`, `column_labels` | Misma reserva fija, posiciones y prioridad de pies |
| `gap_text`, `gap_labels`, `sector_labels` | Pole, mejor vuelta, tiempos numéricos y formato de reloj |
| `driver_text`, `vehicle_detail`, `header_clock` | Mismos textos previos a la medición tipográfica |

Los tests leen los siete snapshots DTO de `ui/fixtures/standings-vantare.scene.json`
sin copiarlos; los rangos de bytes se refieren a LF, normalizado en el test para
checkouts CRLF. Cambiar la fixture obliga a revisar estos rangos y los oráculos.
Se comprueban ambos idiomas y los tres modos/tamaños, posiciones de columnas,
alturas fijas, filas seleccionadas y estados contextuales.

A2 conectará cabecera, filas, celdas y constructor; retirará el permiso temporal
`dead_code`. A3 pintará banners, separadores, pies y espera con esqueletos.
Motion (#2465) queda congelado; la animación no forma parte de estos tres PR.
La comparación de píxeles queda para la tanda del PC de juego (#2365).

## A2 — cabecera, filas y celdas

`render.rs` porta `header`, `columns`, `row` (pose final sin Motion), `gained`,
`number`, `name`, `compound`, `pit`, `sectors` y `paint_gap_text` de GPUI.
Primitivas equivalentes a `Kit`: panel, marca, highlight, punto, chip, píldora,
fuentes y baselines. Nombres y lista de clases usan el mismo ajuste con «…».
Registro solo para Look Vantare; Scene compara estructura tras project_cached,
sin claves por sequence. Política estática, sin reloj. Se retira dead_code.
A3 completa la pintura de los elementos contextuales ya colocados por A1.
