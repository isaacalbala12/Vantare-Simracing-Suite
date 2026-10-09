# Wordmark oficial C2 · Compacta

Elegido por Isaac para #1504 (2026-10-08). SVG originales con trazos;
no requieren fuentes. No cambiar geometría, proporciones ni tracking.

- `vantare-wordmark-color.svg`: color aprobado.
- `vantare-wordmark-blanco.svg`: una tinta sobre fondo oscuro.
- `vantare-wordmark-negro.svg`: una tinta sobre fondo claro.
- `vantare-lockup-color.svg` / `vantare-lockup-color-oscuro.svg`: Λ y nombre en color según fondo.
- `vantare-lockup-blanco.svg` / `vantare-lockup-negro.svg`: lockups a una tinta.

Conservar el viewBox y escalar proporcionalmente. Altura mínima del wordmark:
16 px en pantalla o 4 mm impreso; recomendada en el Hub: 24 px (ancho 182,85 px).
Zona de respeto mínima: media altura del wordmark alrededor; para lockups,
media altura de la Λ. No incluir botones ni etiquetas en esa zona.
En espacios menores, usar solo la Λ existente, mínimo 16 px.

GPUI embebe el wordmark blanco directamente desde este directorio y lo usa
como máscara teñida con el texto principal del tema (blanco en oscuro,
casi negro en claro). No se mantiene otra copia ni se reconstruye con texto.
La barra de 272 px coloca BETA debajo para conservar la altura de 24 px
sin desplazar el botón de contraer ni añadir un segundo símbolo.
