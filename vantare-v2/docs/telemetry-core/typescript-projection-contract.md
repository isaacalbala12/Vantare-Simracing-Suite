# Contrato TypeScript de proyecciones

Los tipos wire se generan desde Go en [generated/telemetry.ts](../../frontend/src/generated/telemetry.ts). No editarlos manualmente; consultar [generador](../../tools/telemetry-contract-gen/README.md).

## Overlay V2

[overlay-frame-v2-store.ts](../../frontend/src/telemetry-transport/overlay-frame-v2-store.ts) valida `OverlayUpdateV2` y declara eventos `telemetry:overlay-v2:snapshot|status`, ruta `/telemetry/overlay-v2/projection` y límite **72 KiB**, coherente con Go. Mantiene estado, revisión de frame, fuente, frescura y diagnósticos propios.

[overlay-wails-pull.ts](../../frontend/src/telemetry-transport/overlay-wails-pull.ts) y [overlay-socket-pull.ts](../../frontend/src/telemetry-transport/overlay-socket-pull.ts) tienen contratos y tests de entrega/lifecycle. No sustituirlos por el antiguo adapter Overlay v1.

## Transporte genérico conservado

[contracts.ts](../../frontend/src/telemetry-transport/contracts.ts) enumera `engineer`, `strategy` y `analysis`, con versión 1 y techo 256 KiB para ese contrato. Es una frontera distinta de Overlay V2; la lista de tipos no demuestra que las tres rutas estén expuestas por el servidor. Los deltas RFC 7396 ya no son la implementación actual (`delta-unsupported`).

La UI adapta datos validados a sus ViewModels. No reconstruye raw ni se convierte en autoridad de calidad, identidad o cálculo de carrera. Los fixtures del [generador](../../frontend/src/generated/telemetry.generated.test.ts) y los [tests de transporte](../../frontend/src/telemetry-transport/) protegen el cruce Go/TypeScript.

## Checks

Desde `vantare-v2`: `pnpm --dir frontend test -- src/telemetry-transport` y `pnpm --dir frontend typecheck`. Estos comandos documentan cómo validar; sus resultados deben obtenerse sobre la rama concreta.

[Contrato histórico completo](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/60b47b7c7e7550faf0c532fdf3dbc6f32cfd516c/vantare-v2/docs/telemetry-core/typescript-projection-contract.md). Sus resultados y su wiring corresponden al corte que declara.
