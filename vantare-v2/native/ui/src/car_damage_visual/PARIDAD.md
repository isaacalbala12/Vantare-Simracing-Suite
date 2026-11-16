# Paridad — car-damage-visual

Referencia GPUI: `native/ui/src/car_damage_visual/mod.rs`. Escena congelada de
#1427 en `scenes/variants.json`; es una demostración reconstruida del Workshop,
no una captura LMU.

## Porte a Rune

`native/overlays-rune/src/car_damage_visual/` pinta la misma caja de 200 × 272
con las vistas Coche y Cifras, el SVG aprobado, la banda «REVISA EL COCHE», las
pestañas y la línea de estado. Textos, colores, posiciones y el redondeo de los
porcentajes se copian de GPUI; el widget no anima ni usa reloj.

## Diferencia conocida: sin atajo en vivo

GPUI alterna Coche/Cifras con la tecla configurada en `toggleKey` (F1–F12, en
pulsación). El host de Rune todavía no entrega eventos de teclado a los widgets,
así que el porte **no implementa el atajo**: la vista sale del ajuste `view` y no
cambia durante la carrera.

El estado interno (`view`) y el método `toggle_view()` quedan listos para que un
evento del host los alterne; hoy solo los cubre un test. La tecla guardada sigue
normalizándose en domain, pero el widget Rune la ignora hasta que exista ese
camino en el host (issue del host pendiente de abrir por el orquestador).
