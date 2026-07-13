# TC-01A — Simulación de merge y ownership

## Simulación ejecutada

Refs fijadas:

- ours/base de integración: `refactor@9712d993fa0099beeaac6616899b30b3c4261bae`
- theirs/donante: `codex/engineer-release@91cf7e9323bd53edbf1d554d2d32f3f4fd748c82`
- merge-base: `b58917c028f1b11915e99b1bdef770e8b2cdb655`

Comandos read-only:

```powershell
git merge-tree --write-tree refactor codex/engineer-release
git merge-tree (git merge-base refactor codex/engineer-release) refactor codex/engineer-release
```

`git merge-tree --write-tree` terminó con código 1 porque detectó dos conflictos de contenido. No se ejecutó `git merge`, no se actualizó el índice y no se modificó el working tree.

## Decisiones aprobadas

- **MC-1 — APROBADA por Isaac el 2026-07-14.** La resolución vinculante para ISA-25 es conservar y combinar los tests deterministas de Engineer con los tests de seguridad PowerShell de `refactor`, sin sustituir, debilitar ni perder cobertura existente.
- **MC-2 — APROBADA por Isaac el 2026-07-14.** La resolución vinculante para ISA-25 es conservar íntegramente el hardening y runtime de `refactor` e incorporar únicamente el endpoint health procedente de Engineer. Queda prohibido introducir un segundo router, lifecycle, servidor o estado paralelo.

Estas aprobaciones cierran la decisión humana sobre la composición, pero no autorizan un merge en ISA-23. ISA-25 deberá materializar las resoluciones, aportar el diff y ejecutar sus checks antes de cualquier commit de merge.

## Inventario completo de conflictos

| Ruta | Tipo | Aporte `refactor` | Aporte Engineer Release | Owner | Resolución propuesta para ISA-25 | Riesgo | Tests necesarios | Decisión humana |
|---|---|---|---|---|---|---|---|---|
| `vantare-v2/internal/engineer/audio/player_test.go` | content/content; ambas ramas modifican el mismo bloque de tests | Añade tests de seguridad para escapar comillas, construir el script PowerShell y codificarlo en Base64 UTF-16LE; conserva pruebas que dependen de audio/cache local | Sustituye las pruebas dependientes del entorno por `RecorderPlayer`, con parada y orden deterministas | ENGINEER | Conservar y combinar los tests deterministas de Engineer con los tests de seguridad PowerShell de `refactor`, sin sustituir, debilitar ni perder cobertura existente. No restaurar dependencia obligatoria de un MP3 real. La implementación productiva no cambia en TC-01C. | Medio: perder los tests de inyección o reintroducir flakiness de hardware/cache | `go test ./internal/engineer/audio/... -count=1`; en Windows, incluir las pruebas de `escapePSQuote`, `buildPSScript` y `encodePSCommand`; revisar también build-tag no Windows | **APROBADA — MC-1.** Isaac, 2026-07-14. Falta materializar el diff y obtener suite verde en ISA-25; eso bloquea el commit de merge, no la decisión. |
| `vantare-v2/internal/server/server.go` | content/content; ambas ramas añaden rutas al mismo constructor y código al final del archivo | Endurece servidor loopback, nonce/rate limit/auth, security headers, `/api/profile-v3` y listener real | Añade `GET /api/engineer/health` y su handler sobre `EngineerService.Health()` | SHARED | Partir del archivo de `refactor`, conservar íntegramente su hardening y runtime, y añadir únicamente la ruta/handler de health de Engineer. No introducir un segundo router, lifecycle, servidor o estado paralelo; no diseñar Telemetry Core ni cambiar payloads SSE/Wails. | Alto: una elección unilateral puede perder seguridad/auth/runtime Overlay o diagnóstico Engineer | `go test ./internal/server/... -count=1`; pruebas de auth/nonce/loopback existentes; `TestEngineerHealth`/health 200-503; smoke de `/telemetry/stream` y `/engineer/stream` en ISA-24/25 | **APROBADA — MC-2.** Isaac, 2026-07-14. Faltan baseline dinámico ISA-24, diff resuelto y tests server en ISA-25; eso bloquea el merge real, no la decisión. |

