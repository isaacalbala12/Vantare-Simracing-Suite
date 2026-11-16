# Standings Eficiencia — port literal GPUI

E1 porta configuración, geometría y defaults compilados; E2 añade panel y cabecera.
E3 conecta th/filas/celdas y el constructor Eficiencia. Se retira el allow(dead_code)
del módulo. E4 completa bandas, pies, rail PIT y ausencia, y retira las marcas puntuales.
La excepción de la raíz excluye tests del tope de 1200 líneas de producción.
Se medirá cada corte consecutivo y se unirá si ambos caben completos bajo el tope.

| GPUI | Rune E1 |
| --- | --- |
| model::{Metric,Preset,Align,NameMode,Column,InfoMetric} | model.rs, mismos tipos y alternativas |
| Config::{reference,fit,footer_height} | Mismos mínimos, cabeceras, filas reservadas y pie |
| SettingsPresentation::config | Config::from_settings, misma conversión y defaults |
| options::ColumnPresentation::column | options.rs, mismas claves y alias V3 |
| column_width{,_for}, identity_span | Signature/Broadcast, presets y nombres literales |
| labels, Labels::{metric,info} | Rótulos ES/EN sin reescritura |
| model::plan | Cabecera integrada/externa, filas visibles, bandas y columnas |
| eficiencia::Visual::{new,ingest,set_study,set_style,size} | mod.rs; canales de movimiento en motion.rs (E5) |
| style::{Style,Colors,Geometry,Fonts,Shadow,Opacity,Color} | Defaults de ui/styles/standings.json |
| efficiency::tokens y footer_rows | crate::eficiencia: tokens existentes, LOSS y cálculo literal de pies |

ContentPlan es el mismo alias a domain::standings::Plan que usa GPUI. La geometría
de model::plan se copia porque el Plan de domain no la contiene. E1 no introduce
Snapshot ni sequence en la proyección: sus pruebas usan las fixtures DTO de GPUI.
La reutilización de ContentPlan incluye same_visible, que ignora su contador.

Oráculos: columnas 30/30/200/92/88, ancho 440, altura 364, cabecera integrada 43;
Broadcast 460 y 392 con cabeceras 46/24. Marcas/pies sin cabecera y modos de nombre.
PIT suma 34 al ancho solo si está habilitado: 440→474, con la misma altura.
Se fijan también sus tokens: alto 26, radio 3, brillo CSS 8 al 22 %.
El pintado posterior conserva esquinas [0,3,3,0], bordes 2/2/2/1 y dx −5→0;
las pruebas de pin/assert_inside_window acompañan al pintor cuando entra.

Se conserva el cálculo de GPUI para multiclase y footer-slots, incluida su reserva
fija: config.fit usa footer_height del estilo; model::plan descuenta el pie calculado.
No se modifica ese comportamiento. Sin globals de estado: Style::compiled devuelve
un Arc local con los defaults; fuentes, panel y marco se reutilizan de crate::eficiencia.
Comparación de píxeles en el PC de juego; verificación de E1 CPU, sin gráficos.

## Adaptaciones deliberadas de E1

1. Visual::new omite prefs: GPUI lo recibe sin usarlo; los datos ya vienen localizados.
2. E1 no reexporta Row/SelectedRow, aún sin consumidor. E3 reexporta SelectedRow
   como Row para paint_row/paint_cell, con el mismo tipo de domain que usa GPUI.
3. Config::from_settings vive en model.rs en lugar del SettingsPresentation::config
   de mod.rs; la conversión mantiene las mismas ramas y valores.
4. Los defaults del JSON están expresados como literales Rust, en lugar del archivo
   de OUT_DIR y la edición/serialización serde de Workshop. Un test fija TODOS los
   campos con literales copiados de ui/styles/standings.json, sin otra dependencia.
5. Style::compiled devuelve un Arc local en lugar del OnceLock de GPUI; así el
   widget no introduce un caché global. Los valores compilados son los mismos.
6. Visual en E1 solo mantenía geometría y contenido; E5 añade su Frame y Motion local.
   No se copian las ramas de instrumentación paint-stats/parity-capture de GPUI.

Revisión E1: PIT mediante columnas reales (474 y reparto estrecho [156,82]);
seis slots y pie 15+filas·14, helper antes de tests y etiquetas restantes ES/EN.

## E2: panel y cabecera

