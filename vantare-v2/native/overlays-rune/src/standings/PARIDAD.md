# Standings Vantare — port literal GPUI

A1 prepara geometría; A2 registra Vantare y porta cabecera, filas y celdas.
A3 debe entrar inmediatamente detrás, antes de cualquier promoción a testers.
Origen: `native/ui/src/standings/vantare.rs` de nightly `178611306`.
La pintura no usa `domain::standings::Plan`. El Board y las plantillas compartidas
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

A2 conecta cabecera, filas, celdas y constructor; retira el permiso temporal
`dead_code`. A3 pinta banners, separadores, pies y espera con esqueletos.
A1/A2/A3 no incluyen animación; #2465 añade ahora el movimiento literal de filas.
La comparación de píxeles queda para la tanda del PC de juego (#2365).

## A2 — cabecera, filas y celdas

`render.rs` porta `header`, `columns`, `row` (pose final sin Motion), `gained`,
`number`, `name`, `compound`, `pit`, `sectors` y `paint_gap_text` de GPUI.
Primitivas equivalentes a `Kit`: panel, marca, highlight, punto, chip, píldora,
fuentes y baselines. Nombres y lista de clases usan el mismo ajuste con «…».
Registro solo para Look Vantare; Scene compara estructura tras project_cached,
sin claves por sequence. Reposo sin reloj; #2465 añade FLIP/fade finitos. Se retira dead_code.
A3 completa la pintura de los elementos contextuales ya colocados por A1.

## Contrato y tipografía comprobados en revisión A2

Los flags solo los consume el plan de Eficiencia; la cabecera Vantare de GPUI no
los consulta. Se conserva esa cabecera literal, incluso sin currentLap visible.
content deriva los seis flags y los pies con las mismas reglas de GPUI.
fit reutiliza el helper Rune equivalente a efficiency/text.rs::fit_measured:
tolerancia 0,01 px y «…»; no se añade tolerancia a la selección de clases.
GPUI text::font activa tnum=1 y kern=1, también para Body y tras cambiar la familia;
el ink local de Standings declara ambas features. Alfa cero omite sombra y borde.

## A3 — estados contextuales

Se portan `banner`, `separator`, `footer` y `Kit::{band,rule,wait,skeleton}`.
FCY, amarilla local y última vuelta conservan sus colores, mayúsculas,
regla y damero; pies Frozen/Pits/Spectator/Session y bandas de clase literales.
Espera: mismo título y pista, cuatro esqueletos en compacto y cinco en los demás.
Todas las capas llevan pin. Tests de textos ES/EN, banda, esqueletos y límites.
A3 dejó las filas estáticas; #2465 añade FLIP y fundido de entrada. Los efectos van después.
Capturas de píxeles pendientes exclusivamente del PC (#2365).

## Revisión A3 — pausa y oráculos contextuales

La banda común de GPUI (app.rs, PAUSE_BANNER_HEIGHT=22) se porta como Relative:
EN PAUSA/PAUSED, #101113f2, posición y=plan.height y 22 px adicionales solo en
pausa, también en size_for antes de ingerir la foto. Se conserva la proyección
viva y una ventana abierta en pausa proyecta la foto retenida como Live.
El test rojo previo devuelve 289 en vez de 311; cubre entrar, repetir, salir,
abrir en pausa, ES/EN, las tres anchuras, pines y reposo sin reloj.

El separador recibe de plan el hueco superior de 6 px; label añade Display +1
y Mono +0. Tests fijan esos literales y el extremo derecho width−12.
Los casos contextuales se identifican por caption y texto, sin índices de foto.
El pie estrecho de GPUI escribe VR/FL y «31 °C · seca/dry», sin Pista/Track.
Se prueba con XS+Last (391 px, por debajo de narrow_width=400); el preset
compacto de 340 sin tiempos no pide pie Session. Estándar con Best (520 px)
sí conserva Pista/Track. También se prueban Pole, Tuya/Yours +1.234 y Parada/Stop 3.
Waiting (Missing) y Lost pintan espera y esqueletos; Stale y Paused conservan
la presentación de datos de GPUI. Límites de 340/520 con banner, pie y espera.

## #2465 — movimiento literal de Vantare

Origen: standings/motion.rs::Motion::{update_rows,pose,wake_rows} y
ui/styles/vantare.json::motion. Desplazamiento de 320 ms con CubicOut;
entrada de 220 ms lineal. El Tween común de Rune implementa CubicOut con
[1/3,1,2/3,1] y el canal alpha usa Tween::linear. Se prueban 80/160/319/321 ms
y 55/110/221 ms con valores numéricos literales, sin derivar el oráculo del helper.
EASE (0.25,0.1,0.25,1) y EASE_OUT (0,0,0.58,1) pertenecen al camino Eficiencia,
no al update_rows de Vantare. Vantare elimina las filas salientes, sin ghosts.

Los destinos salen de los Item::Row del plan literal. El FLIP interrumpido
arranca en la posición viva, con la misma duración. Cada fila se agrupa con pin
y opacidad explícita; los tests recorren la ventana durante movimiento y banner.
Scene incluye el Frame muestreado y solo recompone si cambia su estructura.
instant_changes aplica esas muestras sin otra transición automática de Rune.
sequence no decide proyección, continuidad ni animación: foto cambiada con el
mismo contador anima; solo cambiar el contador no reinicia los 320 ms.
El reloj se programa a los Hz del widget únicamente mientras hay transición;
al acabar no quedan despertares. Reducido salta al destino, sin fade ni reloj,
también si se activa a mitad de transición. La pausa conserva el frame pintado.
Destello, chip, barrido, batalla, rombo y boxes quedan para el PR del agente de
Daños apilado sobre #2465; la comparación de píxeles sigue en el PC (#2365).