## Resultado cuantitativo

- Conflictos detectados por `merge-tree`: 2.
- Conflictos sin owner: 0.
- Archivos SHARED tratados unilateralmente: 0.
- Conflictos de Overlay/renderizadores/diseño visual: 0.
- Merge real realizado: no.

## Cambios que se auto-integrarían pero requieren auditoría posterior

La ausencia de conflicto textual no equivale a compatibilidad arquitectónica. El diff exclusivo de Engineer contiene 165 archivos y 36.089 inserciones/237 eliminaciones. En particular:

- `internal/engineer/service/engineer_service.go` arranca con `source: "simulator"` y ejecuta escenarios sintéticos en producción.
- `internal/app/telemetry_source_manager.go` mantiene fallback productivo a `createMockSource()`.
- `internal/engineer/service/overlays_live_adapter.go` reutiliza el buffer de Overlay, pero `cmd/vantare/main.go` no llama `SetBufferProvider` ni selecciona `lmu`; el adaptador no queda cableado en el runtime auditado.
- `internal/engineer/lmu/extended_reader.go` y `pitinfo_reader.go` pueden abrir shared memory independiente, pero la búsqueda de consumidores y la auditoría Engineer indican que no se instancian en producción. Se conservan como infraestructura a endurecer; no se activarán como segundo owner.
- `internal/engineer/pitmanager/client.go` crea otro cliente REST a `localhost:6397`, con acciones en dry-run por defecto, pero no tiene consumidor productivo encontrado.
- `internal/tts` y `AudioRouter` existen y tienen tests, pero no se instancian desde `cmd/vantare/main.go`; el servicio usa `NoopAudioResolver` salvo inyección externa.
- `frontend/src/hub/pages/EngineerPage.tsx` muestra `connected: true` y `source: "simulator"` como estado inicial, y ofrece simulator/replay en la UI. No debe llegar así al cutover productivo.

Estos hallazgos no se corrigen en TC-01A ni se usan para cambiar funcionalidad durante ISA-25. Su clasificación y destino están en `engineer-rescue-matrix.md`.

## Registro de decisiones y bloqueos

| ID | Estado y decisión | Evidencia faltante | Responsable | Issue | Condición de bloqueo |
|---|---|---|---|---|---|
| MC-1 | **APROBADA por Isaac el 2026-07-14.** Combinar la cobertura determinista Engineer y la cobertura de seguridad PowerShell de `refactor` sin sustitución, debilitamiento ni pérdida. | Diff de resolución y `go test ./internal/engineer/audio/...` en Windows | Worker ISA-25 prepara evidencia; Isaac ya decidió la composición | ISA-25 | La decisión está cerrada. No se puede commitear el merge hasta materializar el diff y obtener suite verde. |
| MC-2 | **APROBADA por Isaac el 2026-07-14.** Mantener íntegros hardening/runtime de `refactor` y añadir solo health de Engineer, sin router, lifecycle, servidor ni estado paralelo. | Baseline dinámico ISA-24, diff resuelto y tests server | Workers ISA-24/25 preparan evidencia; Isaac ya decidió la composición | ISA-24, ISA-25 | La decisión está cerrada. No se puede ejecutar/commitear el merge real hasta cerrar baseline y checks. |
| MC-3 | ¿Qué ref remota recibirá la rama apilada si los SHAs locales están por delante de `origin`? | Confirmación de que `refactor@9712d993...` es la base publicada deseada | Isaac | ISA-23 | No bloquea la documentación; bloquea cualquier rebase/force-push, que además están prohibidos. El push normal conserva la historia fijada. |

## Resoluciones expresamente prohibidas

- Elegir `ours` o `theirs` completo para `server.go`.
- Eliminar pruebas de seguridad para hacer verde el merge.
- Activar simulator, replay, mock, readers independientes o Pit Manager para “probar” la integración.
- Cambiar contratos públicos, estilos, renderizadores o comportamiento Overlay.
- Introducir Telemetry Core durante la resolución de conflictos.
- Ejecutar `git merge` antes de ISA-25 o interpretar MC-1/MC-2 como autorización de merge.
