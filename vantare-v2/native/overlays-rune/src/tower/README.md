# Torre (broadcast tower) — Rune

Escena pura en `scene.rs` y Look Vantare en `render.rs`; sin Rune en la escena.

- El carrusel de pilotos es la única animación continua: reloj solo mientras el
  ajuste esté activo, haya filas y el estado sea listo, a la cadencia del widget;
  con «reducir movimiento» no hay reloj (decisión de la raíz, 15-nov).
- El FLIP copia lo que se ve hoy: 250 ms + 0,28 × 346,16 px por ranura recorrida,
  con tope de 360 ms. El 346,16 es la tarjeta heredada de 1920 px (#2365); no se
  corrige aquí.
- La ranura de `VisualRow` es la de la tira, no un píxel: `card_left` la lleva a x.