| GPUI view.rs | Rune E2 |
| --- | --- |
| col / efficiency::rect | crate::eficiencia::color y render::rect; bordes CSS half-up |
| flag_rgb / clip_half_plane / paint_polygon / paint_flag_ribbon | render.rs; mismas bandas 131°, Signature/Broadcast y opacidades |
| paint (panel, brand_band, marco) | crate::eficiencia::panel/outline y render::view; grados convertidos a radianes |
| paint_session_header | render::session_header; marca, contexto, Stale, Focus y chip literales |
| shadow_strip / paint_shadow_strip | assets.rs; misma cola gaussiana de 34 px, caché local del widget |
| logo_24 / paint_logo_size | tools/standings_logo.py, logo-24.rgba y Assets; imagen por widget |
| efficiency/text::{ink,width,fit,baseline,draw} | crate::eficiencia; Inter estática, tnum/kern y tracking tras el último carácter |

El logo se reduce por área premultiplicada antes de entregarlo a Rune. Se verificó
contra el bucle f32 original de GPUI: los 2304 bytes RGBA coinciden exactamente.
El generador solo necesita Pillow para decodificar el PNG fuente; --check detecta
un recurso desactualizado. No hay dependencia PNG nueva ni generación por frame.
Assets se refresca al adjuntar imágenes/cambiar geometría o estilo, no en view.
capture_images conserva solo logo/sombra usados por la vista, para la captura real.

Tests de cabecera: baselines, tamaños/posiciones, colores, marca oculta/banda,
Stale ES/EN, Focus, paleta completa, bandas Signature/Broadcast y cola gaussiana.
Todas las capas superpuestas llevan pin; assert_inside_window recorre ambas
geometrías con Ready/Stale/Missing/Disconnected e imágenes adjuntas.
E2 continúa sin constructor. E3 completa th/filas/celdas/control y lo registra;
E4 incorpora separadores, pies, ausencia y badges. E5/E6 conservan su corte de movimiento
y efectos. E2+E3 preparados en local superan 1200 líneas de producción formateada;
no se comprime el port para unirlos.

## Seguimiento de E2 en el primer commit de E3

Panel y marco leen color/alfa/radio/blanco de Style mediante los helpers de
crate::eficiencia; no se añade una séptima adaptación por constantes compiladas.
Los tests fijan los vértices Signature 440×50 resolviendo a mano los semiplanos
de view.rs, y leen dirección/paradas de degradado de las instancias CPU públicas
de Rune: panel 120° [0,.38], Broadcast 110° [.55,1], chip 145° [0,1].
Las muestras de sombra son regresión de la copia Rune, no píxeles obtenidos de
GPUI. Los parámetros sí están copiados literalmente de view::shadow_strip.

Rasterizado: GPUI usa PathBuilder y Rune Shape para los mismos polígonos de la
cinta. El antialias lo realiza cada motor; la comparación física de píxeles sigue
pendiente. El logo reducido a 24×24 tiene bytes RGBA idénticos; la banda lo pinta
a 18×18. El escalado de textura/mips lo realiza Rune, frente a paint_image de
GPUI: se declara esta diferencia de rasterizador, pendiente de captura comparada.
La primera rect de la banda tiene key; con clase vacía se conserva la caja del
chip pero no se emite texto vacío (text::draw de GPUI tampoco pinta glifos).
E4 porta paint_unavailable: cabecera y rótulo gold de desconexión/falta de datos,
sin tabla, como GPUI.
Todos los colores nuevos pasan por eficiencia::color o rune::color::hex.

## E3: th, filas, celdas y control

| GPUI | Rune E3 |
| --- | --- |
| paint_table (th/filas) | table::paint; bandas de E4, ghosts y FLIP de E5 |
| paint_column_label / aligned_x | table.rs; Signature/Broadcast, alineación, máscara y subrayado |
| paint_row | table::paint_row; jugador, primeras filas de estudio default, filetes y marca roja |
| paint_cell / split_seconds | table.rs; todas las métricas, nombre/ellipsis y unidad s separada |
| Widget::{ingest_using,present,switch_session} | control.rs; project_cached y pestañas, sin gate por sequence |
| app::{project_snapshot,wanted_size} | control.rs; retención de pausa y banda de 22 px |
| eficiencia::Visual::frame | Visual::view con Frame puro de Motion; reducido usa Frame final sin reloj |

