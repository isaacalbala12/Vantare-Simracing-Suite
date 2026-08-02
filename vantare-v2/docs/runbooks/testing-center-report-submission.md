# Testing Center — envío de reportes v1

Estado: TAU-04A / ISA-218 implementado en rama de issue, sin UI, bridge Wails,
GitHub, Codex, Discord, migración remota ni deploy.

## Frontera del corte

La migración `20260802150000_testing_center_report_submission.sql` añade tres
tablas privadas y una RPC autenticada. El cliente solo puede ejecutar
`testing_center_submit_report(...)` y leer sus propios payloads normalizados;
un owner puede leerlos para revisión. Ningún cliente autenticado recibe DML
directo sobre reportes, payloads, claves idempotentes o auditoría.

La RPC deriva `auth.uid()`, `actor_id`, rol y autorización de canal desde la
membresía server-side. Un tester normal solo reporta en `testers`; un
`primary_tester` u owner también puede reportar en `nightly`.

## Contrato de entrada

El formulario futuro deberá enviar:

- contrato `testing-center.v1` y canal de la build;
- acción, resultado esperado y resultado observado, todos obligatorios;
- contexto opcional, versión, Windows, versión de OS y módulo permitido;
- consentimiento de diagnóstico y consentimiento de logs por separado;
- bytes JSON exactos del preview, su SHA-256 y una clave idempotente estable.

Si no hay consentimiento de diagnóstico, payload y digest deben ser `NULL`. Si
hay diagnóstico, PostgreSQL verifica el SHA-256 de los bytes recibidos antes de
parsearlos, exige el shape cerrado de `testing-center.diagnostic.v1`, tipos
explícitos, antigüedad máxima, límites de logs y contadores coherentes. Solo se
persiste el JSON normalizado; los bytes crudos no se conservan.

## Idempotencia y privacidad

La operación se representa como JSONB tipado y canónico antes de calcular su
digest. Una advisory lock por usuario y clave serializa retries concurrentes.
El mismo payload devuelve el reporte original; reutilizar la clave con contenido
distinto falla con conflicto y no crea efectos parciales.

Este corte evita duplicados de transporte, no decide si dos claves diferentes
describen el mismo bug. TAU-04B debe conservar la clave al reintentar un draft y
TAU-05 deberá aplicar fingerprinting/triage antes de crear una issue técnica.

El texto libre sigue pudiendo contener PII semántica que ninguna regex reconoce.
TAU-04B/04C deben mantener diagnóstico y logs desactivados por defecto, mostrar
el preview exacto y permitir descartarlo antes del envío.

## Verificación local obligatoria

Desde la raíz Git, con Docker disponible:

```powershell
& .\supabase\tests\run-testing-center-report-submission-postgres.ps1
```

El runner crea un PostgreSQL Supabase desechable, aplica core y acceso, ejecuta
72 + 56 + 55 pruebas pgTAP, revierte solo TAU-04A, vuelve a comprobar acceso,
reaplica el corte y ejecuta dos envíos concurrentes. El resultado válido termina
en `concurrent exactly-once PASS`. El contenedor se elimina en `finally`.

No ejecutar este corte contra una instancia compartida ni usar
`supabase db reset`.

## Rollback

`supabase/rollbacks/20260802150000_testing_center_report_submission.down.sql`
revoca y elimina la RPC, policies y tres tablas de TAU-04A. TAU-02A/02B/02C y
TAU-03 permanecen intactos. El rollback elimina reportes ya enviados y por ello
requiere una decisión humana antes de cualquier entorno persistente.
