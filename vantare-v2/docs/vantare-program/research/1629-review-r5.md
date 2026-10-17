# #1629 / VANTA-8 — Respuesta a la review DeepSeek, ronda 1

PR [#1641](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1641).
Origen: cuatro informes de `C:/VantareServer/evidence/rev-1641/`, sobre `31dcf68b9`.
Esta respuesta no sustituye el veredicto independiente de la ronda 2.

## P2 y regresiones

Los tests observan texto, color o geometría que consume el pintor productivo.
`paint_tests::observe` recoge las órdenes Label; la app las entrega directamente a
Kit/GPUI. No se construye otra proyección ni un renderer alternativo. En Mapa se
inyecta la medición para hacer determinista el test del ajuste; producción mide
con el sistema tipográfico de GPUI. Torre cruza la geometría real con la máscara.
No son capturas ni validación del raster tipográfico. Sin ventanas ni nuevas
dependencias de tests: no se habilita `gpui/test-support` sin autorización.

| Informe / fallo | Cambio | Test de salida observable |
|---|---|---|
| A-1 Catálogo incompleto | CATALOG y ORDER se contrastan con ALL menos CarDamageNumbers, cada tipo una vez | catalog_lists_every_registered_widget_once; catalog_groups_locked_widgets_under_pro_and_keeps_plan_widgets_addable |
| B1 Delta cifra viva y test complaciente | Sector Live entrega su número al pintor | running_sector_subtracts_closed_sectors_and_requires_their_deltas |
| B1 Trace progreso inválido | Distancia/longitud finitas, longitud positiva, progreso 0..100 % | header_never_paints_nonfinite_or_out_of_range_progress |
| B1 Trace sectores inválidos | Tiempos finitos positivos y diferencia finita, si no guion | sector_footer_paints_a_placeholder_for_invalid_times |
| B1 Trace copias profundas | History/Details retenidos con Arc y copy-on-write en ingest | retained_frames_share_storage_and_a_new_photo_preserves_the_old_frame: identidad compartida y textos retenidos 50 % / 25 % |
| B1 Vuelta rápida récord sin referencia | Exige al menos una referencia fiable | missing_class_sector_references_never_paint_a_record_chip: fondo neutro frente a morado |
| B1 Torre recorta tarjetas | Inspector/normalización máximo 11, ancho ajustable y texto dentro de tarjeta | every_supported_card_is_inside_the_paint_mask |
| B1 Torre espera sin traducir | status_text de dominio según idioma y causa | empty_tower_paints_the_localized_reason |
| B1 Daños Cifras invertidas | Porcentaje de daño, también neumáticos | numbers_paint_damage_loss_not_remaining_integrity |
| B1 Daños oculta Aero | Omite la fila y compacta las siguientes | show_aero_false_removes_the_painted_row_and_compacts_the_rest |
| B2-1 Media tanda | Etiqueta últimas 3 vueltas, igual al cálculo real | session_average_paints_the_three_measured_lap_window |
| B2-2 Fuel energía/qualy/práctica | Recurso limitante, porcentaje/litros y vueltas restantes reales | practice_and_qualifying_paint_the_limiting_resource |
| B2-7 Cara a cara signo | Positivo pérdida, negativo ganancia | race_gap_paints_loss_ahead_and_gain_behind |
| B2-8 Cara a cara sin dato | Guion neutro para gap y sectores | missing_gap_and_sectors_paint_a_neutral_placeholder |
| B2-23 Pedales Waiting/Lost | Banda de estado sin exigir valores de pedal | waiting_and_lost_paint_the_status_without_any_pedal_values |
| B2-27 Telemetría pedales estado | status_text llega a la tira | every_absence_reason_reaches_the_painted_status |
| B2-31 Banderas color | Título y mensaje usan text_color | configured_color_is_used_in_both_painted_captions |
| B2-36 Radar sin posición | Texto específico según las cuatro capacidades | unavailable_radar_paints_the_spatial_reason_in_both_languages |
| B3-10 Standings LMP2 | Solo abrevia LMGT3 a GT3 | class_leader_text_preserves_lmp2_and_only_abbreviates_lmgt3 |
| B3-17 Mapa cabecera | Mide la derecha y ajusta la izquierda con elipsis | long_track_header_is_fitted_before_it_reaches_the_painter |

El ajuste Color del texto de Banderas conserva los colores guardados explícitos.
Las instancias nuevas usan el texto claro del sistema para que sea legible sobre
el panel oscuro; se conserva el caso histórico negro sobre bandera negra.

## Validación y límites

Primer corte: check workspace/all-targets PASS y 21/21 casos dirigidos PASS.
Contraprueba temporal: reintroducir los fallos produce 21 FAIL/2 PASS (23 casos),
incluidos número vivo omitido, NaN, ficha morada sin referencia, tarjeta 15 fuera
de máscara, integridad en lugar de daño, Aero ignorado, color ignorado, estados
ausentes, recurso incorrecto, signo invertido, LMP2 recortado y cabecera sin ajuste.
Se restauran exactamente los 15 archivos mediante SHA-256. El segundo test de
grupos pasaba porque las sugerencias reinsertaban Relative: se refuerza también
con todas las tarjetas colocadas, sin sugerencias que oculten una omisión.
Logs locales: regressions-first.log, mutation-red.log y mutate.py. Ningún cambio
temporal se publica. Resultados finales, SHA y CI se añaden al cerrar la tanda. Evidencia de esta ronda:
`C:/VantareServer/evidence/1629-r5/`. Se conservan los intentos que fallan.
Se incorpora nightly mediante merge tras las correcciones; sin rebase ni force-push.
La paridad visual 17 × 4 y variantes sigue pendiente de #1675: ninguna ventana ni
captura nueva. Las imágenes R3 son históricas y no certifican este HEAD.
No se integra el PR, promociona, publica release ni despliega.

## Todos los P3 de los cuatro informes

Los pendientes se conservan para revisión; no se dan por resueltos por pasar tests.
Los casos marcados parciales explican qué parte se corrigió. Los IDs B1-P3-N son
el orden de los encabezados P3 del informe B1. Las observaciones que el propio
revisor verificó correctas se mantienen como notas, sin inventar defectos.

### A-2 — CORREGIDO: comentario distingue proyección 3..20 y límite del pintor 3..11.

`domain/src/broadcast_tower.rs:52` vs `:79`

Doc “acotada entre **tres y diez**” con `clamp(3, 20)` real y el inspector a 3..20 (`hub/src/inspector.rs:338-341`). Solo el comentario está obsoleto.

### A-3 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

`domain/src/multiclass_relative.rs:190` (+ `ui/src/multiclass_relative/mod.rs:449`)

Cambio de comportamiento **visible** en un widget existente: el signo de todos los gaps se invierte (delante pasa a negativo) y la columna pasa de posición general (`1`) a posición de clase (`P1`). Lo he verificado coherente con el modelo y con la tabla Relative de nightly, pero la expectativa del oráculo de diseño se **reescribió en este mismo PR** en vez de re-derivarse, y no hay verificación visual. Necesita confirmación de Isaac en la aceptación visual de #1675.

### A-4 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

`domain/src/head_to_head.rs:130-136`

`rival_car` se re-localiza comparando el **string** de la posición (`c.position.current().map(u32::to_string) == rival.place`) aunque `project` ya tenía el `&Car` y la fila lleva `CarId`. Hoy no es alcanzable un fallo porque `project` aborta antes si hay posiciones duplicadas (`:88-90`), pero es lógica duplicada y depende del formato del texto: si cambia el formato de `place` (p. ej. a `P1`) el duelo desaparece o apunta a otro coche sin que falle ningún test. Bastaría resolver por `CarId` desde la fila.

### A-5 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

`domain/src/head_to_head.rs:151-200`

Con `best_laps` y `Target::Behind` la cabecera es “H2H · DETRÁS/BEHIND” pero el duelo compara mejores vueltas y `duel.gap` es la diferencia de mejor vuelta con el vecino (no la distancia a la pole como en `Ahead`). Semántica mixta: conviene decidir si en clasificación el modo Behind también debe referenciar la pole.

### A-6 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

`domain/src/relative.rs:348-352`

`other_class` compara `Option<ClassId>`: un coche sin clase y un jugador sin clase cuentan como “misma clase” y se excluyen; dos clases reales distintas pero ambas sin dato se agruparían. Con `ClassMode::Other` y clases ausentes el filtro miente en silencio.

### A-7 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

`domain/src/car_damage_visual.rs:70`

Los campos nuevos `integrity`/`tyres` (los que consume el pintor, incluidas comparaciones exactas `== Some(1.0)`) **no** tienen aserción de dominio: el test `:115` solo comprueba `damage`/`percentages`. Merece un caso por valor (0.0, 1.0, fuera de rango, NaN, Stale, Unavailable) para los nuevos campos.

### A-8 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

`ui/src/app.rs:1233-1254`

Sondeo global de teclas cada **32 ms** mientras haya un widget de Daños visible con tecla configurada: mantiene el CPU despierto ~31 veces/s durante toda la sesión (se cancela bien y no repinta si no cambia). Para un overlay de juego es aceptable, pero conviene anotar el coste o subir el periodo sabiendo que la tecla se lee por estado global.

### A-9 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

`ui/src/app.rs:1883`

El test pasa de `show_clutch = false` a `= !options.show_clutch`: sigue probando que un cambio de ajuste altera la identidad del renderer, pero ya no fija el valor por defecto (un cambio de default pasaría inadvertido).

### A-10 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

`hub/examples/widget-workshop.rs:65`

El banco QA concede `CatalogAccess::Pro` + `verified`. Es un `example` (no se instala) y exige directorio aislado, pero no ejerce el límite de 4 widgets del plan Gratis; queda como vía documentada de QA, no como prueba de derechos.

### A-11 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

`hub/src/shell/navigation.rs:55,787`

El Workshop deja de estar oculto en beta pero `beta_navigate` lo rechaza sin acceso verificado: el ítem del menú se ve con la insignia “Acceso sin verificar” y **el clic no hace nada**. Es coherente con “sin acceso verificado no se vende Pro”, pero convendría enseñar el motivo al pulsar (o llevar a Cuenta).

### B2-3 — PARCIAL: cuarta fila pinta el plan calculado; el pie qualy de carga mínima sigue sin productor y muestra guion.

`ui/src/fuel_strategy/vantare.rs:841`, `:846-848`, `:850-856`

La 4.ª fila es **siempre** un guion: «Plan —» en qualy y «Stint completo —» en práctica, y encima va marcada `me: i == 3` (se pinta como valor propio resaltado). El pie de qualy es un literal «Carga mínima para el plan: —». Mientras, el tablero sí trae plan calculado (`domain/src/fuel_strategy.rs:362-372`: en práctica, sin vueltas de sesión, `Plan::Stop(completed + laps)` o `Plan::Finish(sobran X L)`), y el mismo hueco en Estándar/Carrera muestra «Parar en v X» / «Llegada: sobran X L». Se pierde un dato calculado y disponible. Si es intencional (reserva para una versión futura), conviene confirmarlo; si no, la fila miente por omisión.

### B2-4 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

`ui/src/fuel_strategy/vantare.rs:918-930`, `:1293`, `:1298`

Altos fijos `204.0` (Estándar) y `440.0` (Ampliado) en píxeles, mientras el de Compacto se deriva del `Style` (`2·padding + header + big + …`). Son constantes de un único sistema de diseño (`Style::compiled()`): si cambia la geometría/fuente, el constante no se ajusta. Al pintar se usa `plan.content.min(plan.height)`, así que si el contenido supera la constante se recorta **en silencio** (sin elipsis ni aviso), y si es menor queda hueco muerto entre el panel y el borde de la ventana (que mantiene `height`). El test nuevo `every_fuel_state_keeps_its_frame_and_all_lines_fit` (`:2035`) solo recorre los estados del fixture; no detecta el hueco muerto ni estados fuera del fixture.

### B2-5 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

`ui/src/fuel_strategy/vantare.rs:1109-1132`

El nuevo rótulo de cabecera («FUEL · CLASIFICACIÓN», +14 caracteres) se pinta con `Kit::label` (`vantare/paint.rs:141`), que **dibuja al ancho real sin recortar ni ajustar** (`text::fit` solo se usa en las fichas, `:1253`). El ancho Compacto del catálogo es 230 px (`:2061`) y ningún test mide el ancho del texto: `catalogue_widths_and_every_state_have_their_lines` (`:2057`) solo compara el ancho de la caja del widget con los literales del catálogo, y `sessions_relabel_the_same_fuel_without_resizing_or_overflowing` (`:2129`) solo comprueba el alto. Riesgo de texto que se sale por la derecha no verificado.

### B2-6 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

`ui/src/fuel_strategy/vantare.rs:1122-1123`

El relabel de cabecera sobrescribe `left` en **todos** los tamaños, también Ampliado: en práctica/qualy se pierde «STINT n» de la cabecera (`FUEL Y STINT · STINT 2` → `FUEL · PRÁCTICA`). El número sigue en el pie (`stint_footer`), así que es cosmético.

### B2-9 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

`ui/src/head_to_head/mod.rs:123`

`vm.header.replace("H2H · ", "VS ")`: el pintor parsea un string de presentación del dominio (formato `H2H · DIRECCIÓN`, `domain/…:45-49` y `:114`). Si el header cambia de formato o de idioma, el rótulo se degrada en silencio (queda el header entero) sin fallar ningún test.

### B2-10 — PARCIAL: comparación usa gain/loss/muted del Style; los colores decorativos heredados quedan pendientes.

`ui/src/head_to_head/mod.rs:66`, `:79`, `:141`, `:143`, `:164`, `:213`, `:215`

Colores de paleta escritos a mano en lugar de `style.colors.*`: `0xff7a82` = `colors.loss`, `0x4ade80` = `colors.gain`, `0xe14a54` = `colors.compound_soft` (usado aquí como fondo de «Tú», con semántica de neumático blando) y `0xfaf7f7`, que **no existe** en `styles/vantare.json` (`colors.text` es `#ece6e7`). El kit ya expone `Tone`/`style.colors` (como hace `fuel_strategy/vantare.rs`), así que este widget no seguiría un cambio de paleta del sistema de diseño.

### B2-11 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

`ui/src/head_to_head/mod.rs:70-80`

El rótulo de fila es `format!("P{}  {}  #{}", row.place, …)`: `place` es el número pelado (`domain/…:334` `position.to_string()`), así que «P1» es correcto, y va con `text::fit(…, 180.0)` dentro del bloque de 200 px ✓. Solo anoto que el nombre del jugador se sustituye por «Tú/You», de modo que el bloque del jugador nunca muestra su nombre (decisión, no fallo).

### B2-12 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

`ui/src/head_to_head/mod.rs:416-441` (test)

El test sustituido ya no comprueba la vecindad (que el rival sea el inmediato delante/detrás): solo que hay dos bloques, que uno es el jugador, que hay un `selected` y que el tamaño es constante, más que `Lost` vacía el duelo. La proyección del duelo la cubren los tests de dominio (parte A), pero la UI deja de proteger el «sin saltarse coches».

### B2-13 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

`ui/src/head_to_head/mod.rs:44-58` (dibuja `vm.no_rival` tal cual)

El vacío no distingue el motivo, y uno de ellos es engañoso: en el dominio, cualquier estado que no sea `Live` (pausa, stale, desconectado) escribe `ESPERANDO A LMU`/`WAITING FOR LMU` (`domain/src/head_to_head.rs:57-63`) aunque el simulador esté en marcha y solo estén los datos parados; el resto de widgets usa `source_status` y distingue `EN PAUSA`/`DATOS ANTIGUOS`/`DESCONECTADO` (`domain/src/relative.rs:372-389`). Además, «falta posición de un coche», «posiciones duplicadas», «no encuentro tu coche» y «de verdad no hay rival» comparten el mismo `SIN RIVAL` (`:65-99`). El pintor no puede corregirlo porque solo recibe el texto.

### B2-14 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

`ui/src/input_telemetry/mod.rs:367`

`let speed = vm.speed.replace("KPH", "km/h");` deshace exactamente el apaño que hace el dominio: `format::speed` produce `km/h`/`mph` (`domain/src/format.rs:127-136`) y la proyección lo reescribe a `KPH` (`domain/src/input_telemetry.rs:246-250`, con el comentario «El productivo usa … KPH … hasta tener otro consumidor»). Resultado visible correcto (`180 km/h` métrico, `112 mph` imperial), pero es ida y vuelta por string entre dos ficheros: si cualquiera de los dos cambia el literal, el rótulo se degrada en silencio y ningún test lo cubre. El comentario del dominio ya es falso con este consumidor.

### B2-15 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

`ui/src/input_telemetry/mod.rs:298-305`, `:342-381`

Se elimina el recorte que tenía el productivo: antes `text::fit(…, 62.0)` para marcha/velocidad/rpm y `text::fit(…, graph_width)` para el estado; ahora solo se mide (`text::width`) para centrar y se pinta con `kit.label`, que **no recorta** (`vantare/paint.rs:141-155`). Con los textos actuales no hay desbordamiento (`SIN DATOS`, `DATOS ANTIGUOS`, `DESCONECTADO`, `NO DATA`, `DATA OUT OF DATE`, `DISCONNECTED` ≤ 16 caracteres a 12 px), así que no es un fallo vivo, pero se pierde la garantía: cualquier estado más largo se saldría por encima de las barras de pedales y de la marcha, y ningún test lo mide.

### B2-16 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

`ui/src/input_telemetry/mod.rs:211-213`, `:330`, `:338`, `:352`

Colores de paleta escritos a mano y con semántica de neumáticos: `0x4f8ef7` = `colors.compound_wet`, `0xe14a54` = `colors.compound_soft`, `0x22c55e` = `colors.green` (`styles/vantare.json:76-93`). El kit expone `style.colors`/`Tone` y no se usa. Igual que en H2H: el widget no seguiría un cambio de paleta. También hay constantes mágicas repetidas de la geometría (12, 440, 462, 74, 550/544) que no salen del `Style`.

### B2-17 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

`ui/src/input_telemetry/mod.rs:422-441`

Test nuevo `approved_strip_keeps_its_size_with_partial_or_missing_signals`: solo comprueba `widget.size() == (600.0, 84.0)`, que es devolver la constante `SIZE` (`:79-81`); no ejercita ni la traza ni el pintado ni el vaciado de muestras con `Paused`/`Lost`, así que no protege nada de lo que cambia este PR (tampoco el `fit` eliminado). El otro test nuevo (`:395-419`) sí es útil: fija 91 muestras, la ventana exacta de 6 s en el ejemplo aprobado, `show_clutch == false` y la marcha.

### B2-18 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

`ui/src/multiclass_relative/mod.rs:212-215` (trazo) + `domain/src/multiclass_relative.rs:158-165`

El umbral de la tendencia por vuelta es distinto del canónico: aquí se filtra `*v != 0.0`, mientras la tabla Relative del sistema (`domain/src/relative.rs:889-891`) exige `t.abs() >= 0.05`. Con una tendencia de 0,01 s/vuelta el widget escribe «▲ 0.0»/«▼ 0.0» (ruido que la tabla sí oculta). La flecha y el color sí coinciden con la tabla canónica (`ui/src/relative/vantare.rs:514`: `if t.closing { "▲" } else { "▼" }` con `closing = t < 0.0`), y `good` reproduce fielmente la regla del jugador de `relative.rs:895-900` en los cuatro casos (delante/detrás × cerca/se aleja) — lo he comprobado a mano.

### B2-19 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

`ui/src/multiclass_relative/mod.rs:87-95`

El color del texto de la insignia de clase se decide comparando la **etiqueta** con el literal `"GT3"`: fondo oscuro para GT3 y blanco para todo lo demás. `style.class(name)` (que sí usa el nombre completo) reparte los puntos por fragmento `hyper`/`lmp`/`gt`/resto (`styles/vantare.json:108-131`), así que dos clases con el **mismo** punto verde `#22c55e` reciben textos distintos: «GT3» oscuro y «GTE»/«GT4» blanco (el ejemplo aprobado incluye GTE). El sistema de diseño ya da un `ink` por clase (`#7ee2a3` para gt) que este pintor ignora, igual que el `tint`. Además acopla el pintor a un string del dominio.

### B2-20 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

`ui/src/multiclass_relative/mod.rs:44-59`

En el estado sin datos (`SourceState::Waiting`/`Lost`, y también sin coche propio) el dominio devuelve `ViewModel::default()` con `player_class` **vacío** (`domain/src/multiclass_relative.rs:66-77`), y el pintor compone el badge como `format!("{} {} · ±{}", …)` → se lee «TÚ EN  · ±3» con la clase en blanco. El estado reconocido (el pie dice «SIN DATOS»/«NO DATA») queda así medio dibujado con un hueco sin `—`.

### B2-21 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

`ui/src/multiclass_relative/mod.rs:27`, `:61`, `:241`

El número de filas se **re-deriva** en el pintor desde el alto (`((size.1 − 77.0)/24.0).round()`) y el pie usa `39.0 + count·24`, mientras el alto sale de `Settings::size()` → `SIZE.1 + (row_count − 7)·24.0` (`:322-324`). Los tres números (77, 39, 24) están duplicados a mano y `24` es ya `geometry.row_height` (`styles/vantare.json:4`) que el propio kit usa para `highlight`/`skeleton`: si el estilo cambia el paso de fila, el resaltado y el esqueleto seguirían el estilo y las filas no. El `as usize` satura a 0 si algún día el alto baja de 77 → widget en blanco. Ningún test cruza `Settings::size()` con el `count` derivado (solo fija el alto para 7 y 9).

### B2-22 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

`ui/src/multiclass_relative/mod.rs:389-420` (test)

El test que sustituye al anterior ya no comprueba la semántica de los filtros de clase: se perdió `all rows class_label == "HC"` con `same` y `all rows class_label != "HC"` con `other`. Ahora solo valida el ida y vuelta de guardado (`saved.normalized() == settings`), que el jugador cae en `count/2` y que el VM coincide con la proyección pura del dominio. Los filtros los cubre el dominio (`domain/…:291-318`), pero la UI ya no protege el cableado `class_mode` → `Content`. Sí valora: el cambio de `snapshot_metadata_and_unrendered_signals_do_not_repaint` a la secuencia aprobada añade dos aserciones buenas (el nombre propio tras «Tú» no repinta; el del rival visible sí).

### B2-24 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

`ui/src/pedals.rs:273-296`

`BrakePeak::ingest` considera «nueva frenada» cualquier valor `> 0.0` estricto: un residuo del canal (p. ej. 0,004) reinicia el pico y el widget pasa a mostrar un pico ridículo en lugar del máximo real de la última frenada. El repositorio ya tiene el precedente del epsilon de repostaje (`runtime/src/core/fuel.rs:15` `REFUEL_EPSILON_L`). No puedo comprobar el ruido real del canal en el simulador, pero el umbral exacto es una elección frágil. Por lo demás la máquina de estados es correcta: `None` borra el pico (no se inventa), `0.0` lo conserva, `previous` se reinicia al cambiar de identidad (epoch/sesión/coche, `:356-366`) y los valores que llegan están filtrados a `0..1` y finitos en el dominio (`domain/src/pedals.rs:91-98`).

### B2-25 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

`ui/src/pedals/vantare.rs:110-122`, `:225-266`

La banda se parametriza con números mágicos: `20.0` de alto y `11.0` de tamaño de fuente para «LIMITADOR», frente a `geometry.banner_height`/`fonts.banner` del sistema para el resto de avisos. Si el sistema cambia la banda, el limitador no la sigue. Además `LIMITADOR` **sustituye** al mensaje de estado (no se pueden ver a la vez); es defendible porque el limitador exige `SourceState::Live` (`:369-372`), pero conviene que sea una decisión consciente.

### B2-26 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

`ui/src/pedals.rs:491-516`

`approved_pedals_box_stays_fixed_and_transparency_and_peak_are_saved` compara `widget.size()` consigo mismo en tres estados (la función devuelve una constante: `pedals/vantare.rs:83-86`), así que no protege nada del cambio; lo útil del test es el ida y vuelta de `serde`. Los otros dos test nuevos sí son de comportamiento (`brake_peak_tracks_one_braking_event_and_never_keeps_missing_data` `:478`, `brake_peak_is_reset_when_source_session_or_car_changes` `:441`, `limiter_requests_its_signal_and_invalidates_without_changing_the_box` `:519`) y cubren exactamente la lógica nueva: máximo por frenada, reinicio por identidad, `None` sin pico y la demanda de `PitStatus`.

### B2-28 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

`ui/src/pedals_telemetry/mod.rs:300-350`

Con `showClutch = false` el bucle salta la fila `i == 0` pero mantiene `y = 10.0 + i·16.0`, así que queda una **fila vacía de 16 px arriba** (el freno y el acelerador se pintan en 26 y 42). El pintor anterior compactaba (`index = if show_clutch { i } else { i - 1 }`). El marco mide 64 px fijos, de modo que el hueco es visible; si es una decisión del diseño, conviene que esté dicha.

### B2-29 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

`ui/src/pedals_telemetry/mod.rs:364-366`

`format!("{:+.0}°", v * 450.0)` con `v` = `steering` del dominio, que **no se redondea**: solo se filtra y se acota a ±1 (`domain/src/pedals_telemetry.rs:128-130`). Un volante casi recto con signo negativo (`v` en (−0,005, 0)) escribe «-0°». El volante dibujado sí se cuantiza a 0,5° (`wheel_quantum`, `:189-191`), así que puede haber medio grado de diferencia entre el texto y el SVG; es despreciable, pero el «-0°» no.

### B2-30 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

`ui/src/pedals_telemetry/mod.rs:267`, `:304`, `:341`-`345`

Otra vez colores de paleta a mano: `0x6e6668` (= `colors.frozen`/`colors.column`), `0x4f8ef7` (= `compound_wet`), `0xe14a54` (= `compound_soft`), `0x22c55e` (= `green`) y `0xffffff` al 8 %. El kit y `style.colors` están disponibles; como en H2H (B2-10) y telemetría de entrada (B2-16), un cambio de paleta en `styles/vantare.json` no llegaría a este pintor.

### B2-32 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

`ui/src/racing_flags/mod.rs:39`, `:37`, `:590-615`, `:619-627`

El pulso amarillo ya no pinta nada: `paint_content` recibe `_pulse` y **no lo usa** (antes modulaba el alfa del borde: `0.48 + pulse * 0.52`), pero `Widget::frame` sigue calculando `pulse` y devolviendo `Wake::Frame` durante una vuelta completa de 920 ms. Son ~28 repintados idénticos por cada entrada en amarillo. El test `yellow_pulse_ends_and_identical_snapshots_do_not_restart_it` (`:801-818`) sigue fijando ese comportamiento muerto, así que nada avisa de que se puede borrar.

### B2-33 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

`ui/src/racing_flags/mod.rs:206-215`

El lavado de color se pinta con `rect(1.0, 1.0, 250.0, 86.0)` y radio 9 (= radio del panel − 1) dentro de un panel de **340** px: el 250 es el ancho del widget antiguo. Como el degradado es horizontal (`linear_gradient(90.0, 0.13 → 0.0)`, misma convención que `player_vertical ? 180 : 90` de `vantare/paint.rs:242-255`), la arista derecha queda con alfa 0 y **no se ve**; el efecto real es que el tinte se apaga a los 250 px y el tercio derecho del panel nunca lleva color. Si es un resto del ancho viejo, cambiaría la velocidad del degradado, no la estructura. No verificado visualmente.

### B2-34 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

`ui/src/racing_flags/mod.rs:456-478`

`demo_penalty` mete en el binario de producción dos fixtures (`include_str!("../../fixtures/racing-flags-design-system.sequence.json"` y `.penalties.json`) y reparte DT/SG/DESCALIFICADO cuando la foto entrante es **idéntica** a una de la demo; en telemetría real la comparación no coincide nunca, así que no hay fuga práctica (el propio test lo comprueba mutando `origin.source.kind`), pero el mecanismo es una heurística por igualdad estructural y cuesta una comparación profunda de las 4 fotos en cada `ingest` (33 Hz). Parte A ya lo declaró como limitación del changelog; lo dejo aquí para que quede en el informe de esta mitad.

### B2-35 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

`ui/src/racing_flags/mod.rs:363`, `:402`

Título y mensaje van con `text::fit(…, 250.0)` (el ancho real disponible: 340 − 76 − 14 = 250 ✓). El título más largo es «FIN DE LA CLASIFICACIÓN» (22 caracteres) a 20 px `Face::Display` con tracking 1.4: no he podido medirlo sin pintar, pero si no cabe el resultado es un título recortado con puntos suspensivos en el estado más visible de una clasificación; conviene comprobarlo en la aceptación visual. El mensaje (12 px) sí queda holgado.

### B2-37 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

`ui/src/radar.rs:154-162`

La banda del mensaje se pinta con `round_rect(1.0, 190.0, 218.0, 29.0, radio 0.0)` y el panel tiene radio 10 (`styles/vantare.json`, variante neo), sin máscara de recorte en el host (no hay `ContentMask` en `app`/`overlay`/`paint`): las esquinas **cuadradas** de abajo sobresalen del contorno redondeado del panel. El lavado del widget de banderas sí usa radio 9 para encajar (B2-33), así que aquí falta ese ajuste.

### B2-38 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

`ui/src/radar.rs:126-140` (dibujo) frente a `:190-209` (frase)

La frase puede hablar de coches que no están en la imagen: el dominio solo acota a ±36 m (`RANGE_M`, `domain/…:7`) mientras el pintor **descarta** coches fuera de `x ∈ [8, 212]` / `y ∈ [20, 200]`, que a 8 px/m son ±12,75 m en lateral y ±11,25 m en longitudinal. Un rival a 25 m detrás acercándose produce «Se acerca detrás · +36 km/h» con el radar vacío. Si la intención es avisar de lo que la ventana no muestra, conviene decirlo; si no, la frase debería mirar el mismo cuadro que los sprites.

### B2-39 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

`ui/src/radar.rs:126-140`

El radar pierde la marca de **doblado**: el pintor anterior daba color propio al coche doblado (`0x35688f`) y resaltaba la combinación doblado+cerca+sin solape; ahora todos los coches usan el color de su clase y solo cambia el alfa por `near`. El campo `lapped` sigue en el dominio (`domain/…:32`) y solo lo usan los tests (`ui/src/radar.rs:416`), señal de que puede ser un olvido y no una decisión.

### B2-40 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

`ui/src/radar.rs:113-124`, `:173`, `:244-247`

Nits de unidad y texto: la escala escribe «5» y «10 m» (una con unidad y otra sin ella) para los anillos de 5 y 10 m; la frase se pasa a `to_uppercase()` y convierte la unidad en «KM/H» («SE ACERCA DETRÁS · +36 KM/H»); y el comentario de `Settings::UNSUPPORTED` sigue diciendo que «`RadarFunctional` no ofrece ajustes visuales ni de contenido» cuando el widget estrena `showPhrases`, que sí está expuesto en el inspector (`hub/src/inspector.rs:537-542`).

### B1-P3-01 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

P3 — Semántica del valor: mezcla dos referencias distintas

- `delta/vantare.rs:272-281`: la resta supone que `delta_s` es un delta "en la misma posición"
  frente a la referencia y que los deltas de sector son frente al mejor sector propio. Con
  `Reference::PersonalBest`, `reference_lap_s` es la **mejor vuelta** (`domain/src/delta.rs`,
  `Reference::PersonalBest => lap_time(&me.best_lap_s)`), no la suma de mejores sectores
  (`domain/src/delta.rs`, `optimal()`). La identidad sólo se sostiene si `delta_s` es un delta
  posicional contra esa misma vuelta; si la fuente entrega un delta ya "proyectado" a fin de
  vuelta, `delta_s − Σ cerrados` no es el delta del sector en curso. El test lo comprueba con
  valores construidos a mano (`editorial`), no con una foto real, así que la semántica queda sin
  evidencia. Recomendación: fijar con una foto real de `testdata` o documentar la identidad.
- Observación: con `Reference::Optimal/Leader` los deltas de sector siguen siendo frente al mejor
  sector propio (`domain/src/delta.rs: sectors()`), por lo que el valor mezcla referencias de
  todos modos.

### B1-P3-02 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

P3 — Números/valores mágicos nuevos en el trazado

- `delta/vantare.rs:134`: `content: 34.0` fijo para la píldora, mientras `d.pill_height` es 36 en
  `styles/vantare.json`. El `size()` que ve el host sigue siendo 36 (`layout.height = pill_height`,
  línea 133) → la caja declarada y la pintada difieren en 2 px y el texto se centra en 34.
- `delta/vantare.rs:142-145` y `173-187`: el banner pasa de
  `banner_height + banner_gap` (= 22 + 8 = 30, valor real del catálogo) a `padding_y + 27.0`
  (= 10 + 27 = 37). Ningún valor de `vantare.json` es 27 (la placa son 22+8). Queda como número
  mágico sin fuente declarada; cambia la posición del header 7 px respecto de `nightly` cuando
  hay banner. `height` fijo suma siempre 27 aunque no haya banner (por eso el panel es 27 px más
  corto que la caja cuando no hay bandera) — decisión de "tamaño fijo" que el test
  `approved_delta_has_fixed_size_across_states_and_transparency_round_trips` fija, pero que
  conviene documentar en el código.
- `delta/vantare.rs:638`: el interletrado del valor de la píldora pasa de `0.3` a `0.0` sin
  justificación en el diff (cambia el ancho del número y, con el nuevo ancho ajustado, el tamaño
  final de la píldora).

### B1-P3-03 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

P3 — Ancho de píldora ajustado al contenido con recorte posible

- `delta/vantare.rs:640-644`: el panel de la píldora ahora se dimensiona a
  `2*pad + ancho("DELTA") + 14 + ancho(valor)`, con `.min(self.width)` (=150). Con un texto que
  exceda 150 px (delta de dos dígitos, p. ej. `−12.345`) el panel se recorta al máximo y el texto
  se dibuja fuera del fondo. El texto usado para medir sí coincide con el dibujado ("DELTA"), ✓.

### B1-P3-04 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

P3 — Igualdad de color por `Hsla` (float)

- `delta/vantare.rs:560-567`: la conversión a modo transparente se decide comparando
  `color == self.variant.header_color.hsla()` / `== colors.muted.hsla()`. Es igualdad exacta de
  flotantes sobre una conversión derivada; funciona hoy por ser la misma expresión, pero cualquier
  retoque (o un color intermedio) hace que la sustitución no se aplique en silencio.
  Sería más robusto pasar un rol (`Header`/`Muted`) en lugar del color.

### B1-P3-05 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

P3 — `changed` no refleja la pérdida de la vuelta anterior

- `lap.rs:84-96`: al cambiar de vuelta se puede vaciar `self.previous` (cuando el salto de
  vuelta no es +1) o mover `points` a `previous`, pero `changed` sólo se pone a `true` en el
  bloque de cambio de identidad. Si la muestra siguiente no se acepta (sin delta/progreso),
  la función devuelve `false` y el widget puede quedarse pintando la curva antigua que ya no
  existe. Es un fallo de refresco, no de dato.

### B1-P3-06 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

P3 — Filtro de progreso y detalle menor

- `lap.rs:96-101`: el progreso exige `d <= l`; una muestra con `d` ligeramente mayor que la
  longitud (cruce de meta antes de que suba el contador de vuelta) se descarta y marca `cut`.
  Correcto como protección, pero recorta el final del trazado (conviene saberlo).
- `lap.rs:88-90`: `let Some(_player) = snapshot.state.player else { return changed; };` es un
  no-op (variable ignorada); sobra.

---

### B1-P3-07 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

P3 — Guías y etiquetas ±0,25 desalineadas entre sí

- Escala de datos: `y = 92 − 108·v` con `v` recortado a ±0.5 → +0,25 cae en y≈65 y −0,25 en
  y≈119 (`paint_trace`/`paint_lap`).
- Guías horizontales: `mod.rs:61-71` las dibuja a 25/50/75 % de `GRAPH_HEIGHT` = 120 px →
  y = 62, 92, 122. No coinciden con las posiciones de ±0,25 (65/119) ni con ±0,5 (38/146).
- Etiquetas: `mod.rs:86-115` sitúa «+0.25 pierdes/lost» en 46..58 (centro 52) y
  «−0.25 ganas/gained» en 118..130 (centro 124). Respecto de su línea (65 y 119) quedan a −13 y
  +5 px, y son asimétricas respecto del cero (40 por encima / 32 por debajo). Los signos son
  correctos (positivo = pierdes).

### B1-P3-08 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

P3 — Paleta duplicada a pelo en vez de los tokens del estilo

- `mod.rs:130-137`, `paint_lap` y `paint_trace` usan hexadecimales literales: `0x4ade80`,
  `0xff7a82`, `0x6e6668`, `0x110f10`, `0xffffff`. El estilo ya publica `colors.gain`,
  `colors.loss`, `colors.muted` y el color de variante. Duplicar la fuente de verdad hace que
  el widget no siga un cambio de Look/tema (y es exactamente lo que AGENTS.md prohíbe).

### B1-P3-09 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

P3 — Pie de sectores: 3 fijos, referencia mixta y vacío indistinguible

- `Details.sectors: [Option<f64>; 3]` (`mod.rs:388`) y `for i in 0..3` en `paint`: si la sesión
  publica 2 o 4 sectores, se muestran siempre 3 huecos (sin pánico por el `get`, bien), pero no
  hay ninguna prueba con un número de sectores distinto de 3.
- Con `reference = optimal` el encabezado dice «VS ÓPTIMA» pero el pie compara
  `current_sectors_s − best_sectors_s`, es decir, contra tu mejor sector, no contra la óptima
  (`mod.rs:420-427`). Con `reference = leader` sí se oculta (`car.filter(...)`, `mod.rs:421`),
  lo que muestra que la mezcla es conocida, pero sólo se resolvió para un caso.
- El vacío se pinta con el mismo `"—"` y el mismo gris que «no disponible»: no se distingue
  «sin dato» de «no aplica a esta referencia».

### B1-P3-10 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

P3 — Trazado con ventana degenerada

- `delta_trace/mod.rs:250-300` (`paint_trace`): si todas las muestras comparten `at` (fixtures con
  reloj a cero), `span` = 0,001 (`mod.rs:263`) y todas las x caen en 12 → línea vertical en el
  borde izquierdo, mientras el punto (`round_rect` en x=744, `mod.rs:295`) sigue pintado a la
  derecha, descolgado. La rama se usa cuando `history.points` está vacío (arranque de vuelta o
  pérdida de fuente).

### B1-P3-11 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

P3 — Formato del delta de sector

- `format!("{v:+.3}")` usa guion ASCII, mientras `delta/vantare.rs::signed()` usa menos
  tipográfico U+2212 para el mismo tipo de dato. Inconsistencia entre widgets del mismo lote.

### B1-P3-12 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

P3 — El tinte del panel cubre sólo el 58 % del ancho

- `fastest_lap/mod.rs:412-423`: `crate::efficiency::rect(1.0, 1.0, 280.0, 102.0)` sobre un panel
  de `SIZE = (480.0, 104.0)` (`mod.rs:19`) con elementos hasta x = 467 (fichas) y 464 (etiquetas).
  El alto 102 = 104 − 2 (coherente), el ancho 280 no: o el degradado debe abarcar el panel
  (SIZE.0 − 2) o hay que documentar que es un resplandor intencionado del lado izquierdo. No he
  podido contrastarlo con el catálogo (prohibido abrir fixtures en esta revisión).

### B1-P3-13 — CORREGIDO: se elimina la rama de reloj de longitud 4; el formato ya rellena los minutos.

P3 — Rama muerta en el reloj de sesión

- `fastest_lap/mod.rs:330-343`: `if clock.len() == 4 { format!("0{clock}") }`.
  `domain/src/format.rs::clock` devuelve `mm:ss` (5), `hh:mm:ss` (8) o el marcador de ausencia
  `"—"` (1); nunca 4 caracteres. La rama no se ejecuta jamás y el test
  (`assert d.clock == "08:42")` pasa por el propio `clock()`, no por esta rama.

### B1-P3-14 — CORREGIDO: reloj ausente conserva la vuelta medida, sin sustituirla por un guion.

P3 — El marcador de reloj sustituye al número de vuelta

- `fastest_lap/mod.rs:330-343` + selección del pie (`detail.filter(|d| !d.clock.is_empty())`):
  en una sesión de clasificación con `remaining_s` no disponible el reloj queda `"—"`, que no
  está vacío, así que el widget pinta `—` en el pie en lugar del número de vuelta que sí tendría
  (`timing.laps`). Falta distinguir «reloj ausente» de «reloj presente».

### B1-P3-15 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

P3 — `_offset` ignorado: se pierde el deslizamiento del aviso

- `fastest_lap/mod.rs:388` (`_offset: f32`) y `motion_for` (`mod.rs:268-287`) siguen calculando
  y moviendo `offset = −6 px`, pero el pintor nuevo no lo aplica (el antiguo desplazaba todo el
  panel con `text::with_origin`). El aviso entra sólo con fundido y el `Wake::Frame` sigue
  animando. O se usa el offset o se retira del cálculo.

### B1-P3-16 — PARCIAL: detalles y mejoras con Arc, textos preparados en ingest; fallback de un aviso retenido y clones heredados del VM pendientes.

P3 — Clones y `String` por frame

- `fastest_lap/mod.rs:169`: `self.detail.clone()` se hace **antes** del retorno temprano sin
  aviso (`mod.rs:214-216`), es decir, en cada `frame()` aunque no haya nada que pintar.
- Dentro de `paint`: `format!("{} · {}", timing.driver, d.subtitle)`, `format!("S{}", i + 1)`
  tres veces, `format!("{} {v}", ...)`/`clock.clone()` y `format!("{v:.3}")` → unas 6-7
  asignaciones de `String` por frame. Todo es precalculable en `ingest`.

### B1-P3-17 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

P3 — `is_demo` mete un fixture en el binario de producción

- `fastest_lap/mod.rs:365-378`: `include_str!("../../fixtures/…sequence.json")` **sin `cfg`** →
  31 984 B del fixture embebidos en el binario, y una comparación por igualdad estructural del
  `Snapshot` completo en cada `ingest` sólo para decidir si estamos en el preview del taller.
  Convendría una marca explícita en el origen/foto en lugar de comparar con un fixture, o
  limitarlo a la feature de captura.
- Consecuencia: `fastest_lap/stripes.svg` y `fastest_lap/stopwatch.svg` ya no los referencia
  ningún fichero de `native/ui/src` (se retiraron sus llamadas); quedan como recursos muertos
  (no los borro: fuera de alcance).

### B1-P3-18 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

P3 — Paleta duplicada junto a tokens del kit

- `fastest_lap/mod.rs:407-410, 453, 478, 491, 548-549` usan hexadecimales literales (`0x4ade80`,
  `0xb26bff`, `0x22c55e`, `0xc9c0c2`, `0xfaf7f7`) mientras el mismo fichero sí usa
  `style.class(...)` y `style.colors.*`. Mismo problema que en `delta_trace`:
  fuente de verdad duplicada, el widget no sigue un cambio de Look.

### B1-P3-19 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

P3 — Ficha de sector ausente si el coche del aviso deja de ser candidato

- `fastest_lap/mod.rs:201/242`: `details.iter().find(|d| d.id == timing.car)`; `details()` sólo
  incluye los coches que son candidato/personal del último `project`. Si durante el aviso
  (hasta 6 s) otro piloto bate el récord, el coche del aviso desaparece de `detail` y sus fichas
  pasan a gris en medio de la animación. La mejora (`improvement`) sí sobrevive porque se guarda
  aparte.

---

### B1-P3-20 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

P3 — El indicador de bandera desapareció del panel

- Se retiran `paint_flag`, `polygon` y `clip` (incluidas las bandas diagonales y el damero) y el
  `use ... FlagKind`. Ninguna parte del pintor usa ya `vm.flag`; el único uso de `FlagKind` que
  queda son los tests (`mod.rs:468`, `mod.rs:626`), que comprueban el valor proyectado, no lo
  pintado. Si la bandera pasa a `racing_flags`, conviene dejarlo escrito; si no, es una pérdida
  silenciosa (el dominio sigue calculándola).

### B1-P3-21 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

P3 — El tipo de sesión se deduce del nombre mostrado

- `mod.rs:193-195`: `vm.session.to_lowercase().starts_with("clasi"|"qual"|"pr")` para decidir si
  la línea inferior muestra el reloj (`vm.remaining`) o «V 12/38 · …». Es frágil (depende del
  idioma y del texto de la fuente, y `"pr"` también casaría con «prueba»/«pre-race») y además
  `to_lowercase()` asigna 2-4 `String` por frame. Lo suyo es que domain proyecte el tipo de
  sesión, como ya hace `domain::format::session_kind`.

### B1-P3-22 — PARCIAL: VM y textos retenidos con Arc, vuelta/intervalos preparados en ingest, códigos prestados con Cow; Motion/Card sigue copiando filas, igual que la base.

P3 — `String` y clones por frame

- `mod.rs:355` `driver_code(&card.row.name)` por tarjeta y frame (`String` + `to_uppercase`:
  ~22 asignaciones con 11 coches), `mod.rs:342` `place.to_string()`, `mod.rs:290`
  `format!("{interval:.1}")`, `mod.rs:199-204` `format!("V {}{} · {}", …)` y 3 `to_lowercase()`.
  Todo es función de la fila y podría precalcularse en `ingest` (el módulo ya usa ese patrón para
  `Settings`/`ViewModel`).

### B1-P3-23 — CORREGIDO: código por apellido tras la última inicial; prueba de varias iniciales y Unicode.

P3 — `driver_code` no cubre nombres con varias iniciales

- `mod.rs:409-412` (`driver_code`): `name.split_once(". ")` toma el primer «. », así que «A. B. SMITH» produce
  «B. S» (con punto y espacio dentro de una insignia de 3 caracteres) y «N. de VRIES» produce
  «DE ». Sólo se prueba el caso «A. PIER GUIDI» (`mod.rs:488`).

### B1-P3-24 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

P3 — La caja de intervalo se deduce de texto ya formateado

- `mod.rs:258-310`: `parse::<f32>()` sobre `row.gap` (fila “+0.265”, “LEADER/LÍDER” → 0,0) y
  comparación con la fila siguiente. Consecuencias: el líder de una clasificación publica una
  vuelta («3:27.046», verificado en el test `mod.rs:484`) que no parsea → no hay caja entre P1 y
  P2; la precisión es la del texto mostrado (0,001 s); y no se comprueba si los dos coches están
  en la misma vuelta. El dato vendría más limpio del dominio que de la cadena ya formateada.

### B1-P3-25 — PARCIAL: nueva regresión cruza los bordes reales de las tarjetas con la máscara; las guardas históricas de SIZE siguen siendo solo guardas del catálogo.

P3 — Pruebas tautológicas de tamaño

- `mod.rs:479`, `mod.rs:492`, `mod.rs:655`: `assert_eq!(widget.size(), (1400.0, 56.0))`
  mientras `size()` devuelve la constante `SIZE` (`mod.rs:77-78`): la aserción no puede fallar
  (mismo patrón en `fastest_lap/mod.rs:641`). El valor interesante que sí se comprueba es
  `rows.len() == 11` (`mod.rs:478`).

### B1-P3-26 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

P3 — `Accent::Amber → 0x22c55e` (verde)

- `mod.rs:413-421` (`class_color`): el acento ámbar se pinta verde. Puede ser el color aprobado
  para LMGT3, pero no hay comentario ni referencia; conviene contrastarlo con el catálogo.

---

### B1-P3-27 — CORREGIDO: porcentaje usa el formateador de dominio y su redondeo, incluida la pérdida de integridad de cada neumático.

P3 — Se reimplementa el redondeo de porcentajes del dominio

- `car_damage_visual/mod.rs:26-30` → `format!("{:.0}%", v * 100.0)` frente al del dominio
  (`domain/src/format.rs::percent` + pre-redondeo `(v*100.0).round()/100.0`, documentado como
  «Math.round del renderer productivo redondea .5 hacia arriba» en
  `domain/src/car_damage_visual.rs:64-65` y en `car_damage_numbers.rs:79-81`). Sin el
  pre-redondeo, un valor en empate exacto (p. ej. 0,985) puede salir «98 %» aquí y «99 %» en el
  widget de cifras/producto. **A confirmar** con un caso de empate (no he ejecutado ni compilado
  código en esta revisión); si se confirma, basta reutilizar `format::percent` con el
  pre-redondeo.

### B1-P3-28 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

P3 — Igualdad exacta con 1,0 para decidir «intacto»

- `car_damage_visual/mod.rs:192`: `vm.integrity[1] == Some(1.0)` para pintar el cuerpo en gris
  neutro (cualquier otro valor se tiñe con `tone`). Con una integridad de 0,999 el coche sale
  teñido de verde en lugar de neutro. Mismo patrón en `mod.rs:293`
  (`vm.integrity.iter().all(|v| *v == Some(1.0))` → «Coche intacto»). Es frágil aunque el dominio
  redondee; conviene un margen (≥ 0,999) o un booleano proyectado.

### B1-P3-29 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

P3 — Cuatro valores de neumático sin identificar la rueda

- `car_damage_visual/mod.rs:168-181`: la fila de neumáticos pinta cuatro porcentajes en
  x = 16 + 43j sin ninguna etiqueta (FL/FR/RL/RR) ni orden documentado en la interfaz. El orden
  sólo se deduce del modelo (`tyres: [Option<f64>; 4]`).

### B3-01 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

relative/mod.rs



### B3-02 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

relative/mod.rs



### B3-03 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

relative/vantare.rs

No es un dato falso, pero reserva una caja visiblemente más alta que el panel en los casos sin banner; conviene confirmar que el hueco transparente extra es aceptable para el usuario.

### B3-04 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

relative/vantare.rs



### B3-05 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

relative/vantare.rs



### B3-06 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

relative/vantare.rs



### B3-07 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

vantare/paint.rs



### B3-08 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

vantare/paint.rs



### B3-09 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

standings/mod.rs



### B3-09b — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

standings/mod.rs



### B3-11 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

standings/vantare.rs



### B3-12 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

standings/vantare.rs



### B3-13 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

standings/vantare.rs



### B3-32 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

standings/vantare.rs



### B3-15 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

standings/vantare.rs



### B3-16 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

standings/vantare.rs

Verificado correcto: `numeric_sectors` calcula el ancho `3·col_gap + 2·cell_gap = 164 px` y el pintado coloca cada sector con la misma aritmética (`column.x + col_gap + i·(col_gap+cell_gap)`), de modo que cabecera y valor coinciden; `"1:12.118"` (8 car.) a `mono_small = 11` ≈ 54 px < 62 px de `col_gap`, no se sale. `same_board` incorpora `laps`, `in_pits`, `classification_gap(_s)` y `best_sector_times_s`, y `session` ya estaba, así que el cambio de sesión invalida la caché. El atenuado `missing` distingue coches sin vuelta. El `Plan` se recalcula solo en `ingest_shared` cuando `same_board` es falso (no por frame), así que los `Vec<String>` de `gaps`/`sector_times` no son coste por frame.

### B3-18 — CORREGIDO: Arc de las tres etiquetas, sin clonar sus String en frame.

track_map/mod.rs



### B3-19 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

track_map/mod.rs



### B3-20 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

track_map/mod.rs



### B3-21 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

track_map/mod.rs



### B3-23 — CORREGIDO: se retira la rama de reloj de longitud 4, imposible con el formateador.

track_weather/mod.rs



### B3-24 — CORREGIDO: Arc del texto de sesión, sin clonar el String en frame.

track_weather/mod.rs



### B3-25 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

track_weather/mod.rs



### B3-26 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

track_weather/mod.rs



### B3-27 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

track_weather/mod.rs



### B3-29 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

bin/vantare-workshop.rs

Nota: `VANTARE_CAPTURE_SETTINGS` espera el **JSON etiquetado** de `vantare_ui::Settings` (enum con variante de tipo), no el objeto de ajustes suelto; un JSON por tipo daría error de parseo. Cosmético/documentación.

### B3-30 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

styles/vantare.json



### B3-31 — PENDIENTE / anotado para ronda 2; sin cambio en esta tanda.

styles/vantare.json

---

