# domain — contrato neutral

Modelo puro sin I/O, GPUI ni runtime. DrivingSituation no contiene señales de simulador ni preferencias de UI.

## #1562 · Ocultar fuera de pista

`DrivingSituation` es Unknown/OnTrack/Garage/Paused/Replay. Unknown nunca oculta.
`State` conserva la situación neutral; `degrade` la vuelve Unknown. No confundir
`SourceKind::Replay` (grabación) con el modo replay del juego. El núcleo aplica
la confirmación; domain no tiene preferencias de visibilidad.
Ver [contrato y señales](../runtime/README.md).

## Actividad Live — #1860, paso 3

`vantare_domain::is_live(&Snapshot)` es el predicado compartido por Hub y
los dueños de derechos. Sólo SourceKind::Live + SourceState::Live es verdadero;
Waiting, Paused, Stale, Lost y una grabación son falsos. No cambia la conservación
de gracia durante Paused/Stale de la misma carrera ni el futuro contrato de sesión.


## Frescura compartida — #1868, paso 5

`freshness` posee `STALL_LIMIT` (500 ms), `SITUATION_CONFIRM` (250 ms) y
`Reason`, vocabulario neutral para diagnósticos. No decide capacidades.
`player_clock_frozen` nombra la convención vigente de driver_inputs=WithData;
`shows_last_live` conserva la regla del host: Paused, o Live sin jugador ni
posiciones WithData. Unsupported/Supported mantienen su comportamiento previo.
El adaptador vigila sus bloques; Core vigila silencio y retiene la última foto
viva durante pausa. El consumidor conserva su plazo Lost de cinco segundos.
`Adapter::freshness_detail` es opcional, local y solo diagnóstico: sus detalles
no cruzan Snapshot/DTO y el núcleo no los interpreta.
