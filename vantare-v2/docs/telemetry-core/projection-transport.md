# Transporte local de proyecciones

Contrato de navegación y límites contrastado el 2026-09-14. Las fuentes exactas son [telemetrytransport](../../internal/app/telemetrytransport/) y su conexión en [server.go](../../internal/server/server.go) y [main.go](../../cmd/vantare/main.go).

## Overlay V2

[Publisher](../../internal/app/telemetrytransport/publisher.go) transporta `overlay-v2`, retiene el último snapshot y mantiene entrega acotada latest-wins. No envuelve el antiguo `Hub` v1 ni usa su sello privado, acoplamiento de `statusRevision` o JSON Merge Patch RFC 7396.

- Contrato del producto: [OverlayFrame/OverlayUpdate](../../internal/telemetry/projection/overlayv2/).
- Límite duro específico: **72 KiB** en Go y TypeScript. El objetivo representativo de 64 KiB no es el límite de aceptación.
- SSE de OBS: `/telemetry/overlay-v2/projection`, con eventos `telemetry:overlay-v2:snapshot` y `telemetry:overlay-v2:status`.
- Desktop/Studio: consumidores Wails pull con lifecycle propio; ver [overlay-wails-pull.ts](../../frontend/src/telemetry-transport/overlay-wails-pull.ts).
- Existe transporte por secciones con base/ACK y recuperación completa; ver [overlay_sections.go](../../internal/app/telemetrytransport/overlay_sections.go) y [ADR 0095](../adr/0095-overlay-incremental-sections.md). Su presencia no prueba activación en todas las superficies ni un ahorro medido.

## Otros contratos

El transporte genérico conserva techo de 256 KiB y tipos de Engineer/Strategy/Analysis; no confundir tipos disponibles con rutas conectadas. En `server.go`, Strategy solo se registra si `StrategyPublicTransport` está habilitado y existe la proyección. Engineer conserva `/engineer/stream` para su bus; esto no es una ruta pública de facts canónicos.

Las rutas Overlay V1 y `/telemetry/stream` no se registran en el servidor actual. El servidor solo acepta loopback; no exponerlo a LAN con instrucciones de una guía antigua.

## Verificación del contrato

Desde `vantare-v2`:

```powershell
go test ./internal/app/telemetrytransport
pnpm --dir frontend test -- src/telemetry-transport
```

Pruebas específicas de límites, bytes, secciones, reconnect y teardown viven junto al código. Informar el resultado real y completar la prueba física cuando cambie el runtime. No borrar el paquete como rollback: está conectado a producto.

[Contrato histórico completo](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/60b47b7c7e7550faf0c532fdf3dbc6f32cfd516c/vantare-v2/docs/telemetry-core/projection-transport.md). Sus resultados y su wiring corresponden al corte que declara.
