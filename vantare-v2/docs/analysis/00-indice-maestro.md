# Auditoría Técnica Completa — Vantare v2

**Fecha:** 2026-07-06
**Alcance:** repositorio completo (frontend React 19 + Tailwind v4, backend Go + Wails v3, Supabase, Stripe Edge Function).
**Motivo:** el usuario quiere lanzar en 2 días y pide valorar viabilidad con una auditoría extensa de bugs (menores/medianos/bloqueantes), rendimiento y seguridad.
**Metodología:** lectura de docs de contexto + 4 subagentes revisores en paralelo (seguridad, rendimiento, bugs frontend, bugs Go) sobre el código REAL + verificación directa del orquestador de los puntos de mayor riesgo. Todo hallazgo tiene `archivo:línea` verificado contra el código actual, no contra documentos viejos.

## Veredicto de viabilidad a 2 días

- ✅ **Beta pública FREE (modo `v0.1.0.x` actual): VIABLE en 2 días.** Los bloqueantes de código son localizados y arreglables. La app arranca, el Hub funciona, el overlay live funciona para Free, y el gating free/paid ya está implementado.
- ❌ **Lanzamiento CON COBROS / monetización real: NO VIABLE en 2 días.** No es un bug de código: faltan piezas de infraestructura con dependencias externas (acceso a Supabase, Stripe test keys, deploy de webhook). Ver `05-veredicto-y-monetizacion.md`.

## Lo que ya está sólido (verificado, no tocar)

- `internal/license/service.go` maneja `info==nil`, normaliza `entitlements` null, cache con grace 24h, y `unconfigured` no bloquea.
- `internal/license/supabase_client.go` usa **solo anon key** (pública) — no hay service-role en el binario de escritorio.
- `pkg/config/profile.go` `SaveFile` es **atómico** (temp + `os.Rename`) — PROF-H1 ya resuelto.
- `cmd/vantare/main.go` `rebuildHotkeys` ya incluye `toggleEditMode` vía `buildHotkeyActionMap` — el P0-NEW del review adversarial ya corregido.
- `HubApp.tsx` `LicenseGate` maneja `anonymous`/`unconfigured`/`expired`/`device-limit` correctamente.

## Índice de archivos de esta auditoría

| Archivo | Contenido |
|---|---|
| `00-indice-maestro.md` | Este archivo (índice + veredicto + metodología). |
| `01-hallazgos-bloqueantes.md` | P0/P1: bugs, rendimiento y seguridad que bloquean el lanzamiento. |
| `02-hallazgos-medianos.md` | P2: medianos, corregir antes de release público de pago. |
| `03-hallazgos-menores.md` | P3: menores / deuda conocida, no bloquean. |
| `04-matriz-severidad.md` | Tabla resumen por severidad, categoría, nuevo vs ya documentado, archivo. |
| `05-veredicto-y-monetizacion.md` | Valoración de viabilidad a 2 días + plan de acción + riesgos de lanzamiento. |
| `06-plan-2-dias.md` | Plan concreto de trabajo para los 2 días (si se decide lanzar beta free). |

## Convenciones

- **NUEVO**: no aparecía en los docs previos (`technical-debt.md`, auditorías de `docs/`).
- **YA DOCUMENTADO**: coincide con un TD-xxx o hallazgo de auditoría previa (se confirma vigente en código actual).
- Severidad: `P0` bloqueante, `P1` grave, `P2` mediano, `P3` menor.
- Categoría: `BUG` / `PERF` (rendimiento) / `SEC` (seguridad).
