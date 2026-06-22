# Feature Architecture Map

Mapa de arquitectura para implementar features sin mezclar responsabilidades.

## Principio central

La app separa configuracion interna de widgets y layout global.

- `WidgetStudio`: que muestra un widget y como lo muestra.
- `LayoutStudio`: donde esta el widget y que tamano externo tiene.
- Overlay runtime: render final para desktop/OBS.
- Profile services: persistencia de perfiles, layouts y variantes.

## Overlays Studio

Responsabilidad:

- flujo principal de edicion;
- navegacion entre widgets, perfiles, recomendados y layout;
- experiencia de usuario.

Puede cambiar en el rework UI:

- jerarquia visual;
- paneles;
- densidad;
- legibilidad;
- estructura de secciones;
- look and feel inspirado en el HTML de referencia del usuario.

No debe cambiar sin plan separado:

- formato de perfil;
- responsabilidades de `WidgetStudio`/`LayoutStudio`;
- arquitectura de telemetria;
- dependencias UI.

## WidgetStudio

Responsabilidad:

- apariencia interna;
- columnas;
- metricas;
- filtros;
- formatos;
- variantes;
- preview aislada.

No puede:

- editar X/Y/W/H;
- borrar widgets;
- abrir/detener overlay;
- mutar layout global.

Features previstas:

- `Relative` configurable: cerrado funcionalmente.
- `Standings` configurable: siguiente widget core.
- `Pedals` beta v1: beta testers.

## LayoutStudio

Responsabilidad:

- mover widgets;
- redimensionar widgets;
- activar/desactivar instancia si aplica;
- abrir/detener overlay del perfil activo;
- guardar layout.

No puede:

- editar columnas;
- editar metricas;
- editar filtros;
- editar formatos internos;
- editar temas internos de widget.

Alpha privada bloquea si:

- drag & drop no funciona;
- resize no funciona;
- guardar/reabrir pierde posiciones;
- los cambios de layout mutan variantes.

## Profile schema

Responsabilidad:

- guardar layouts;
- guardar variantes;
- mantener compatibilidad legacy;
- evitar migraciones silenciosas.

Reglas:

- `layouts.general.widgets` es layout obligatorio en schema v2.
- `widgets` puede existir como espejo de compatibilidad.
- `variantId` conecta instancia con variante.
- una variante no guarda posicion/tamano global.
- no cambiar schema sin miniplan propio.

## Widget preview architecture

Responsabilidad:

- render aislado en `WidgetStudio`;
- escala visual;
- no usar chrome de layout;
- no respetar X/Y global en preview aislada.

Componentes actuales:

- `WidgetRenderer`;
- `PreviewScaler`;
- `WidgetSandboxPreview`;
- `PreviewWidgetFrame` reservado para layout/profile previews.

Reglas:

- no reintroducir `PreviewWidgetFrame` en `WidgetPreviewPanel`;
- no usar offsets magicos para centrar previews;
- no forzar `position.w/h` como minimo visual en widgets compactos;
- consultar `docs/widget-preview-bug-log.md` antes de tocar preview.

## Relative

Estado:

- primer widget configurable validado.

Responsabilidad del corte actual:

- columnas opcionales;
- formatos;
- filtros;
- ancho intrinseco;
- persistencia;
- preview/desktop/OBS.

No seguir expandiendo salvo:

- bugs;
- hardening;
- decisiones especificas del usuario.

## Standings

Estado:

- siguiente widget core.

Debe cubrir:

- todas las features del documento original aplicables a standings/relative;
- excepto multiclase en primera fase.

Incluye:

- columnas configurables;
- filtros no multiclase;
- formato de nombre;
- nombre on/off;
- categoria;
- numero;
- vuelta actual;
- nacionalidad si esta disponible;
- posiciones ganadas/perdidas si los datos son fiables o marcado como no stable;
- vuelta rapida;
- ultima vuelta;
- delta laptime si disponible;
- neumaticos si dato fiable;
- offtracks si dato fiable;
- intervalo;
- distancia;
- velocidad maxima si dato fiable;
- tiempo relativo;
- energia virtual si dato fiable;
- highlight del jugador;
- colores/formato/ancho/alineacion cuando aplique.

Fuera del primer cierre:

- multiclase;
- ultimas 5/10 vueltas;
- logos de marca;
- pit history;
- race briefing;
- reordenacion de columnas para usuarios normales.

## Pedals

Estado:

- beta testers.

Alcance:

- throttle;
- brake;
- clutch;
- diseno nuevo mas pequeno;
- configuracion visual basica.

Fuera:

- steering;
- telemetria avanzada;
- editor libre;
- templates multiples.

## OBS

Beta testers:

- OBS local sencillo:
  - URL;
  - copiar URL;
  - instrucciones.

Futuro:

- OBS por LAN/doble PC;
- companion app para PC de streaming.

No mezclar companion app con beta testers.

## Payments

Beta publica de pago:

- Stripe o checkout externo.

No construir billing complejo antes de validar beta privada.

Opciones de acceso:

- licencia/key;
- cuenta simple;
- acceso por build controlado.

Decision pendiente para `0.6.X.X`.

## Multisimulador

Estado:

- futuro, no antes de cerrar LMU.

Arquitectura prevista:

- `SimAdapter`;
- LMU adapter;
- iRacing adapter;
- Assetto Corsa adapter;
- normalizacion de datos.

No iniciar implementacion salvo investigacion aislada aprobada.
