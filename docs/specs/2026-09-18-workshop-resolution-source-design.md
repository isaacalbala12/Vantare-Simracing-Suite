# Workshop: la resolución real manda sobre el harness

## Objetivo

Corregir el contrato de tamaño del Workshop para que el widget conserve su
resolución/layout real y el harness solo pueda mostrar una previsualización
redimensionada. Un tamaño declarado en la URL no debe cambiar el layout que
recibe el renderer ni contaminar otro widget al cambiar de selección.

## Decisión

Se conserva el tamaño intrínseco de `widget.layout` como fuente de verdad:

- `WidgetVisualHost` y `WidgetVisualViewport` recibirán siempre el layout real
  construido por `buildWorkshopWidget`.
- `width`/`height` de la query, cuando existan, afectarán únicamente al marco
  exterior de previsualización del harness mediante una transformación visual.
- Si la query no declara dimensiones, el harness mostrará automáticamente el
  tamaño real del widget seleccionado.
- Al cambiar de widget se eliminarán los `width`/`height` heredados del widget
  anterior; los controles volverán a reflejar la resolución real del nuevo
  widget.
- Los perfiles guardados y los ajustes globales no se modifican.

## Alternativas descartadas

1. Eliminar los campos de ancho/alto del harness. Evita la contaminación, pero
   elimina la capacidad de probar tamaños concretos.
2. Seguir sobrescribiendo el layout interno y aumentar los mínimos de cada
   widget. Mantiene el acoplamiento que ha causado el fallo y obliga a corregir
   el mismo problema widget por widget.
3. Aplicar el tamaño declarado solo al contenedor exterior, manteniendo el
   layout interno real. Es la opción elegida porque conserva la capacidad de
   redimensionar la preview sin alterar el componente productivo.

## Verificación

- Standings conserva todas sus filas y adapta su caja a la resolución real.
- Horizontal Standings no reparte diez tarjetas dentro de un tamaño heredado.
- Pedals conserva etiquetas y valores, incluso cuando la preview se escala.
- Cambiar de widget después de declarar un tamaño vuelve a usar las
  dimensiones naturales del nuevo widget.
- Racing Flags mantiene la posibilidad de probar ancho/alto y color de letra en
  el harness.
- Se añaden regresiones para comprobar que el layout entregado al host no
  contiene las dimensiones declaradas del harness.
