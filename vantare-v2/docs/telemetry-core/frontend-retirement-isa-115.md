# ISA-115 / TC-09C — retirada frontend y transportes legacy

Fecha: 2026-08-01. Base: ISA-114
`578bd704adda1be76b7146fb9d2414684e0f9104`.

## Resultado

Studio, Desktop y OBS consumen un único contrato: Overlay Projection v1. Cada
runtime conserva su transporte apropiado —Wails o SSE— pero ambos comparten el
mismo store, decoder, mapper y lifecycle. No existe selector legacy/shadow ni
un decoder alternativo que pueda alimentar renderizadores.

No se modificaron componentes visuales, ViewModels, renderizadores, CSS,
documentos de layout ni la interacción del canvas.

## Retirada demostrada

Se eliminaron después de verificar consumidores cero:

- `OverlayApp`, que era un entrypoint no importado;
- adapters Wails/SSE para `telemetry:update` y sus tests exclusivos;
- `normalizeLegacyTelemetry` y el decoder incremental anterior;
- el harness Playwright de shadow runtime sustituido por el harness de cutover;
- el combinador fail-open que mantenía dos autoridades;
- los nombres `projection-shadow-adapter` y tipos `*Shadow*` del transporte
  productivo.

El comparador y su harness de evidencia TC-07A permanecen bajo
`overlay/telemetry-shadow`: no alimentan producto y se decidirá su archivo
definitivo en ISA-117. El decoder y mapper productivos se movieron a
`overlay/projection`.

## Contratos vigentes

- `overlay/transports/telemetry-adapter.ts`: lifecycle mínimo compartido.
- `overlay/transports/projection-observer.ts`: observación Wails/SSE.
- `overlay/transports/projection-telemetry-adapter.ts`: única publicación al
  coordinator de render.
- `overlay/projection/overlay-projection-v1.ts`: único decoder.
- `overlay/projection/overlay-projection-adapter.ts`: único mapper.
- `telemetry-transport/source-status.ts`: tipo y eventos cerrados de estado.

El estado de fuente se renombró a `telemetry-core:source-status` y
`telemetry-core:source-status:get`; Go, los dos shells Hub, Studio y los mocks
de harness usan el mismo nombre y tipo.

## Guardias

`legacy-retirement.test.ts` recorre TypeScript productivo y falla si reaparece
un evento, ruta, normalizador, adapter o selector retirado. También exige que
los entrypoints y archivos legacy sigan ausentes. La auditoría PowerShell
separa referencias productivas —cero— de los propios tests negativos.

## Checks

- frontend completo: 298 archivos y 2.016 tests PASS.
- tests focales de projection/transports/Studio/Desktop/OBS/Topbar: PASS.
- Playwright Studio/Desktop/OBS en 1440×900 y 390×844: PASS.
- build TypeScript/Vite: PASS; warning heredado de chunk sin cambios.
- Go global: PASS.
- lint focal de contratos, projection y transports modificados: PASS.
- auditoría de consumidores y `git diff --check`: PASS.

El lint ampliado sobre archivos import-only reproduce siete errores heredados:
tres `set-state-in-effect`, tres `only-export-components` y un parámetro no
usado en un mock visual. No proceden de esta retirada; el lint de toda la zona
funcional modificada está limpio. La prueba Windows heredada de saves
concurrentes falló una vez y pasó al reintentar, igual que en ISA-114.

## Riesgos y rollback

- El comparador shadow histórico sigue presente de forma no productiva hasta
  ISA-117 para conservar evidencia de paridad.
- ISA-116 debe endurecer límites, redacción, benchmarks y observabilidad; no
  debe reintroducir otro transporte.
- Revertir el commit restaura todos los adapters; no existe migración de datos.
- No se ha hecho merge ni promoción.
