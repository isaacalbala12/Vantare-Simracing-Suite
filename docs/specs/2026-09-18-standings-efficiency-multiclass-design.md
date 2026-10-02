# Standings Eficiencia V1 con modalidad multiclass

## Contexto

El widget de standings debe ofrecer la clasificación normal y una lectura
multiclase sin crear dos lenguajes visuales distintos. La referencia aprobada
es el widget de Eficiencia V1: panel oscuro, cabecera compacta, filas densas,
tipografía y mayúsculas de Eficiencia, foco del jugador, columnas de tiempos y
footer.

La petición no es crear una reinterpretación del widget de iRacing. Es copiar
la composición de Eficiencia V1 y añadir únicamente la información necesaria
para separar las clases.

## Decisión aprobada

Se mantiene un único diseño oficial y un único renderer productivo:

- diseño oficial: `standings-functional-compact`;
- renderer: `StandingsFunctional`;
- modalidad normal: clasificación continua con el alcance de clase existente;
- modalidad multiclass: mismo renderer y misma tabla, con todas las clases y
  bandas de clase condicionales;
- la modalidad se expresa con el `classScope` existente (`player-class` frente
  a `all-classes`), no con otro diseño oficial ni con otro widget.

La variante de Workshop `standings-multiclass` seguirá siendo una forma de
activar el alcance `all-classes` en el fixture de demostración. No representa
un diseño adicional que deba aparecer como alternativa visual del producto.

## Experiencia visual

### Normal

El modo normal conserva el resultado actual de Eficiencia V1 sin bandas de
clase ni cambios de geometría. Las columnas, el header de sesión, el
highlight del jugador, el footer, los radios, el color de fondo y las
animaciones existentes son la fuente de verdad.

### Multiclass

El modo multiclass reutiliza exactamente la carcasa normal. Dentro del mismo
`tbody` se insertan bandas semánticas de clase cuando cambia `vehicleClass`:

- una fila de banda ocupa todas las columnas;
- muestra únicamente el nombre de la clase y un acento de color de Eficiencia;
- las filas de pilotos mantienen la misma altura, padding, tipografía,
  alineación, tratamiento del jugador y columnas que en el modo normal;
- la posición visible se toma de la posición de clase cuando esté disponible;
- no se añaden tarjetas, badges, logos, diagonales ni la composición de
  Broadcast Tower/iRacing.

El acento de la banda es una decisión de presentación estable. No se
fabricarán SOF, fabricantes, números de equipo ni otros datos que el contrato
actual no autorice.

## Datos y contrato

El view model debe transportar explícitamente la modalidad de alcance para que
el renderer no tenga que inferirla por el número de clases presentes. Las
filas ya exponen `vehicleClass` y `classPosition`; esos campos son suficientes
para construir las bandas y reiniciar la numeración visual dentro de cada
clase. Si el identificador de clase está vacío, se mantiene el fallback
actual y no se crea una banda inventada.

El límite `rowCount` sigue contando filas de pilotos, no bandas. La selección
`all-classes` se aplica antes del límite, y el orden recibido del productor se
conserva.

## Geometría y comportamiento

- Las filas de pilotos mantienen el alto fijo de Eficiencia V1.
- La altura intrínseca y el cálculo de filas visibles suman el alto de las
  bandas multiclass solo cuando están presentes.
- El modo normal no cambia de tamaño por esta funcionalidad.
- Las bandas son estáticas respecto al movimiento FLIP; las filas de pilotos
  siguen identificadas por `data-standings-row` y conservan sus animaciones.
- Las bandas se renderizan con elementos de tabla válidos (`tr`/`th`) para
  conservar accesibilidad y el layout fijo.

## Alcance de implementación

1. Extender el view model V2 con el alcance explícito de clase.
2. Añadir una utilidad pura para agrupar filas contiguas y resolver la
   posición visible por clase.
3. Renderizar bandas condicionales dentro de `StandingsFunctional`.
4. Añadir solo los selectores CSS de las bandas, reutilizando los tokens y
   reglas de Eficiencia V1 existentes.
5. Ajustar el cálculo de tamaño/filas visibles para contar bandas.
6. Mantener la ruta de Workshop normal y multiclass bajo el mismo diseño
   oficial.

## Fuera de alcance

- crear un segundo diseño oficial o un renderer multiclass paralelo;
- modificar `multiclass-relative`, que representa otra semántica;
- añadir SOF o datos de fabricante sin soporte en el contrato;
- cambiar el aspecto del modo normal;
- cambiar el ordenamiento o recalcular gaps en el renderer.

## Verificación

La implementación debe cubrir al menos:

- render normal sin bandas y con el mismo contrato visual actual;
- render multiclass con varias clases, una sola clase y clases contiguas;
- posición de clase cuando existe y fallback seguro cuando no existe;
- `rowCount` contando solo pilotos;
- cálculo de alto y clipping con bandas;
- estados `stale`, `missing` y `error` sin bandas espurias;
- paridad de cabecera, filas, jugador, footer y animación entre ambas
  modalidades;
- smoke test de Workshop para `standings` normal y
  `standings-multiclass`.

## Alternativas descartadas

### Renderer multiclass separado

Se descarta porque duplicaría la tabla y permitiría que radios, tamaños,
tipografía o alineaciones divergiesen con el tiempo.

### Reutilizar `multiclass-relative`

Se descarta porque es una ventana relativa y no una clasificación completa;
no comparte el contrato de columnas ni la semántica de gap/tiempos requerida
por standings.

### Copiar la composición iRacing

Se descarta porque la decisión aprobada exige un calco de Eficiencia V1. Solo
se incorpora la agrupación de clases como extensión mínima.

## Criterio de aceptación

Al alternar entre normal y multiclass, el usuario debe percibir el mismo
widget de Eficiencia V1. La única diferencia visible permitida en multiclass
son las bandas de clase y la numeración por clase; el resto de la composición
debe permanecer compartido.
