# Paridad — Avisos de sesión en Rune

Widget portado de GPUI (`native/ui/src/session_alerts/`) con la máquina de avisos de
`domain::session_alerts`. Un Look (Vantare) y cuatro estilos de panel (neo, carmín,
limpio, transparente).

## Diferencia declarada

- La última fila de la mini recorta **1 px de alto** en la caja del valor (fuente
  Display, que suma `display_baseline`) para que la caja no se salga de la ventana.
  El centrado del texto se mueve 0,5 px. GPUI pierde ese mismo píxel porque lo
  recorta la ventana. Aceptado por la raíz: no se cambia.

## Funcionalidad pendiente (PR aparte)

- **Sin sonido**: GPUI pitaba con tonos WAV por `winmm`; Rune no tiene ese camino.
- **Sin avisos de calendario**: la agenda se lee en el anfitrión y llega por el punto
  de enchufe vacío del controlador (`calendar`).
