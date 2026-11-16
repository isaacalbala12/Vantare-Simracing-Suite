# Standings Eficiencia — port literal GPUI

E1 porta configuración, geometría y defaults compilados. El registro se conecta
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