Cada fila y celda tiene contenedor con pin y key propia; no hay claves duplicadas
entre métricas repetidas. size_for anticipa foto/pestaña/bandas/PIT antes del recorte
del host; size conserva la caja de la proyección retenida durante la pausa.
La identidad es session:epoch, como GPUI. sequence solo viaja como metadato del
ContentPlan para E5/E6: no se usa como clave ni para saltarse la proyección o pintar.
Board por Arc o ContentPlan::same_visible decide si cambia la escena; Lost/Stale
con el mismo contador repintan; avanzar solo el contador no despierta el widget.

Oráculos de celdas: baselines 43+21/43+19, marca 3/48/2/20, columnas lg
42/42/200/98/88/88/60/88/66, posición/número centrados en 21/63 y gap en 333;
texto/nombres ES/EN, elipsis solo donde GPUI, cápsulas Broadcast 145° [0,.65].
Los colores se comparan con hex sRGB literal. Tras #2496 (c58a05690), el dorsal
es #a5a5abff, no el #d2d2d6ff que producía el helper anterior: el oráculo no cambia.
Sin reloj de animación en E3, con o sin movimiento reducido. E5 conecta Tween compartido.
E4 retira las marcas dead_code puntuales al portar pies/bandas/ausencia/rail;
E6 añade flash/chip/barrido/batalla/rombo y animación de boxes. No promover a
testers hasta completar E5/E6 y la comparación física de píxeles pendiente.

## Revisión E3 en el mismo PR

La pausa usa app.rs:559: texto en x=8 y base alto+16 (size.1−6), 11/600/tracking
0,02; fondo #101113 a 0,95 y banda [0,alto,ancho+rail,22]. Se corrige la base 15.
switch_session descarta el contenido anterior por ContentPlan::unavailable,
recalcula el plan y borra Board, como standings/mod.rs:303–314. La regresión
reingesta el MISMO Arc de Board en dos pestañas multiclase con columnas distintas:
6 filas y row_tops [28,58,116,146,204,234], con tres bandas, tras el reinicio.
content() reutiliza super::content de Vantare: misma derivación de lap/interval,
formatos, clases y pies que SettingsPresentation::content de GPUI. La conversión
efectiva de columnas/geometry sigue siendo Config::from_settings de Eficiencia.
La máscara de paint_column_label solo se aplica en Signature; Broadcast retorna
antes de with_content_mask en GPUI y se conserva sin esa máscara en Rune.
El catálogo prueba todos los Kind×Look: ya no queda un Settings válido sin
constructor que llegue a `_ => None`; el test documenta ese límite y conserva
la ausencia de adquisición para un layout vacío.

## E4: bandas, pies, rail y ausencia

| GPUI | Rune E4 |
| --- | --- |
| Config::{fit,footer_height}, eficiencia::Visual::{ingest,size} | Port existente conservado; tests 252/274, +84 y reserva43 |
| efficiency::footer_rows | Helper existente; 9 celdas AAA/000→2, 6 celdas→1 |
| paint_table, bandas (view.rs:465–507) | table::paint; color por clase, bandas28, dos filetes, tick y texto9 |
| paint_footer (view.rs:1433–1533) | render::paint_footer; misma selección slots/clásico y centrado |
| paint_styled_info_cells (view.rs:1534–1660) | render::paint_styled_info_cells; fuente/colores/reflow/atenuación stale literales |
| paint_unavailable (view.rs:1662–1694) | render::paint_unavailable; etiquetas ES/EN gold, sin tabla |
| paint_pit_rail (view.rs:1696–1788) | render::paint_pit_rail; caja34×26, bordes2/2/2/1, radios0/3/3/0, glow4/22% |

Orden conservado: sombra exterior, panel/marca/cinta, tabla o ausencia, pie,
marco y rail PIT. Las capas tienen pin y claves propias. El preview Rune escala
el árbol del host: la pintura de producto corresponde a unit=1/layout_width=width.
E4 pinta el estado final PIT (alfa1, dx0) solo para filas in_pits; E5/E6 conectan
los canales animados y ghosts. No se añade ningún reloj ni gate por sequence.

La matriz normal conserva assert_inside_window sin modificarlo para
Signature/Broadcast, multiclase, pie ausente/clásico/slots, PIT, ausencia y pausa.
El único cruce separado es Signature con 7 filas sin pie a capacidad (Live/Stale):
GPUI reserva42 pero pinta cabecera43. La última fila va de223 a253 en ventana252;
el host recorta1 px. Con tres bandas se suman84 a ambos bordes. Un test propio
mantiene la geometría completa y verifica 30 px de fila, 29 visibles y 1 recortado
mediante el mismo clip por widget que renderer.rs:268–279. No cambia el helper.

