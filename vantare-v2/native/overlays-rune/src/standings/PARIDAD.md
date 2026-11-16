# Paridad - Standings en Rune

Widget portado de GPUI (`native/ui/src/standings/`) con la proyección y la selección de
`domain::standings`. Un Look (Vantare). Este PR añade el movimiento de la tabla sobre la
tabla estable que entregó A.

## Movimiento

- **FLIP por identidad.** Una fila que cambia de puesto arranca en su `y` anterior y llega
  a la nueva con `FLIP (0.22, 0.9, 0.3, 1)`. La duración es la de GPUI: 280 ms más 1,1 ms
  por píxel recorrido, con techo de 460 ms.
- **Fundido de entrada y salida.** Una fila que entra aparece en 200 ms con
  `EASE_OUT (0, 0, 0.58, 1)`; la que sale se retiene en su última `y` hasta apagarse.
- **Reloj solo durante la transición.** Al acabar no queda ningún despertar. Con
  movimiento reducido las filas saltan al destino y no se arma reloj.

## Funcionalidad pendiente (PR aparte)

- **Sin los demás efectos de GPUI**: destello de posición, chip `+n`/`−n`, barrido de
  vuelta rápida, batalla, marcador de mejor vuelta y punto de boxes.
