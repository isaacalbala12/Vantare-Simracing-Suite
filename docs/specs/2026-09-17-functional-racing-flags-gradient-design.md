# Functional Racing Flags — degradado cálido continuo

## Objetivo

Evitar que la placa amarilla de Racing Flags pierda saturación hacia la derecha y termine pareciendo gris u oscura sobre el fondo del Workshop.

## Diseño aprobado

- Mantener el color semántico de cada bandera, con tres tonos sólidos de la misma familia cromática.
- Usar un degradado continuo y cálido: el extremo derecho debe seguir siendo dorado/amarillo, no una transparencia sobre el fondo.
- Mantener el texto blanco, el borde exterior pulsante de la bandera amarilla y la ausencia de círculos o líneas decorativas.
- Reducir el brillo diagonal a una capa sutil para que no lave el tono de la bandera.
- Aplicar la misma estrategia a verde, rojo, azul, blanco, negro y cuadros, sin cambiar el contrato de datos ni los controles de ancho, alto o color de letra.

## Criterios de aceptación

1. La amarilla conserva una lectura claramente amarilla en toda la superficie.
2. El borde sigue respirando únicamente en el estado amarillo.
3. El texto mantiene el color elegido desde el harness.
4. El cambio no añade elementos flotantes ni modifica el tamaño configurable.
5. La comprobación visual del harness no produce errores de consola y las pruebas focales siguen pasando.