## Erratas numéricas del plan/inventario E4 corregidas contra GPUI

- Plan inicial decía 7 filas sin pie=274; GPUI da252, y274 con pie22, en model.rs:199–205.
- Inventario decía banda con texto8; GPUI usa badge_size9 en view.rs:501 y styles/standings.json:69.
- Inventario decía slots #a7a9b0/#e8e8ed; GPUI usa muted #b9b9bd/ink #f5f5f5 en view.rs:1646/1652. Los primeros colores corresponden al pie clásico.
- Inventario decía badge en table_top+42; GPUI usa ese origen más (30−26)/2=2: primera caja en44, en view.rs:1707/1722. En Broadcast la cabecera declarada es24.
- Inventario decía línea de slots14; GPUI avanza value_size+4=15 a ancho440/unit1 en view.rs:1639.
- Inventario decía etiqueta de slots9; GPUI calcula clamp(width·0,02,7,9)=8,8 a ancho440, antes del factor, en view.rs:1558–1562.
- Plan decía valor clásico sin datos «-»; GPUI pinta «—» en view.rs:1502.
- La fórmula simplificada sumaba el pie calculado al alto: GPUI fit conserva footer_height del estilo22; con 7 filas/slots de reserva43 el alto sigue274, no295, en model.rs:199–205. footer_height() calcula la reserva aparte.
- La comprobación global de cajas no contemplaba el recorte1 px sin pie: GPUI da head_row43 en model.rs:486–490 y última fila253 en view.rs:463/522–525, con ventana252 (app.rs:303–313,575–578). Decisión del orquestador: test literal aparte.

## E5: FLIP, presencia y reloj finito

| GPUI | Rune E5 |
| --- | --- |
| motion_continues (motion.rs:235–241) | motion::motion_continues, misma identidad/etiqueta/Ready y sequence >= anterior |
| Motion::update, presencia y FLIP (509–587) | motion::Motion::update; estado final de boxes conservado en presencia |
| seed (693–701), frame_shared (710–724) | semilla sin animar, Frame quieto compartido por Arc |
| frame, ghosts (727–797) | Frame::row devuelve Pose por identidad; Ghost guarda Row/top/alfa |
| wake (804–830), parte FLIP/fade/exit | Wake::Frame mientras dura un canal; Idle al terminar; efectos/avisos pendientes E6 |
| eficiencia::Visual::frame (104–133) | controlador sample/animate/schedule; reducido usa Frame final y ningún reloj |
| view::paint_table y paint_row (508–525,983–986) | fantasmas antes de presencias; top y alfa vivos, cada capa con pin |
| view::paint_pit_rail (1776–1786) | rail acompaña filas y fantasmas; multiplica alfa de presencia; canal PIT en E6 |

FLIP usa [0,22;0,9;0,3;1], umbral0,5 y duración entera
min(280+abs(from)·1,1,460) ms: 30 px→313 ms, 400 px→460 ms.
Entrada/salida usa 200 ms EASE_OUT [0;0;0,58;1]. Se reutiliza Tween compartido:
el test numérico contrasta las tres curvas con la bisección GPUI de30 iteraciones
(tolerancia2e−6). Retarget y reentrada parten del valor vivo, sin salto.
Sequence solo participa en la continuidad de GPUI; no cambia la proyección,
el cache de Board ni la comparación estructural de Frame para repintar.
Con foto atrasada y contenido distinto se rompe continuidad y se resiembra sin
animar, como motion.rs:509–531. Una foto idéntica/solo metadatos no llega a
Motion::update: Visual::ingest conserva same_visible, como eficiencia.rs:50–70.
Sin canales, Frame no recorre las presencias; el reposo reutiliza el mismo Arc.
Los tests usan Runtime CPU, pin y assert_inside_window durante FLIP/ghosts;
el reloj acaba exactamente al final de sus canales y reducido nunca lo arma.
No se modifica Motion de Vantare ni sus tests. E6 sigue pendiente (efectos y PIT).
La entrada de handoff de E5 se entrega en el cuerpo del futuro PR, por orden de Isaac.

## Erratas numéricas del plan/inventario E5

- Inventario decía FLIP(0,5)≈0,93; GPUI da0,94859246 con [0,22;0,9;0,3;1] y la bisección de motion.rs:27–53.
