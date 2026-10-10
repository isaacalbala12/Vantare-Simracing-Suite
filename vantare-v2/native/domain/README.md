# domain — contrato neutral

Modelo puro sin I/O, GPUI ni runtime. DrivingSituation no contiene señales de simulador ni preferencias de UI.

## #1562 · Ocultar fuera de pista

`DrivingSituation` es Unknown/OnTrack/Garage/Paused/Replay. Unknown nunca oculta.
`State` conserva la situación neutral; `degrade` la vuelve Unknown. No confundir
`SourceKind::Replay` (grabación) con el modo replay del juego. El núcleo aplica
la confirmación; domain no tiene preferencias de visibilidad.
Ver [contrato y señales](../runtime/README.md).
