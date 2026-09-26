# ISA-1347 — reproducción read-only de fallos en base

Fecha: 2026-09-23. Base comprobada: `8b25d076ea9a6ba6be8dc3065bcde978b6d24f07`. Checkout: `/Users/isaacalbala/Desktop/vantare-widgets-release-audit/vantare-v2`. Plataforma: Darwin arm64, Go1.25.0. Veredicto: **los tres grupos de fallos solicitados ya se reproducen en la base**, con los mismos mensajes que el log de integración. No son regresiones demostradas de ISA-1347.

Comando ejecutado desde la base:

```sh
go test -timeout 30s ./internal/telemetry/diagnostics ./internal/telemetry/recording/sqlite ./internal/app/launcher
```

Resultado real del comando Go: **exit1**. Log completo: `/tmp/isa1347-base-platform.log`. Comparado con `/tmp/isa1347-go-final.log`. La ruta correcta del launcher es `internal/app/launcher`, no `internal/launcher`.

| Paquete / pruebas | Reproducción en base | Coincidencia integración |
|---|---|---|
| `internal/telemetry/diagnostics` | 12 pruebas principales fallan al crear CaptureManager: `invalid diagnostic raw capture configuration`; incluye los8 subcasos de procedencia de `TestRawCaptureRequiresClosedNonPIIProvenance`. | Mismos12 nombres, mismas líneas y mismo mensaje; solo cambian rutas temporales. |
| `internal/telemetry/recording/sqlite`, `TestCrashBoundariesPreserveManifestTruthAndRecoveryCopy` | Fallan `before_append`, `before_commit`, `after_commit_before_manifest`, `after_manifest_replace`; `store_test.go:714`: `RecoverCopy() error = recording session is active`. | Los mismos4 subcasos y mensaje. |
| SQLite, `TestManifestAndDatabaseUsePrivatePermissionsWhereSupported` | `store_test.go:1145`: `history-v1.sqlite permissions = -rw-r--r--, want private`. | Idéntico mensaje/permisos observados. |
| Launcher, `TestRunChainDoneEventHasSuccessField` | `chain_test.go:193`: `expected chain:done.Success to be true when all steps succeed`. | Idéntico fallo. |
| Launcher, `TestRunChainExecutesAllSteps` | `chain_test.go:244`: `expected at least 6 step events, got 2`. | Idéntico fallo. |
| Launcher, `TestRunChainCancellable` | Timeout30s, goroutine en `chain_test.go:270`, tras mensajes `profile not found`. | Integración termina por timeout90s en la misma prueba y línea. Se redujo el límite deliberadamente a30s según encargo; no se afirma igualdad de duración. |

Pruebas principales de diagnóstico que fallan en ambas ejecuciones:

- TestRawCaptureDisabledByDefaultAndSingleActive
- TestRawCaptureCopiesInputAndCompletesAtomically
- TestRawCaptureRequiresClosedNonPIIProvenance
- TestRawCaptureRateSizeAndSlowConsumerNeverBlock
- TestRawCaptureConcurrentOfferIsBounded
- TestRawCaptureStopsAtDurationLimitWithoutFrames
- TestRawCaptureDoesNotResumePartialCapture
- TestRawCaptureCleanupOnlyRemovesExpiredCaptureDirectories
- TestRawCaptureCleanupEventuallyRemovesCrashOrphans
- TestRawCaptureCleanupNeverFollowsSymlink
- TestNewCaptureManagerCreatesMissingRootUnderStableParents
- TestRawCaptureFilesArePrivate

No se editó código/producto ni se cambiaron permisos, entorno de temporales o configuración para lograr un resultado distinto. El estado Git antes/después mantiene únicamente el directorio no rastreado preexistente `docs/analysis/2026-09-23-accepted-widgets-data-audit/`; no hay cambios rastreados creados por esta verificación.

Límites: esta comparación acredita preexistencia en este host y esta base, no diagnostica definitivamente la causa de plataforma ni autoriza ignorar fallos futuros. No certifica Windows/LMU físico. Los dos fallos de app diagnostics ya comprobados por root no se duplicaron. No se investigaron aquí los otros paquetes fallidos del log global (cmd/server/voiceinput/telemetry/replay/LMU).
