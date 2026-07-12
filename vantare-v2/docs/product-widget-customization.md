# Product Widget Customization

Documento de producto para definir que experiencia queremos ofrecer con la personalizacion de widgets en Vantare.

Este documento no es un spec tecnico ni un roadmap. El spec tecnico para workers vive en `docs/beta-widget-system-spec.md`.

## Vision

Vantare debe permitir que un usuario cree overlays utiles, limpios y personalizados sin tener que construir una interfaz desde cero.

La beta se gestiona internamente como beta de Vantare Overlays Studio. Si hace falta un nombre corto para comunicacion interna o testers, puede usarse `VOS Beta`.

La beta esta pensada para usuarios externos con testers especificos, no solo para uso interno.

El objetivo de beta no es activar monetizacion real dentro de la app, sino preparar un producto suficientemente solido para monetizacion posterior.

La experiencia deseada es:

- elegir un widget oficial;
- partir de un estilo Vantare bien hecho;
- cambiar que informacion aparece;
- ajustar como se ve esa informacion;
- guardar variantes reutilizables;
- aplicar esas variantes a diferentes layouts;
- no romper el overlay por accidente.

La referencia de profundidad es Racelab, pero Vantare no debe copiar su UI pixel a pixel.

## Principio central

El usuario no debe sentir que activa toggles sueltos.

Debe sentir que edita partes concretas del widget:

- una columna;
- una metrica;
- un footer;
- un badge;
- una fila;
- un grupo visual.

La pregunta que debe resolver la UI es:

> Que informacion quiero ver aqui y como quiero verla?

## Usuarios objetivo

### Usuario basico

Quiere abrir Vantare, elegir un overlay recomendado y usarlo sin configurar mucho.

Necesita:

- presets claros;
- nombres entendibles;
- preview fiable;
- guardar como propio;
- no tocar opciones peligrosas.

### Usuario avanzado

Quiere ajustar datos, columnas, colores, formatos y variantes.

Necesita:

- slots/columnas editables;
- formatos de tiempos;
- colores por columna;
- variantes reutilizables;
- layouts por sesion;
- control sin tener que crear templates desde cero.

### Tester

Quiere probar features nuevas sin afectar a usuarios normales.

Necesita:

- modo tester oculto;
- metricas experimentales;
- reordenacion de columnas si existe;
- feedback claro de que algo no es estable.
- documentacion especifica de como activar y probar modo tester.

## Que debe poder personalizar el usuario

### Informacion

El usuario debe poder decidir que datos aparecen:

- posicion;
- numero de coche;
- nombre;
- clase;
- gap;
- intervalo;
- ultima vuelta;
- mejor vuelta;
- offtracks;
- neumaticos;
- energia virtual;
- datos de pit si son fiables.

### Columnas

El usuario debe poder activar columnas individuales.

Ejemplo:

- activar `bestLap`;
- activar `lastLap`;
- dejar desactivado `tireWear`;
- mantener el resto del Relative igual.

Activar columnas puede ensanchar el widget. Esto debe ser natural y visible en la preview.

### Formato

El usuario debe poder ajustar como se muestra un dato cuando afecte a claridad o ancho.

Ejemplos:

- `1:35.765`;
- `35.765`;
- numero de decimales;
- formato de nombre;
- ancho de columna;
- color de columna;
- alineacion si el template lo permite.

### Apariencia

El usuario debe poder ajustar apariencia sin romper el template:

- theme;
- opacidad;
- densidad;
- color de valores;
- color de fondos;
- etiquetas on/off;
- iconos on/off si aplica.

### Filtros

El usuario debe poder decidir que pilotos aparecen.

Para `Relative`:

- coches delante;
- coches detras;
- misma clase / todas;
- incluir jugador.

Para `Standings`:

- top N;
- clase propia / todas;
- multiclase basico;
- filtros simples por sesion si aplica.

### Layouts por sesion

El usuario debe poder tener layouts distintos para:

- general;
- practica;
- qualy;
- carrera;
- resistencia.

Si no quiere complicarse, solo usa `general`.

Si la app no detecta bien la sesion, debe caer a `general`.

## Que no debe poder hacer en beta

La beta no debe incluir:

- editor libre tipo Figma;
- crear templates desde cero;
- crear themes completos desde cero;
- marketplace;
- comunidad online;
- multisimulador completo;
- cuentas;
- monetizacion dentro de app;
- track map avanzado.

