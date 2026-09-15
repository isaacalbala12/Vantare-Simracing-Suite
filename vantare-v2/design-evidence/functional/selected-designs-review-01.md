# Revisión de los diseños elegidos: Principal 3 y Broadcast 2

**Principal / Signature: 9,0/10. Broadcast: 8,825/10.** Recomendaría Principal como candidata visual principal. Broadcast conserva la dirección elegida, con dos diferencias concretas de acabado que corregiría antes de cerrar su traslado.

| Criterio | Peso | Principal / Signature | Broadcast |
|---|---:|---:|---:|
| Belleza / taste | 35% | 9 | 8,5 |
| Modularidad visual | 25% | 9 | 9 |
| Lectura útil en carrera | 25% | 9 | 9 |
| Identidad Vantare | 15% | 9 | 9 |
| **Global ponderado** | | **9,0** | **8,825** |

## Evidencia y escala

Inspeccionadas las referencias aprobadas standings-images-v3-libre.png y standings-images-v2-broadcast.png, y las seis capturas completas react-signature-final.png, react-broadcast-final.png, react-signature-core-02.png, react-signature-expanded-02.png, react-broadcast-core-02.png y react-broadcast-expanded-02.png.

Se juzga el widget a la derecha del Workshop en las capturas originales, con las anchuras nativas comunicadas de 428 y 448 CSS px. Las referencias generadas son considerablemente mayores; se comparan relaciones de tamaño, jerarquía y material, no el tamaño absoluto de las letras mostrado por cada imagen. La sidebar y el fondo no puntúan como diseño del widget. No se han recortado ni modificado imágenes, leído el repositorio o ejecutado pruebas.

## Principal / Signature

El traslado conserva los rasgos que distinguen la opción 3: superficie continua, cabecera integrada con diagonales rojas, subrayados cortos bajo las métricas, separadores verticales breves entre datos y fila neutra del jugador con marca roja lateral. La relación entre cabecera, diez filas y cuerpo general se mantiene próxima a la referencia al tener en cuenta la escala. Inter a tamaño nativo conserva la presencia de los nombres sin exigir el tamaño de la imagen ampliada.

La versión núcleo conserva una composición completa. La ampliada integra mejor vuelta, última vuelta y PIT mediante el mismo lenguaje de columnas; no recupera las piezas separadas que Isaac rechazó. El material React es algo más uniforme que el acabado de la imagen generada, pero no considero necesaria una nueva capa de brillo para reproducir literalmente esa iluminación. No identifico una diferencia importante que obligue a revisar la composición de Principal.

## Broadcast

El traslado es reconocible como opción 2: cabecera de marca y contexto por encima de una fila propia de títulos, marcas rojas junto a pilotos y tiempos de vuelta encapsulados. La fila gris del jugador conserva continuidad y la variante ampliada admite dos columnas de vueltas sin desordenar el núcleo. La lectura y el parentesco Vantare se mantienen.

Dos diferencias que conviene corregir:

1. **Diagonales de cabecera demasiado invasivas al retirar módulos.** En react-broadcast-core-02.png las bandas rojas pasan detrás del reloj y del contexto. En la imagen elegida decoran principalmente el espacio a la derecha de la clase. Mantener la composición de marca y contexto sobre una zona tranquila: recortar o desvanecer el motivo antes de ese grupo cuando no haya anchura libre. Conservar las diagonales aprobadas, sin exigir que ocupen todo el espacio en compacto.
2. **Las cápsulas de vueltas pierden parte de su forma y profundidad.** A escala nativa se ven como rectángulos grises casi planos, sobre todo al repetir mejor y última vuelta. La referencia tiene extremos más suaves y una ligera variación de luz que las separa del cuerpo. Probar radios cercanos a 5–6 CSS px y un degradado interior muy contenido, manteniendo altura, márgenes y tipografía actuales. No añadir un borde brillante ni una tarjeta a la fila completa.

La segunda observación compara la forma proporcional de las cápsulas; no exige reproducir una cápsula de la imagen grande con sus dimensiones originales. Estas correcciones no garantizan automáticamente una nota de 9.

## Veredicto

Mantener Principal como opción principal y Broadcast como secundaria coincide con la elección de Isaac. La puntuación distinta responde al acabado visible de las implementaciones, no a cuestionar esa elección ni a penalizar las marcas rojas o las cápsulas que ahora están expresamente aprobadas.

La afirmación de 32 combinaciones correctas procede del encargo. Las capturas muestran las variantes estándar, núcleo y ampliada de cada diseño; no equivalen a inspeccionar visualmente las 32 combinaciones. No se valora aquí práctica porque no se ha suministrado una captura nueva de ese estado. La aprobación de las imágenes no constituye aceptación automática de React, y estas notas tampoco sustituyen la aceptación de Isaac. No se acredita conducción física ni Wails/LMU.
