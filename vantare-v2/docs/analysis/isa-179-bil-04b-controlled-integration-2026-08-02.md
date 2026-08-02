# ISA-179 / BIL-04B — integración controlada de Billing

Fecha: 2026-08-02

Estado: composición materializada y matriz conjunta completa; pendiente de
commit de merge, push, PR draft y revisión independiente.

## Objetivo y límites

Crear una única base técnica que conserve BIL-02, BIL-03 y BIL-04 sin añadir
reconciliación, grants nuevos, estados comerciales, pagos, deploys ni mutaciones
remotas. Los conflictos se resuelven por contrato y ownership; nunca escogiendo
un lado completo por comodidad.

## Entradas exactas

- BIL-02 / ISA-68: `08bb83a959dee601ca5884fba6ac96b399c5e2bd`.
- BIL-03 / ISA-72: `2a6288a36e368b322e8262534988277d1e16025e`.
- BIL-04 / ISA-88: `eea8b760dc382c82c3f6b9f193782f9e1469b8d7`.
- Merge-base común de BIL-02 y BIL-04: `c6a3ebf2181e6764a1b204e231cab4a348e3ab95`.

BIL-03 ya es ancestro de BIL-04. La rama de integración parte exactamente de
BIL-04 y debe incorporar BIL-02 mediante un merge real para que los tres SHAs
sean ancestros verificables del resultado.

## Simulación previa

Se ejecutó `git merge-tree --write-tree` entre BIL-04 y BIL-02 antes de modificar
el worktree. BIL-04 cambia 65 rutas desde el merge-base y BIL-02 cambia 13. La
simulación detectó cuatro conflictos de contenido y ningún conflicto estructural
adicional:

| Ruta | Ownership | Resolución requerida |
|---|---|---|
| `supabase/functions/billing-webhook/process.ts` | Compartido | Conservar el inbox durable, leases, efectos reanudables, replay y minimización de BIL-02; conservar mapping v2, separación sandbox/production, customer keys y errores sanitizados de BIL-03/04. |
| `supabase/functions/billing-webhook/process.test.ts` | Compartido | Mantener las regresiones de ambos cortes y adaptar únicamente fixtures/expectativas necesarias para demostrar su interacción. |
| `vantare-v2/docs/current-plan.md` | Documentación aditiva | Anteponer el estado de ISA-179 y conservar completas las notas BIL-02, BIL-03 y BIL-04. |
| `vantare-v2/docs/vantare-program/handoffs/platform-commercial.md` | Documentación canónica compartida | Componer el estado, orden, contratos y riesgos; no restaurar estados históricos ya superados. |

## Rutas sin conflicto

Las nueve rutas exclusivas de BIL-02 pertenecen a BIL-02 y deben integrarse sin
reinterpretación: implementación y tests del inbox, migración, pgTAP del inbox,
README y runbook. Las rutas exclusivas de BIL-03/04 permanecen bajo BIL-03/04:
checkout/portal, auth/session, hardening de RPC/RLS, recovery, guards y workflow.

## Gates de resolución

- Ningún archivo se resolverá aceptando `ours` o `theirs` completo en los dos
  conflictos de runtime/tests.
- La composición de `process.ts` debe mantener el environment en lookup/upsert y
  el envelope durable antes de cualquier efecto.
- Se añadirá una regresión solo si la interacción environment + inbox no queda
  cubierta al componer las suites existentes.
- Clean, upgrade y restore deben aplicar las migraciones en orden de nombre y
  ejecutar conjuntamente pgTAP de checkout/auth y pgTAP del inbox.
- El resultado seguirá siendo NO-GO comercial y no se desplegará.

## Resolución materializada

- `process.ts` conserva el inbox durable como única autoridad de recepción y
  efectos, sin restaurar el claim prematuro mediante `license_events`.
- La resolución de usuario y el upsert de `billing_customers` quedan acotados al
  entorno del mapping Polar. No se persiste el email del webhook y los errores
  de base de datos permanecen sanitizados.
- Las suites conservan todos los casos de BIL-02/03/04 y añaden dos regresiones
  de interacción: resolución dentro del entorno configurado e independencia de
  un mismo customer entre sandbox y production.
- El pgTAP concurrente de BIL-02 deja de depender de un puerto y contraseña
  locales fijos. El runner crea un helper `dblink` privilegiado exclusivamente
  dentro de cada PostgreSQL desechable y lo recrea tras el restore; no existe en
  migraciones ni runtime.
- Las cuatro rutas documentales se compusieron sin perder contratos ni presentar
  la integración como autorización comercial.

## Evidencia conjunta

- Deno focal del webhook: 37/37.
- Deno global de Supabase Functions: 82/82; `deno check` de checkout, portal y
  webhook: PASS.
- PostgreSQL 17 en PowerShell 7 y Windows PowerShell 5.1: clean, upgrade y
  restore con 48 checks de hardening + 53 del inbox en cada fase; concurrencia
  de inbox y dispositivo: PASS; restore con centinela/RLS/grants: PASS; dumps
  truncado y corrupto: fail-closed.
- Go `authsession`, `server` y `license`: PASS; authsession y nonce OAuth durante
  50 repeticiones: PASS; `go vet` focal: PASS.
- Frontend auth focal: 103/103; suite global: 1624/1624; build: PASS; lint focal:
  PASS.
- Guards de superficie desplegable PowerShell y Deno: PASS.

No se observó ninguna incompatibilidad semántica adicional a los cuatro
conflictos simulados. No hubo deploy, pagos, PII, replay remoto, mutaciones de
Polar/Supabase ni promoción a una rama compartida.

## Rollback

Antes del merge, el rollback es volver al commit documental anterior. Después
del merge, Git conserva ambos padres; revertir el merge restaura BIL-04 sin
reescribir ni perder los SHAs aprobados.
