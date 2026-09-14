# Base verificada para planificar la retirada V1 — 2026-09-03

Alcance: exploración acotada para PLAN, **no** inventario exhaustivo, auditoría
integral V2, permiso de borrado ni certificación de rendimiento.
[Maestro vigente](../../../superpowers/specs/2026-09-03-telemetria-v2-plan-maestro.md)
y [microplan R0](../../../superpowers/plans/2026-09-03-telemetria-v1-retirada-r0.md).

## Identidad

- Candidato examinado: `2abd32f9a1348c6acb8cdf3d2f6e40807bc085e4`, rama `vantareapp/isa-962-redline-final-integration`, PR #969 draft a Nightly.
- Código del artefacto previo: `4864b5c6cd5bd8bc0f9b7279ac6f9a83e438253c`; el diff hasta `2abd32f9` no cambia `frontend/src`, `internal`, `cmd`, `go.mod` ni `frontend/package.json`.
- Checkout candidato conserva un cambio ajeno en `configs/calendar-lmu.json`; no se usa como writer ni se incorpora a esta entrega.
- Dos snapshots independientes y limpios, verificados con Git en `2abd32f9`: `C:\tmp\vantare-v1-removal-map-20260903` y `C:\tmp\vantare-v1-rollback-map-20260903`.

## Fronteras comprobadas por el orquestador

Rutas relativas a la raíz de aplicación de ese SHA. Las líneas son localizadores,
no una promesa de vigencia después de los cortes.

| Ruta/símbolo | Hecho y consecuencia para el plan |
| --- | --- |
| `internal/app/telemetry_core_runtime.go:1037`, `overlayV1Emit` | La construcción `overlayprojection.ProjectV1(final)` sigue condicionada por flag. La proyección Strategy de la línea 1051 es independiente: no borrar todos los `ProjectV1`. |
| `internal/app/telemetry_core_runtime.go:1518` | Sigue publicándose status V1 bajo el mismo flag; retirar sólo la snapshot deja otra ruta legacy. |
| `internal/app/overlay_v1_emit.go`, `cmd/vantare/main.go:2123`, `internal/app/settings_service.go:230` | Persistencia, override `VANTARE_OVERLAY_V1_EMIT` y wiring aún permiten V1. El ejecutable final debe perder el retorno interno; no basta con default false. |
| `frontend/src/overlay/core/widget-definition.ts`, `WidgetTypeDefinition` | `buildViewModel` todavía exige `TelemetrySnapshot`; builders de runtime/preview también la mencionan. La definición de Pedals importa su builder legacy aunque la autoridad visual productiva sea V2. |
| `frontend/src/overlay/core/WidgetVisualHost.tsx:188` | La rama `harnessMode && snapshot` consume builders legacy; la rama auxiliar usa su autoridad explícita. Retirar pruebas/harness a ciegas pierde escenarios, no demuestra migración. |
| `frontend/src/overlay/core/telemetry-rate-coordinator.ts:25` | Sigue existiendo `publish(snapshot: TelemetrySnapshot)` y publicación al derived store; el coordinador también necesita evaluación de consumidores V2 antes de cualquier eliminación de archivo. |
| `internal/app/telemetrytransport/overlay_pull.go:59,132` | El constructor requiere Hub + registry; `currentEvents` lee replay del Hub V1 y del publisher V2. Conservar lifecycle/ACK/retirada de generaciones mientras se separa la fuente legacy. |
| `frontend/src/telemetry-transport/overlay-wails-pull.ts:1-12` | Permite tres nombres V1 y dos V2, con contadores separados. Sus tests aún ejercitan entrega V1 y deben proteger las garantías equivalentes V2. |
| `internal/server/server.go:235-248` | Se registran rutas Overlay legacy, Strategy y Overlay V2 por separado. La implementación compartida está en `internal/app/telemetrytransport/adapters.go`, no en un supuesto `sse.go`. |
| `internal/app/telemetrytransport/adapters.go:58,109` | `SSEHandler` sirve Hubs compartidos; `PublisherSSEHandler` atiende V2 y controla consumer lifecycle. No borrar todo SSE para retirar una ruta. |
| `internal/app/overlay_v1_guard_test.go`, `frontend/src/overlay/core/v1-authority-guard.test.ts` | Congelan construcción/allowlist V1 y uso sólo harness. Sustituir expectativas de coexistencia por ausencia sin quitar negativos ni pruebas semánticas útiles. |

**KEEP provisional:** Core y publisher V2; contratos independientes de
Engineer/Strategy/recording; infraestructura compartida mientras sus consumidores
la necesiten; escenarios/regresiones útiles y evidencia histórica.

**MIGRATE:** definiciones/builders/fixtures que arrastran `TelemetrySnapshot`,
harnesses necesarios, pull mixto y assertions que dependen de la forma legacy.

**DELETE condicionado:** ramas exclusivas de construcción/publicación/status V1,
tipos/adapters/shadow exclusivos y switches de retorno, una vez resueltos sus
consumidores. Esta clasificación por fronteras no acredita aún cero importadores.

## Artefacto de rollback localizado, no restaurado

Ruta exacta:
`C:\tmp\vantare-redline-integration\vantare-v2\vantare-v2\bin\vantare-redline-rfix4-4864b5c6.exe`.

- SHA256 recalculado por main y worker: `cb69a4d56ca7cb59078cb7bd7e223b33c34aa927ec808c2e49154386b878faba`.
- Commit de código verificable en Git: `4864b5c6cd5bd8bc0f9b7279ac6f9a83e438253c`.
- Atestación existente: `C:\tmp\vantare-s3-gate\results\s3-final-attestation-rfix4-20260903.json`, SHA256 `8a4f9ece31c109dd162eaca8892a6d24613d8c03d4791b8ceac2680bc2ff0c0f`.
- Su procedencia registra el mismo path/hash, candidateHead `c13b8888` y evidencia S3 de cinco perfiles. No prueba memoria global, retirada V1 ni rollback funcional.
- No se ha copiado, ejecutado, instalado ni distribuido el exe en esta exploración.

`scripts/bench/build-measurement.ps1` genera frontend y configuración mediante
el procedimiento existente, conserva CDP y no usa `-tags production`. Leer ese
script no autoriza leer `.env*` ni anunciar una build diagnóstica como benchmark
de producción. No se ejecutó.

## Revisión de los resultados de workers

Muse `ses_f97dbe79fffexMAi0IEDDID27H` localizó fronteras V1; main contrastó las
anteriores en código. **No se acepta** su propuesta de reimponer los viejos gates
Cut 2/S1–S5 ni usar cifras antiguas como estado actual. Tampoco se acepta borrar
carpetas por nombre o un adapter/tipo antes de resolver importadores. El informe
citaba `telemetrytransport/sse.go`, inexistente en esta base; ruta corregida arriba.

Muse `ses_f97dbe353ffehpum1nA3FSjGzb` comprobó artefacto y describió persistencia
y empaquetado. Main verificó hash, atestación, procedencia y código de build de
medición. La compatibilidad de perfiles/datos, runtime auxiliar e instalación
queda por cerrar en R0. No se incorpora una reinstalación NSIS/release al alcance.

Ambos snapshots permanecen limpios. No se ejecutaron tests, builds, benchmarks,
apps ni pruebas físicas en esta exploración. La aprobación del maestro autoriza
preparar este microplan, no afirmar que V1 ya esté eliminada o V2 auditada.
