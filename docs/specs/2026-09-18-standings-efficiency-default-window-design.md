# Standings Eficiencia `default` con ventana alrededor del jugador

## Contexto

Standings de Eficiencia necesita una composición normal que conserve la
lectura densa de V1, pero que no obligue a mostrar toda la parrilla cuando el
jugador está lejos del podio. La referencia aprobada mantiene los tres
primeros pilotos fijos y añade una ventana centrada en el jugador.

El diseño se incorpora como una piel de estudio de Standings de Eficiencia
con el id `default`. Debe ser la selección inicial del Workshop, sin retirar
las opciones existentes `V1` y `Foco`.

## Decisión aprobada

Se mantiene un único renderer productivo, `StandingsFunctional`, y un único
contrato de datos Overlay V2. La diferencia de `default` es una política pura
de selección de filas, no un renderer paralelo ni una tabla alternativa.

- `default` es la piel seleccionada al entrar en Standings de Eficiencia.
- `V1` y `Foco` permanecen seleccionables para compatibilidad y comparación.
- `Signature` y `Broadcast` siguen siendo diseños visuales oficiales
  independientes; esta petición no cambia otros sistemas ni ajustes globales.
- La selección vive en el Workshop como las demás pieles de estudio y no se
  persiste dentro de perfiles de producción.

## Configuración

El panel mantiene dos conceptos separados:

- `Pilotos`: total de pilotos de la parrilla que se toma del frame de ejemplo
  o de la fuente live. Para la prueba aprobada, el valor es 12.
- `Pilotos alrededor`: número total de pilotos vecinos, sin contar al jugador.
  El valor inicial es 4 y se reparte como dos posiciones delante y dos detrás
  cuando hay espacio.

La URL del Workshop serializa la ventana para que una revisión sea reproducible.
El nombre interno recomendado para el parámetro es `around`, con un límite
entero acotado y opciones pares para conservar una distribución simétrica
(`0`, `2`, `4`, `6`, `8`).

## Regla de selección

La entrada es la clasificación ordenada recibida, el identificador del jugador
y el total de pilotos declarado. El renderer no ordena ni calcula posiciones.

Para `around = 4`, una parrilla de 12 con el jugador en P9 produce:

```text
1
2
3
7
8
9  ← jugador
10
11
```

La regla general es:

1. conservar las primeras `min(3, total)` posiciones;
2. si el jugador está fuera del top 3, construir una ventana que incluya al
   jugador y hasta `around` vecinos, repartida de forma equilibrada a ambos
   lados;
3. si la ventana alcanza el principio o el final de la parrilla, desplazarla
   hacia el lado disponible hasta completar el número solicitado;
4. unir el top 3 y la ventana eliminando duplicados y conservando el orden
   original de carrera;
5. si el jugador está dentro del top 3, mantener ese top 3 y completar con las
   siguientes posiciones disponibles, sin duplicar filas; el jugador ya forma
   parte del bloque fijo;
6. si no existe jugador autorizado, mostrar el top 3 y las primeras posiciones
   disponibles hasta completar la capacidad solicitada, sin inventar foco.

El total mostrado nunca supera las filas disponibles. Si la parrilla tiene
menos de tres pilotos, solo se muestran las filas recibidas.

No se añade una fila visual de puntos suspensivos. El salto entre P3 y la
ventana debe quedar expresado por el espacio natural entre filas, igual que en
la referencia.

## Datos y arquitectura

La selección se resuelve antes de `StandingsFunctional`, junto al view model o
en una utilidad pura compartida por el view model y el cálculo de layout.
`StandingsFunctional` recibe solamente las filas que debe pintar.

- `rowCount`/`Pilotos` conserva el significado de total de parrilla para el
  fixture y `totalRows`.
- `around` es una preferencia de presentación del estudio y no una mutación
  del frame de telemetría.
- Las posiciones que se pintan continúan siendo las posiciones originales de
  las filas; no se renumeran por el recorte.
- `isPlayer` sigue viniendo del `player.id` autorizado por Overlay V2.
- La selección es estable por id y conserva la identidad necesaria para FLIP y
  para los flashes de adelantamiento.
- Los estados `stale`, `missing`, `error` y `disconnected` no fabrican una
  ventana ni un jugador.

## Geometría y presentación

- La cabecera, columnas, nombre, módulos, foco del jugador y footer de
  Eficiencia no cambian.
- La altura intrínseca y el clipping se calculan con el número de filas
  seleccionadas, no con el total de la parrilla.
- Con 12 pilotos y `around = 4`, la caja reserva ocho filas de pilotos.
- El harness conserva la resolución real del widget como base; ancho y alto
  solo alteran la previsualización declarada.
- El diseño no añade tarjetas, logos, separadores de clase ni ornamentos de
  iRacing.

## Workshop

El control inicial de Standings de Eficiencia selecciona `default`. Las
opciones `V1` y `Foco` permanecen visibles y deben poder cambiarse sin que la
selección de ventana se filtre a otros widgets o sistemas.

La selección de `default` debe mostrar el control `Pilotos alrededor`. En V1 y
Foco no se altera la semántica existente salvo que compartan explícitamente
el mismo parámetro de filas; no se les aplica la política de ventana de forma
implícita.

## Alternativas descartadas

### Ocultar filas solo en el renderer

Se descarta porque el view model seguiría declarando filas que la tabla no
renderiza y el layout reservaría una altura incorrecta. También rompería la
identidad de las filas para motion.

### Crear un renderer o diseño paralelo

Se descarta porque duplicaría la carcasa de Eficiencia y permitiría que
tipografía, columnas, focos y alturas divergiesen de V1.

### Reutilizar `ahead` y `behind` del widget Relative

Se descarta porque Standings necesita conservar el top 3 fijo y porque esos
campos tienen semántica independiente por lado. `around` expresa aquí el total
de pilotos vecinos de la ventana, sin contar al jugador.

## Verificación

La implementación debe cubrir como mínimo:

- 12 pilotos con jugador en P9: `1,2,3,7,8,9,10,11`;
- jugador en P2 sin filas duplicadas y completado hacia abajo;
- jugador en P4 y en la última posición, con desplazamiento por límites;
- `around = 0`, `2`, `4`, `6` y `8`;
- parrillas menores de tres y parrillas menores que la ventana solicitada;
- jugador ausente y estados no disponibles;
- `rowCount` contando la parrilla, mientras la altura usa filas visibles;
- orden, columnas, módulos, nombre y header sin regresiones;
- selección `default` al aterrizar y disponibilidad de `V1`/`Foco`;
- round-trip del parámetro `around` en el Workshop;
- pruebas focalizadas, typecheck, lint y build.

## Criterio de aceptación

Al abrir Standings de Eficiencia, `default` aparece seleccionado y muestra una
clasificación densa con los tres primeros fijos y la ventana alrededor del
jugador. Al elegir 12 pilotos y cuatro alrededor, el resultado coincide con la
secuencia aprobada sin filas artificiales ni duplicados. V1 y Foco siguen
disponibles y sus vistas no cambian por accidente.
