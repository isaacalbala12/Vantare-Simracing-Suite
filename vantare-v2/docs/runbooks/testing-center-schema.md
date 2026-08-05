# Testing Center schema (`testing-center.v1`)

## Alcance

La migración `20260802130100_testing_center_core.sql` crea persistencia aditiva
y solo servidor para reports, evidencia, issues técnicas, ejecuciones Codex,
candidatas, validaciones, promociones, auditoría, idempotencia y pausas. No crea
RPCs ni ejecuta transiciones: la máquina de estados continúa en Go/orquestador.

Todas las tablas nacen con RLS habilitado y forzado, cero policies y sin
privilegios para `PUBLIC`, `anon` o `authenticated`. Solo el owner técnico con
`BYPASSRLS` y `service_role` conservan acceso directo.

Las constraints ligan validaciones y promociones a candidata, canal y SHA
exactos; una ruta de promoción solo puede registrarse una vez. Las operaciones
idempotentes que atraviesan estados sensibles exigen SHA, mientras que
`needs_owner` y `stopped` conservan la excepción fail-closed del contrato Go.
Una promoción `authorized`/`completed` exige una identidad humana completa y
no puede superar un `CHECK` mediante valores `NULL`.

## Verificación local obligatoria

Desde la raíz Git, con Docker disponible:

```powershell
& .\supabase\tests\run-testing-center-postgres.ps1
```

El runner usa exclusivamente un PostgreSQL Supabase desechable con nombre y
clave aleatorios. Aplica todo el historial, ejecuta pgTAP, aplica el rollback,
confirma ausencia, vuelve a aplicar el `up` y repite pgTAP. El contenedor se
elimina en `finally` incluso si falla.

La salida válida incluye 72 pruebas pgTAP en cada aplicación del esquema.

No ejecutar este corte contra una instancia compartida y no usar
`supabase db reset`.

## Rollback local

`supabase/rollbacks/20260802130100_testing_center_core.down.sql` elimina solo
los diez objetos de este corte y en orden inverso de dependencias. El rollback
borra sus datos; requiere una decisión operativa separada antes de cualquier
uso fuera del runner desechable.
