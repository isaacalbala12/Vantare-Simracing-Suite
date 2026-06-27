# Feature Architecture Map

Mapa de arquitectura para implementar features sin mezclar responsabilidades.

> Actualizacion 2026-06-26: para el release oficial, este mapa debe leerse junto a `docs/release-roadmap-execution-index.md`. Pagos/licencias, autoupdater, iRacing, Assetto Corsa, Assetto Corsa Lua/CSP Pack, OBS LAN, calendario LMU, onboarding, i18n, Track Map e Input Telemetry/Trace son scope de release, no futuribles.

## Principio central

La app separa configuracion interna de widgets y layout global.

- `WidgetStudio`: que muestra un widget y como lo muestra.
- `LayoutStudio`: donde esta el widget y que tamano externo tiene.
- Overlay runtime: render final para desktop/OBS.
- Profile services: persistencia de perfiles, layouts y variantes.
- Ingeniero: modulo interno de suite que calcula y emite notificaciones de carrera.

## Vantare Suite

Vantare contiene varios modulos internos bajo un mismo Hub:

- `Overlays Studio`: configuracion, perfiles, widgets, layouts y runtime visual.
- `Ingeniero`: spotter/ingeniero, historial, notification bus y widget de mensajes.
- `Telemetria`: fuente compartida para overlays e Ingeniero.
- `Setup`: configuracion local.

Regla: compartir infraestructura no permite mezclar responsabilidades. Un widget puede mostrar informacion de Ingeniero, pero no debe calcular decisiones de ingeniero.

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
- presets de widget;
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
- `Widget Preset Gallery`: beta privada de testers.

## Widget Presets

Responsabilidad:

- Permitir guardar y reutilizar la configuración interna (apariencia y comportamiento) de un único tipo de widget de forma independiente.
- Seleccionar y aplicar presets guardados a cualquier instancia del mismo tipo de widget dentro de cualquier perfil.

Qué debe guardar un preset (apariencia/configuración interna):
- Identificadores y metadatos: `id`, `name`, `widgetType` y descripción opcional.
- Estilos y apariencia (`appearance`): colores, fuentes, opacidades, bordes y fondos (transparentes o personalizados).
- Variantes y configuraciones específicas según el tipo de widget:
  - Columnas habilitadas, su orden de visualización, anchos (`width`), alineación y estilos de celda.
  - Filtros aplicados (ej. `rangeAhead`, `rangeBehind`, filtros de clase o visibilidad del jugador).
  - Formatos de datos (nombres recortados/completos, formatos de tiempo, decimales).
  - Props internas y comportamientos propios del widget.

Qué NO debe guardar (Límites de layout/runtime):
- Posición física del widget en el lienzo (`position.x`, `position.y`).
- Tamaño físico externo del widget (`position.w`, `position.h`).
- Estado de habilitación del widget (`enabled`).
- Estructura del layout global ni perfiles de overlay completos.
- Datos mock, telemetría o estado de ejecución en runtime.

Relación con otros elementos:
- **No reemplaza a los perfiles recomendados**: Un perfil recomendado es un overlay completo con múltiples widgets posicionados y preconfigurados. Un preset es atómico, específico de un único tipo de widget y reutilizable entre perfiles.
- **Ámbito de control**: La creación, edición y selección de presets es responsabilidad exclusiva de `WidgetStudio` (gestión de la apariencia/datos). `LayoutStudio` no tiene conocimiento de presets, respetando la estricta separación de responsabilidades.

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

## Ingeniero

Estado:

- modulo inicial integrado como parte intrinseca de la app;
- EN0-EN5 implementado y aceptado con P3 no bloqueantes;
- live LMU real queda pendiente de EN6.

Responsabilidad:

- core determinista Go bajo `internal/engineer`;
- servicio de lifecycle, simulator/replay y notification store;
- pagina `Ingeniero` en el Hub;
- bus de notificaciones para Wails y OBS;
- widget `engineer-notifications` en overlays.

No puede:

- editar posicion/tamano de widgets;
- editar columnas, filtros o formatos de otros widgets;
- guardar configuracion dentro de perfiles de overlay sin plan aprobado;
- abrir un segundo reader LMU;
- poner logica de carrera en React o en el widget visual.

EN6 previsto:

- adaptar Ingeniero a LMU live reutilizando el buffer/fuente actual de overlays;
- parser paralelo de geometria en `internal/engineer/lmu`;
- adapter Go hacia `EngineerService`;
- sin tocar `pkg/models.Telemetry` salvo decision explicita.

## OBS

Beta testers:

- OBS local sencillo:
  - URL;
  - copiar URL;
  - instrucciones.
- `engineer-notifications` consume `/engineer/stream` para OBS.

Release:

- OBS por LAN/doble PC;
- preview/URL guiada tipo OBS;
- hardening del servidor local y de streams SSE;
- documentacion de setup local y LAN.

Post-release:

- companion app para PC de streaming.

No mezclar companion app con beta testers.

## Payments

Release:

- Stripe directo como proveedor de pago.
- Supabase para auth/cuenta.
- Login obligatorio.
- Email/password, Google y Discord si es viable.
- Licencia online obligatoria.
- Gracia corta de 24h con aviso.
- Un PC activo por licencia.
- Reset de PC desde portal web si es viable; fallback desde app/backend.
- Roles Discord automaticos por tier.

No construir integraciones de pago sin plan de seguridad, manejo de errores, webhooks idempotentes y review GLM.

Opciones de acceso:

- `Overlays`: 5 EUR/mes.
- `Engineer`: 5 EUR/mes.
- Bundle: 8.99 EUR/mes.
- Assetto Corsa Lua/CSP Overlay Pack: 20 EUR pago unico.
- Tiers beta inicial de 6 meses gestionados por Stripe y beneficios/roles.

La web publica la gestiona Isaac, pero la app/backend deben tener contratos claros para login, licencia, entitlement, device binding y revocation.

## Multisimulador

Estado:

- scope de release.
- Assetto Corsa primero.
- iRacing en paralelo cuando el adapter contract y la matriz de datos esten cerrados.

Arquitectura prevista:

- `SimAdapter`;
- LMU adapter;
- iRacing adapter;
- Assetto Corsa adapter;
- normalizacion de datos.

Reglas:

- todo campo debe mapearse a `stable`, `tester` o `experimental`;
- no marcar un dato como `stable` sin fixture real o validacion live;
- cada adapter debe incluir tests de parsing, normalizacion y fallback;
- no duplicar readers si puede reutilizarse la fuente/buffer actual.

## Assetto Corsa Lua/CSP Pack

Producto separado:

- pack nativo Lua/CSP comprable por pago unico;
- puede incluirse como beneficio para Founder/Pro Founder/Visionary mientras sigan suscritos;
- no depende del runtime principal de Vantare;
- debe compartir lenguaje visual, nomenclatura y preset logic con Vantare Overlays Studio cuando sea viable.

No mezclarlo con el adapter Assetto Corsa de la app principal: son dos vias de producto diferentes.
