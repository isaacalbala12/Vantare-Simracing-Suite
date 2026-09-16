# Compactación de columnas del Standings Eficiencia

Fecha: 2026-09-16

Rama: `vantareapp/isa-1221-workshop-study-unico`

Widget: `standings` / sistema `vantare-functional`

## Contexto

El Workshop muestra el Standings de Eficiencia con una tabla de ancho fijo y
un marco que se calcula a partir de mínimos por métrica. La implementación
actual contempla todas las columnas configurables —posición, dorsal, piloto,
clase, gap, intervalo, vuelta actual, última/mejor vuelta, pit y neumático—,
pero varios mínimos siguen siendo más amplios que el texto que contienen.
Además, los presets `md` y `lg` añaden espacio lateral y la tabla ocupa todo
el marco, por lo que el sobrante acaba percibiéndose como separación entre
columnas.

La rama ya contiene el ajuste reciente de la columna `driverName` según el
formato del nombre. El cambio nuevo debe conservar ese trabajo y compactar
el resto de métricas de forma coherente.

## Objetivo

Reducir moderadamente el ancho total de cualquier combinación de columnas
activas para que el widget se adapte a su contenido y desaparezcan los huecos
laterales innecesarios, sin cambiar la información ni la jerarquía visual.

## Diseño aprobado

1. Mantener `resolveFunctionalColumnWidth` como fuente única de los mínimos
   por métrica y `resolveFunctionalStandingsSize` como fuente del tamaño
   intrínseco del marco. No se añadirán reglas paralelas específicas para
   las cinco columnas visibles en la captura.
2. Ajustar de forma conservadora los presupuestos de todas las métricas:

   | Métrica | Mínimo objetivo |
   | --- | ---: |
   | `position` | 30 px |
   | `driverNumber` | 30 px |
   | `driverName` completo | conservar el mínimo compacto vigente de 188 px |
   | `vehicleClass` | 54 px |
   | `gap` / `interval` | 76 px |
   | `currentLap` | 48 px |
   | `lastLap` / `bestLap` | 76 px |
   | `pit` | 32 px |
   | `tireCompound` | 44 px |

   Los formatos `initial`, `surname` y `truncate` conservarán sus mínimos
   específicos ya introducidos en la rama. Los incrementos de los presets
   compactos (`md`/`lg`) se mantienen en su versión reducida actual para no
   reabrir espacio al activar una columna.
3. Reducir ligeramente el padding horizontal propio de las celdas de
   Standings, manteniendo los overrides estrechos de posición, pit y
   Broadcast. La tipografía, el alto de fila, los badges y la alineación no
   cambian.
4. Mantener la columna de nombre como la única columna flexible cuando el
   contenedor sea deliberadamente más ancho. Cuando el marco se calcule de
   forma intrínseca, su ancho será la suma de las columnas activas con los
   nuevos mínimos; no se ocultarán, reordenarán ni fusionarán columnas.
5. Aplicar la misma geometría a Signature y Broadcast y conservar el
   comportamiento existente de encabezados, pies, formatos de nombre,
   recuento de filas y reencaje de Studio/Workshop.

## Fuera de alcance

- Cambiar el tamaño de letra, la altura de fila o el contenido mostrado.
- Ocultar columnas opcionales o cambiar su orden.
- Alterar Relative, Delta, Pedals u otros widgets de Eficiencia.
- Rediseñar el marco, la cabecera, el footer o la animación.
- Restablecer o incluir en este trabajo los cambios locales preexistentes de
  otros widgets detectados en el checkout.

## Verificación

- Actualizar las pruebas de geometría para los once `metricId` soportados,
  incluidos presets y formatos de nombre.
- Comprobar que el tamaño del marco disminuye al activar columnas compactas
  y que no se rompe el cálculo de altura, cabecera partida ni footer.
- Ejecutar las pruebas focalizadas de Standings y las pruebas del comando de
  Studio.
- Verificar visualmente en Workshop con la URL de `standings` de Eficiencia,
  en Signature y Broadcast, con la configuración de la captura y con una
  selección amplia de columnas.

## Nota de integración

El checkout local contiene cambios sin commit en archivos del layout de
Standings y en otros widgets. Se preservarán y se reconciliarán únicamente
los archivos que participen en esta compactación; no se usará un reset ni se
incluirán cambios ajenos en el commit de implementación.