Reordenar columnas puede existir solo en modo tester si se implementa con miniplan propio.

## Experiencia de editor deseada

El editor debe mezclar dos formas de trabajar:

1. Secciones organizadas tipo Racelab.
2. Seleccion directa sobre la preview cuando sea viable.

Ejemplo:

- el usuario hace click en la columna `bestLap`;
- el panel derecho muestra ajustes de esa columna;
- puede cambiar formato, color, ancho o visibilidad;
- si no puede clicar una zona pequena, usa un arbol/lista compacta de partes.

No queremos:

- una lista infinita de toggles sin contexto;
- una UI donde el usuario no sabe que parte esta editando;
- un editor libre que permita romper el diseno base.

## Recomendados y perfiles propios

Los recomendados de Vantare son puntos de partida.

Reglas de producto:

- recomendado = readonly;
- para editar, primero crear copia editable;
- la copia aparece separada como guardada desde recomendados;
- editar una copia no cambia el recomendado original.

Esto permite que Vantare mejore recomendados oficiales sin romper perfiles de usuarios.

Los nombres finales de recomendados deben ser nombres de marca elegidos por el usuario/product owner cuando llegue el momento. El documento no fija naming final.

## Variantes

Una variante es una configuracion interna reutilizable de un widget.

Ejemplo:

- `Relative Carrera LMU`;
- `Relative Qualy Compacto`;
- `Standings Stream Clean`.

Si una variante se usa en varios layouts, editarla afecta a todos.

Las variantes deben ser visibles para el usuario desde el primer corte donde exista personalizacion persistente.

La UI debe avisar:

- editar variante compartida;
- duplicar y editar solo aqui;
- cancelar.

## Mock y demo

Vantare debe poder enseñar overlays aunque LMU no este abierto.

Reglas de producto:

- en Hub/editor debe quedar claro si se usan datos mock/demo;
- el overlay final no debe mostrar un badge `MOCK` por defecto;
- la preview debe ser util para configurar;
- no se deben vender datos mock como si fueran live.

## Relative beta

`Relative` es el primer widget para validar el sistema.

Debe partir del Relative actual de Vantare y hacerlo configurable.

Debe validar:

- columnas actuales como base;
- columnas opcionales;
- `bestLap`;
- `lastLap`;
- formato de tiempos;
- ensanchado automatico;
- filtros delante/detras;
- misma clase / todas;
- incluir jugador;
- guardado real de cambios.

## Standings beta

`Standings` debe reutilizar lo aprendido en `Relative`.

Debe validar:

- columnas configurables;
- metricas por columna;
- formatos;
- multiclase basico;
- filtros simples;
- variantes reutilizables.

No debe adelantar reordenacion de columnas en stable.

## Pedals beta

`Pedals` va despues de `Relative` y `Standings`.

Beta v1 incluye:

- acelerador;
- freno;
- embrague;
- valores numericos opcionales;
- etiquetas opcionales;
- orientacion si el template lo permite;
- colores;
- opacidad/fondo.

No incluye steering salvo decision posterior.

## Criterio de exito

La personalizacion beta tiene exito si:

- un usuario puede partir de un recomendado y hacerlo suyo;
- puede cambiar informacion sin romper layout;
- puede activar columnas utiles como `bestLap` y `lastLap`;
- puede guardar variantes;
- puede tener layouts por sesion;
- entiende cuando esta usando mock/demo;
- no necesita tocar un editor libre para lograr un overlay util.

## Preguntas abiertas

- Inventario exacto del `Relative` actual.
- Si el formato actual permite guardar configuracion avanzada sin schema v2.
- Confirmacion de metricas disponibles por REST API de LMU.
- Detalle visual final de formatos, colores y alineaciones.
- Que parte de reordenacion de columnas puede vivir en `tester`.
# Personalización vigente en Overlay Studio V3 (2026-07-11)

La personalización se realiza en el editor único V3 mediante Design, Appearance, Content, Behavior, Layout y Actions. Los diseños se copian al borrador global y se guardan explícitamente. Free puede previsualizar, pero no mutar ni guardar cambios premium. Los escenarios mock actuales son Practice/Qualifying/Race y Track/Pits; lluvia, safety car, daños, tráfico y banderas son expansión.
