# Paridad - Standings en Rune

Widget portado de GPUI (`native/ui/src/standings/`) con la proyección y la selección de
`domain::standings`. Un Look (Vantare). Este PR entrega la tabla estable: filas, columnas,
bandas de clase, banners, pie y pausa.

## Diferencia declarada

- **Movimiento de reordenación: pendiente en A2.** Una fila que cambia de puesto salta a
  su nueva `y` en la siguiente foto; no hay FLIP ni fundido de entrada y salida. GPUI los
  anima con `FLIP (0.22, 0.9, 0.3, 1)`, `EASE_OUT (0, 0, 0.58, 1)` y 200 ms de fundido.
  Hasta que llegue A2, una reordenación no arma ningún reloj: el overlay queda quieto
  después de pintar la tabla nueva.

## Funcionalidad pendiente (PR aparte, A2)

- **Sin movimiento de reordenación**: FLIP por identidad, fundido de entrada y salida,
  reloj solo durante la transición y salto con movimiento reducido.
- **Sin los demás efectos de GPUI**: destello de posición, chip `+n`/`−n`, barrido de
  vuelta rápida, batalla, marcador de mejor vuelta y punto de boxes.
