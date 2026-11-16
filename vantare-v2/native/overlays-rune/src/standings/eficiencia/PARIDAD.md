# Standings Eficiencia — port literal GPUI

E1 porta configuración, geometría y defaults compilados; E2 añade panel y cabecera.
El registro se conecta
en E3, al entrar filas/celdas; el allow(dead_code) temporal apunta a ese corte.
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
| eficiencia::Visual::{new,ingest,set_study,set_style,size} | mod.rs; canales de movimiento en E5 |
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
2. E1 no reexporta Row/SelectedRow, aún sin consumidor. E3 lo reexportará al portar
   paint_row/paint_cell, con el mismo tipo de domain que usa GPUI.
3. Config::from_settings vive en model.rs en lugar del SettingsPresentation::config
   de mod.rs; la conversión mantiene las mismas ramas y valores.
4. Los defaults del JSON están expresados como literales Rust, en lugar del archivo
   de OUT_DIR y la edición/serialización serde de Workshop. Un test fija TODOS los
   campos con literales copiados de ui/styles/standings.json, sin otra dependencia.
5. Style::compiled devuelve un Arc local en lugar del OnceLock de GPUI; así el
   widget no introduce un caché global. Los valores compilados son los mismos.
6. Visual en E1 solo mantiene geometría y contenido: los canales Motion llegan en E5.
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
E4 añade separadores, pies, espera y badges. E5/E6 conservan su corte de movimiento
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
paint_unavailable queda explícitamente PENDIENTE de E4: E3 aún solo pinta la
cabecera en esa rama, sin el rótulo de desconexión/falta de datos de GPUI.
Todos los colores nuevos pasan por eficiencia::color o rune::color::hex.
