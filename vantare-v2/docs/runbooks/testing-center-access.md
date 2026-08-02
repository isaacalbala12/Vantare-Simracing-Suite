# Testing Center access (`testing-center.v1`)

## Alcance

La migración `20260802140000_testing_center_access.sql` añade la fuente
server-side de roles, cinco políticas RLS de lectura y una única RPC para votar
una candidata. No añade UI, Edge Functions, GitHub, Codex, Discord o deploy.

`testing_center_memberships` liga `auth.users.id` con un `actor_id` opaco y uno
de los roles `tester`, `primary_tester` u `owner`. Solo `service_role` administra
esa tabla. Los clientes no envían ni pueden modificar su rol.

## Matriz mínima

| Actor | Reportes/evidencia | Nightly | Testers | Escritura directa |
| --- | --- | --- | --- | --- |
| tester | Solo propios | No | Ver y validar | No |
| primary_tester | Solo propios | Ver y validar | Ver y validar | No |
| owner | Todos | Ver y validar | Ver y validar | No |
| inactivo/anon | Nada | No | No | No |

Las validaciones pasan exclusivamente por
`testing_center_validate_candidate(...)`. La RPC deriva identidad y rol desde
`auth.uid()`, bloquea la candidata, exige channel/SHA exactos, rechaza
auto-validación, comprueba pausa global/por flujo, registra idempotencia y
auditoría, y actualiza candidata e issue en la misma transacción. El digest de
la operación se calcula dentro de PostgreSQL a partir del voto verificado; no
se acepta un hash suministrado por el cliente.

La tabla cruda de validaciones no se expone a `authenticated`: el estado
visible se obtiene de la candidata y la RPC solo devuelve el resultado del voto
actual, evitando enumerar UUID internos de otros testers.

## Verificación local

Desde la raíz Git, con Docker disponible:

```powershell
& .\supabase\tests\run-testing-center-access-postgres.ps1
```

La salida válida confirma cuatro gates: core 72, access 56, rollback que
restaura el core 72 y segunda aplicación access 56, además de la carrera
idempotente. El runner utiliza un
PostgreSQL Supabase desechable con nombre y clave aleatorios y lo elimina en
`finally`.

No ejecutar contra la instancia compartida ni usar `supabase db reset`.

## Rollback

`supabase/rollbacks/20260802140000_testing_center_access.down.sql` elimina las
cinco policies, revoca los grants de lectura, elimina las tres funciones y borra
la tabla de memberships. Las diez tablas TAU-02B permanecen intactas y vuelven
al estado server-only con RLS forzada y cero policies.
