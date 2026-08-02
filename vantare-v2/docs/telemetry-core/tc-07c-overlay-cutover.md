# TC-07C — Cutover Overlay

## Resultado

Overlay Projection v1 es la única fuente productiva para Studio, Desktop y
OBS. Los renderizadores continúan recibiendo `TelemetrySnapshot` mediante el
mismo coordinator; el cambio se limita al adapter de entrada.

## Autoridad

| Runtime | Transporte | Fuente activa |
|---|---|---|
| Studio | Wails | `telemetry:overlay:*` |
| Desktop | Wails | `telemetry:overlay:*` |
| OBS | SSE loopback | `/telemetry/overlay/projection` |

El composition root no inicia `TelemetryBridge` ni `vapp.StartTelemetry` y no
inyecta el servicio legacy en el servidor. Por tanto, `telemetry:update` y
`/telemetry/stream` no tienen productor o consumidor productivo.

## Estados

- `live`: snapshot canónico adaptado.
- `degraded`/`stale`: conserva brevemente el último snapshot como stale.
- `stopped`/`detecting`/`connecting`: desconectado, sin mock.
- proyección sin sesión/jugador demostrado: desconectado.
- contrato inválido: error sanitizado.
- reconexión SSE: store nuevo y resync desde status/full retenido.

## Código legacy

Los adapters, tests y handler legacy permanecen inertes hasta TC-09. Esta
separación permite atribuir cualquier regresión al cutover antes de borrar el
fallback. La auditoría estática del entrypoint y los tres runtimes no encuentra
consumidores legacy alcanzables.

## Evidencia

- Unit tests de mapped/stale/disconnected y player missing.
- Tests de CompositeApp y ObsOverlayApp exigen eventos/ruta canónicos.
- Playwright ejecuta Studio/Desktop/OBS en wide y compact, comprueba estado
  ready, escritura al coordinator y cero suscripciones legacy.
- Las fixtures y goldens proceden del pipeline real LMU 1.4 cerrado en
  ISA-129, incluidas transiciones pit, relative, delta y reconexión.
- Las suites visual y de canvas se ejecutan sin cambiar baselines ni umbrales.
- Frontend completo: 299 archivos y 2.025 tests. La primera pasada reprodujo
  dos flakes de temporización ajenos al diff; ambos pasaron aislados y la
  repetición global quedó verde. Go app/server/cmd y Telemetry Core pasan.
- Visual: tres Original a 0 %; Crystal Studio conserva el 100 % heredado.
  Canvas conserva los umbrales heredados fuera de alcance.

## Rollback

Volver al commit ISA-106 `e3bacdb1011df908369db2903c79b0a13c6adc9a`
restaura legacy como autoridad y conserva el runtime canónico en shadow.

## Gate humano

La prueba perceptual dentro de LMU no se sustituye por fixtures. Se agrupa con
el gate final del módulo solicitado por Isaac y no autoriza promoción.
