# Testing Center — feedback de candidatas y decisión del owner

Estado: TAU-07G validado localmente en ISA-241. No desplegado.

## Propósito y frontera

Este corte persiste el feedback funcional de una build exacta y convierte un
rechazo en una decisión explícita de Isaac. La identidad canónica siempre es
`issue técnica + candidateId + canal + versión + SHA`; un voto de otra build no
se reutiliza.

No añade endpoint, UI, red, PostHog, Discord, llamada a Linear, ejecución de
Codex, rama, PR, deploy, merge ni promoción. La disposición del owner tampoco
delega por sí sola: una corrección queda `needs_owner` hasta un handoff humano
posterior.

## Autoridad y roles

- Nightly: solo `primary_tester` u `owner`; una aceptación válida basta.
- Testers: cualquier tester autorizado puede validar.
- `cannot_verify`: conserva evidencia, pero deja candidata y gate pendientes.
- El autor de la candidata no puede validarla.
- Solo un `owner` activo registra la disposición posterior a un rechazo.
- El actor y su rol se resuelven server-side; no son autoridad por venir en el
  JSON del cliente.

Una aceptación satisface únicamente el gate funcional. No crea registros de
promoción. En Testers, un rechazo autorizado posterior a una aceptación
rechaza la candidata exacta, bloquea cualquier promoción pendiente/autorizada
y lleva la issue a `needs_owner`.

## Persistencia privada

La migración
`supabase/migrations/20260803120000_testing_center_candidate_feedback.sql`
añade tres tablas con RLS forzada:

- `testing_center_validation_snapshots`: voto inmutable, identidad exacta,
  proyección sanitizada y digests de transporte/replay.
- `testing_center_codex_dossier_snapshots`: revisiones `incomplete` y
  `complete` del expediente determinista; ambas permanecen auditables.
- `testing_center_owner_dispositions`: una decisión explícita e inmutable por
  rechazo.

`authenticated` no puede enumerar estas tablas. `service_role` tiene lectura y
solo muta mediante RPC revisados. El RPC legacy de validación directa queda
revocado para evitar saltarse la proyección cerrada.

No se almacena el payload crudo del tester. El backend recibe exclusivamente
la proyección sanitizada `testing-center.rejection.v1`, con límite de 32 KiB y
sin URL de replay, token, ruta local ni instrucción ejecutable.

## Integridad e idempotencia

`testing_center_record_validation_projection` verifica forma exacta,
candidate/channel/version/SHA, membership, rol, pausa, replay key y SHA-256 del
JSON canónico. Un actor solo puede emitir un voto por candidata y SHA. El mismo
voto es idempotente; intentar mutarlo falla cerrado.

`testing_center_record_codex_dossier` verifica:

1. JSON canónico y digest de transporte;
2. fuente exacta con `dossierDigest` vacío y su SHA-256;
3. digest embebido, flags de no retry/merge/deploy/promoción y binding con el
   rechazo, candidata, sub-issue, rama y Nightly SHA.

La capa TypeScript aplica además
`verifyTestingCenterCodexDossier`; no se debe persistir un expediente generado
o alterado fuera de ese verificador. Un dossier `incomplete` es durable pero no
delegable.

## Cinco disposiciones del owner

La allowlist cerrada es:

1. `create_correction_subissue`: sub-issue y rama nueva desde Nightly.
2. `environment_issue`: problema del entorno.
3. `create_separate_issue`: incidencia distinta.
4. `dismiss_with_reason`: descarte justificado.
5. `stop_rollout`: detener el rollout.

`same_branch` está retirado y falla en el límite RPC. La corrección exige un
dossier `complete`, sub-issue, rama `vantareapp/isa-*` y SHA de Nightly que
coincidan exactamente. Incluso entonces la issue permanece `needs_owner`: no
se crea trabajo, rama ni ejecución automáticamente. Las otras cuatro
disposiciones dejan este rollout `stopped` y no afectan a otros candidatos.

Una corrección rechazada en Testers parte de Nightly y debe recorrer de nuevo
Nightly y Testers con candidata y votos nuevos.

## Verificación local

```powershell
$tests = (Get-ChildItem supabase/functions/_shared/testing-center-*.test.ts).FullName
deno test --no-lock $tests
& .\supabase\tests\run-testing-center-candidate-feedback-postgres.ps1
git diff --check
```

Resultado de ISA-241: Deno Testing Center 99/99. PostgreSQL: instalación
limpia 45/45, rollback sin historial, reaplicación 45/45, rechazo del rollback
con historial y carrera real de dos procesos exactly-once PASS.

El runner usa un único contenedor PostgreSQL temporal y lo elimina al cerrar;
no necesita mantener Supabase o Docker activos después de la prueba.

## Rollback

`supabase/rollbacks/20260803120000_testing_center_candidate_feedback.down.sql`
exige pausa global y cero historial nuevo. Si existen votos, dossiers o
disposiciones, se niega a borrar evidencia. Sin historial, restaura el contrato
de TAU-07F, incluidos el enum y permisos anteriores del RPC legacy.

## Siguiente gate

TAU-07H1 valida privacidad de PostHog antes de exponer consentimientos. TAU-07H2
conecta la pestaña Testing Center a estos contratos. TAU-07I es el primer piloto
remoto Supabase -> Linear y requiere credencial, deploy y autorización expresa
de Isaac. Ninguno de esos pasos queda autorizado por ISA-241.
