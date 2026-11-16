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

## Atajo global: comportamiento heredado y conocido (#2430)

GPUI y Rune alternan Coche/Cifras una vez por pulsación de `toggleKey` (F1–F12),
sin Mayús/Ctrl/Alt/Win. En Windows funciona con cualquier ventana delante, incluido
el juego o el Hub: el overlay nunca necesita foco. Es paridad heredada, no una diferencia.
La vista inicial sigue saliendo de `view`; mantener la tecla no repite el evento.
Ocultar y volver a mostrar recrea la instancia: si la tecla sigue pulsada, dispara
su primer flanco y alterna desde `view`, igual que GPUI. No es una repetición por mantenerla.

El host Rune sondea cada 32 ms solo mientras hay una instancia activa con tecla.
Esos despertares no deben presentar imágenes si no hay flanco ni otro cambio.
Sin atajos activos no hay sondeo ni reloj de teclado; el widget sigue sin animación.
Pendiente de la tanda del PC: comparar CPU de esos despertares con GPUI, con tecla
y sin tecla, y comprobar el flanco con el juego delante. No se ha medido aquí.
