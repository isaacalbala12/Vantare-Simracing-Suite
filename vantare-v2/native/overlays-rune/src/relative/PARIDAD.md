# Paridad - Relative Eficiencia en Rune

Port del Look Eficiencia del Relative de GPUI (`native/ui/src/relative/eficiencia.rs` y
`relative/eficiencia/labels.rs`) sobre la escena y el movimiento compartidos con Vantare.

## Movimiento y escena

- La escena y `relative::scene::Motion` son las mismas del Look Vantare: FLIP al
  reordenar, fundido de entrada y salida y avisos de adelantamiento, con el `Tween`
  común de `crate::motion`. Este Look no añade canales ni reloj propio.
- Sin tira de tráfico: `has_strip()` es falso, así que no hay latido de puntos.

## Banda de pausa

- Los 22 px de «EN PAUSA»/«PAUSED» **son paridad con el anfitrión de GPUI**, no un añadido
  de producto: `native/ui/src/app.rs:31` (`PAUSE_BANNER_HEIGHT = 22.0`), sumados a la
  altura cuando `paused` (`app.rs:308-309`, `SourceState::Paused` en `app.rs:418`). El
  resto de widgets de Rune la reproducen igual (`head_to_head` «Pause band of the GPUI
  host»).

## Diferencias declaradas

- **Texto recortado una sola vez.** GPUI guarda el texto ya recortado por
  `text::fit` en su `Cell` y lo dibuja tal cual; aquí se pinta ese mismo texto y no se
  usa el recorte nativo de Rune, para no añadir una segunda elipsis.
- **Sin caché de presentación.** GPUI prepara `Labels`/`Prepared` una vez por foto e
  inmoviliza la escena quieta (`idle_rows`, `same_visible`); en Rune el árbol se
  reconstruye por frame, como en Fuel, y el repintado se decide comparando la escena
  retenida.
- **Colocación con `pin`.** GPUI no tiene el concepto; aquí toda capa superpuesta se
  posiciona con `pin(Some(x), Some(y), None, None)`, como el resto de overlays migrados.
- **Gradiente de fila en radianes.** El degradado CSS de 180° del jugador se pinta con
  `PI`, porque `El::linear_gradient` de Rune recibe radianes.
- La clase se compara en mayúsculas (GPUI hace `to_uppercase()`); el signo del badge es
  el menos tipográfico `−` (U+2212).
- Solo los avisos de cruce (ganancia/pérdida) se pintan como fondo; GPUI Eficiencia no
  muestra el aviso de boxes en este Look.
