# Paridad — car-damage-visual

Referencia GPUI: `native/ui/src/car_damage_visual/mod.rs`. Escena congelada de
#1427 en `scenes/variants.json`; es una demostración reconstruida del Workshop,
no una captura LMU.

## Porte a Rune

`native/overlays-rune/src/car_damage_visual/` pinta la misma caja de 200 × 272
con las vistas Coche y Cifras, el trazado aprobado, la banda «REVISA EL COCHE»,
las pestañas y la línea de estado. Textos, colores, posiciones y el redondeo de
los porcentajes se copian de GPUI; el widget no anima ni usa reloj.

## Trazado: paths, no SVG

GPUI dibuja la carrocería con `PathBuilder` (`move_to`/`line_to`/`curve_to`). El
porte usa `rune::Path` con las mismas coordenadas del viewBox 120 × 180 y
`quad_to` para las curvas; no se lee ni se convierte ningún SVG. Es la misma
técnica que la referencia y evita un parser o un recurso nuevo.

Cuidado con el orden de los argumentos al portar curvas: GPUI escribe
`curve_to(to, ctrl)` y Rune `quad_to(ctrl, to)`. El test del pintor fija los
puntos finales y de control de cada segmento de la carrocería y de la cabina
contra la lista literal de GPUI para que la silueta no vuelva a invertirse.

## Diferencia conocida: sin atajo en vivo

GPUI alterna Coche/Cifras con la tecla configurada en `toggleKey` (F1–F12, en
pulsación). El host de Rune todavía no entrega eventos de teclado a los widgets,
así que el porte **no implementa el atajo**: la vista sale del ajuste `view` y no
cambia durante la carrera.

El estado interno (`view`) y el método `toggle_view()` quedan listos para que un
evento del host los alterne; hoy solo los cubre un test. La tecla guardada sigue
normalizándose en domain, pero el widget Rune la ignora hasta que exista ese
camino en el host (#2430).
