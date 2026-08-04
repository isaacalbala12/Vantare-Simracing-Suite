# Testing Center — webhook Linear y reconciliación

Estado: TAU-07F validado localmente en ISA-240. No desplegado.

## Propósito y frontera

Este corte acepta hechos autenticados de Linear y mantiene una vista
**observacional**. Supabase continúa siendo la autoridad canónica. Un webhook
nunca asigna Codex, prepara un dossier, crea/reabre ramas, aprueba una PR ni
promueve `nightly`, `testers` o `master`.

No existe todavía endpoint público, secreto real, llamada a Linear ni deploy.
TAU-07I debe conectar el verificador y los RPC tras un gate humano de Isaac.

## Contrato de entrada

La documentación oficial de Linear define:

- `Linear-Delivery`: UUID v4 único de la entrega.
- `Linear-Event`: debe ser exactamente `Issue` para este flujo.
- `Linear-Signature`: HMAC-SHA256 hexadecimal sobre los bytes exactos del body.
- `Linear-Timestamp`: Unix epoch en milisegundos; tolerancia local máxima de
  60 segundos y coincidencia exacta con `webhookTimestamp`.

Referencia: <https://linear.app/developers/webhooks>.

`testing-center-linear-webhook.ts` verifica la firma antes de parsear. Acepta
solo `create`, `update` y `remove`; limita el body a 256 KiB; exige UUIDs y
UTF-8/JSON válidos. La salida se reduce a IDs, acción, timestamps, state ID y
SHA-256 del body. Actor, nombres, texto del issue, body y firma no salen de esa
frontera ni se persisten.

Un `create` exige state ID. Un `update` sin state ID es una edición no
operativa y queda `ignored`. Si `stateId` y `state.id` llegan juntos deben ser
idénticos.

## Persistencia privada

- `testing_center_linear_issue_bindings`: une un issue externo con exactamente
  una issue técnica y su efecto Linear seleccionado.
- `testing_center_linear_state_mappings`: allowlist por UUID de organización y
  UUID de estado. Los nombres enviados por Linear no deciden nada.
- `testing_center_linear_webhook_deliveries`: ledger durable por delivery ID;
  conserva solo metadata allowlisted y digest.
- `testing_center_linear_reconciliations`: vista observada con watermark de
  orden y generación. No es un estado canónico de ejecución.

Las cuatro tablas fuerzan RLS. `authenticated` no tiene acceso. `service_role`
solo lee las tablas y muta mediante tres RPC revisados.

## Estados observados

La allowlist cerrada es:

`linear_created`, `awaiting_owner`, `codex_in_progress`, `pr_in_review`,
`needs_changes`, `stopped`.

El vínculo inicial se observa como `linear_created`. `create` conserva ese
estado; `remove` se observa como `stopped`; un `update` solo puede adoptar el
estado asociado al UUID en el mapa server-side. Un UUID desconocido queda
`needs_owner` y no cambia el estado observado.

## Replay, orden y concurrencia

- Mismo delivery ID y mismo digest: `duplicate`, sin segunda aplicación.
- Mismo delivery ID y digest distinto: conflicto y rollback de la transacción.
- Timestamp menor o igual al watermark: `stale`, sin cambio de estado.
- Una entrega fresca ignorada o desconocida avanza el watermark para impedir
  que un evento antiguo se aplique después.
- La fila de binding se bloquea durante reconciliación. Dos procesos pueden
  competir, pero el mayor `webhookTimestamp` determina el estado final.

Todos los outcomes quedan en el ledger salvo duplicados exactos, que reutilizan
la fila original. Ningún outcome dispara otro efecto.

## Orden futuro de activación

1. Isaac confirma organización, webhook y UUIDs reales de los estados Linear.
2. Registrar mappings mediante `testing_center_upsert_linear_state_mapping`.
3. TAU-07I añade un endpoint HTTPS que lea el body una sola vez como bytes,
   extraiga los cuatro headers y llame al verificador.
4. Solo tras firma válida, pasar la proyección cerrada al RPC de reconciliación.
5. Responder dentro del límite de Linear; retries siguen siendo seguros por el
   delivery ID.
6. Probar un issue sintético con integración pausada antes de aceptar tráfico
   de testers.

El secreto se guarda únicamente en el secret manager del entorno. Nunca se
incluye en variables cliente, logs, errores, tablas o documentación.

## Verificación local

```powershell
$tests = (Get-ChildItem supabase/functions/_shared/testing-center-*.test.ts).FullName
deno test $tests
& .\supabase\tests\run-testing-center-linear-webhook-postgres.ps1
git diff --check
```

Resultado de ISA-240: Deno Testing Center 98/98. PostgreSQL: instalación
limpia, 27/27, rechazo de rollback con historial, rollback sin historial,
reaplicación 27/27 y carrera real de dos procesos PASS.

La suite Deno global requiere instalar el paquete existente
`npm:standardwebhooks` en un worktree nuevo. ISA-240 no instala ni modifica
dependencias; esta limitación no afecta la suite completa de Testing Center.

## Rollback

`supabase/rollbacks/20260803110000_testing_center_linear_webhook.down.sql`
exige pausa global y cero bindings, mappings o deliveries. No elimina historial
observacional silenciosamente. El rollback conserva las tablas y RPC de
ISA-239.
