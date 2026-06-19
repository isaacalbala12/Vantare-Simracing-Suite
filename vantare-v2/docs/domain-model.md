# Modelo de dominio

Este documento fija nombres canonicos para evitar que los agentes usen terminos distintos para lo mismo.

## Conceptos principales

## Perfil

Configuracion completa de un overlay. Normalmente vive como JSON en `configs/` o se gestiona desde el Hub.

Incluye:

- identificador,
- modo de display,
- monitor,
- lista de widgets,
- posiciones y propiedades.

## Widget

Elemento visual individual dentro de un overlay.

Ejemplos actuales:

- `standings`
- `relative`
- `delta`
- `telemetry`
- `telemetry-vertical`
- `pedals`

## Configuracion de widget

Propiedades de aspecto o comportamiento de un widget.

Ejemplos:

- visible/enabled,
- nombre,
- frecuencia/updateHz,
- estilo visual,
- opciones especificas del widget.

No incluye posicion/tamano si estamos en la vista `Widgets` de Overlays Studio.

## Layout / colocacion

Parte del perfil que decide donde vive cada widget:

- posicion X/Y,
- ancho/alto,
- orden/capa si aplica,
- activacion dentro de un perfil concreto.

Esto pertenece a `Perfiles especificos`.

## Overlays Studio

Nueva zona del Hub que unifica los flujos antiguos de overlays/perfiles/preview.

Contiene:

- `Mis perfiles > Widgets`,
- `Mis perfiles > Perfiles especificos`,
- `Recomendados por Vantare`,
- `Comunidad`.

## Recomendados por Vantare

Perfiles/presets locales propuestos por la app. Son read-only hasta que el usuario los guarde como perfil propio.

## Comunidad

Seccion futura. Por ahora debe mostrarse como `Proximamente`.

## Telemetria

Datos recibidos desde LMU, normalizados por Go y usados para renderizar widgets.

## LMU

Le Mans Ultimate. Fuente principal actual de telemetria.

## Terminos a evitar

- No usar `Preview` como nombre de producto visible para la nueva experiencia.
- No llamar `widget layout` a settings de aspecto si puede confundir con posicion.
- No usar `profile editor` sin aclarar si edita widgets o colocacion.

## Regla de separacion

Si el usuario cambia color, texto, visibilidad o comportamiento: `Widgets`.

Si el usuario mueve, redimensiona o coloca elementos: `Perfiles especificos`.
