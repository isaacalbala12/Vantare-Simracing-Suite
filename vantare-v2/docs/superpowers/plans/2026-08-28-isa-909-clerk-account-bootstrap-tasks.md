# Tareas ISA-909: bootstrap de cuenta Clerk

Estado: T0-T7 completadas localmente. La segunda review Fable medio emitió
`ACCEPT`; quedan push, PR draft y CI, sin merge ni deploy.

## T0 — Aprobar SDD

Dependencias: ninguna.

Archivos:

- spec, plan y este listado;
- `docs/roadmap/plan.md`;
- `docs/vantare-program/handoffs/platform-commercial.md`.

Pasos:

1. regenerar el digest del roadmap y ejecutar `git diff --check`;
2. commitear el SDD inicial;
3. pedir a Fable (`claude-fable-5`, esfuerzo `medium`) revisión de seguridad,
   alcance y sobreingeniería con salida estructurada;
4. incorporar observaciones aceptadas y registrar decisiones rechazadas con
   motivo verificable;
5. repetir gates documentales y commit.

Aceptación: cero pregunta de producto abierta y cero hallazgo P0/P1 de Fable.

## T1 — Baseline y tests rojos SQL

Dependencias: T0.

Archivos máximos:

- migración creada por `supabase migration new clerk_account_bootstrap`;
- `supabase/tests/clerk_account_bootstrap_test.sql`;
- `supabase/tests/run-supabase-hardening-postgres.ps1`.

Pasos:

1. registrar `supabase --version` y consultar `supabase migration new --help`;
2. correr el hardening actual;
3. añadir al harness el shim `auth.jwt()` sobre `request.jwt.claims` y fijar
   issuer, subject y role como JSON;
4. escribir pgTAP para permisos, legacy, Clerk nuevo/repetido/distinto, claims
   inválidos y ausencia de selección de cuenta por el cliente;
5. incluir un issuer externo con subject UUID coincidente con `auth.users`;
6. añadir una carrera PowerShell de dos sesiones con mismo issuer/subject;
7. demostrar que los nuevos casos fallan por ausencia del resolver.

Aceptación: rojo objetivo reproducible; baseline previo separado.

## T2 — Mapping y resolver SQL

Dependencias: T1 rojo.

Mismos archivos que T1.

Pasos:

1. crear `account_identities` con RLS y PK `(issuer, subject)`;
2. revocar acceso de tabla a `anon`/`authenticated`;
3. retirar la FK de `profiles.id` a `auth.users.id` por nombre descubierto en
   catálogo, sin asumir un nombre inventado;
4. crear esquema/helper privado y fijar owner/search_path/privilegios;
5. resolver legacy solo para issuer `/auth/v1` + `sub` UUID existente en
   `auth.users`; resolver cualquier otro issuer por `(issuer, subject)`;
6. tomar advisory transaction lock por identidad, reconsultar y crear una vez;
7. pasar la cuenta resuelta a claim/read/reset/get de licencia;
8. incluir precheck y SQL de rollback comentado.

Tests:

- pgTAP completo;
- carrera concurrente;
- restauración de fixtures del runner.

Aceptación: misma identidad -> mismo UUID; identidades distintas -> UUID
distinto; direct grants/table access denegados; suite verde.

## T3 — Tests rojos Edge

Dependencias: T2 verde.

Archivos:

- `supabase/functions/license-credential/index.test.ts`;
- `supabase/functions/license-credential/index.ts`;
- `supabase/config.toml`.

Pasos:

1. caracterizar el handler actual con UUID Supabase;
2. añadir caso rojo Clerk `user_...` que espera subject UUID resuelto;
3. añadir casos accountId vacío/no UUID, body con identidad y fallo RPC;
4. añadir rechazo TPA/401 separado de indisponibilidad/503;
5. añadir contrato de config `verify_jwt=false`.

Aceptación: fallos nuevos explican exactamente la dependencia de `auth.userId`.

## T4 — Resolver cuenta en Edge

Dependencias: T3 rojo.

Mismos archivos que T3.

Pasos:

1. extraer el bearer sin `getUser()` Clerk ni verificación JWT paralela;
2. hacer que `CredentialStore.load` resuelva y devuelva `accountId` por RPC;
3. consultar device/grants/roles admin solo con ese `accountId`;
4. validar UUID y firmarlo como subject;
5. mapear rechazo PostgREST a error de auth HTTP 401;
6. mantener el request body cerrado y todos los normalizadores existentes;
7. declarar config explícita.

Tests: suite Deno de la función.

Aceptación: Clerk no UUID funciona; UUID firmado interno; regresiones verdes.

## T5 — Tests rojos Go

Dependencias: T4 verde.

Archivos máximos:

- `vantare-v2/internal/license/service.go`;
- `vantare-v2/internal/license/service_test.go`;
- `vantare-v2/internal/license/credential.go`;
- `vantare-v2/internal/license/credential_test.go`.

Pasos:

1. test de JWT Clerk + credencial UUID válida;
2. tests de subject externo vacío/malformado;
3. tests de subject firmado no UUID, firma inválida y cuenta devuelta;
4. regresión offline con token protegido exacto;
5. regresión de 401 Edge que no cae a caché aunque el token sea el protegido.

Aceptación: rojo objetivo en el rechazo UUID del parser/comparación actual.

## T6 — Separar subject externo e interno en Go

Dependencias: T5 rojo.

Mismos archivos que T5.

Pasos:

1. validar estructura JWT y `sub` externo no vacío con límite razonable;
2. verificar online el subject UUID contenido en la credencial firmada;
3. no publicar el subject externo como `Result.UserID` en errores;
4. conservar dispositivo, reloj, capacidades y caché;
5. ejecutar `gofmt`.

Tests:

```powershell
go test ./internal/license/...
go test ./...
```

Aceptación: Clerk llega a online; cuenta solo desde firma válida; suite verde.

## T7 — Review y entrega aislada

Dependencias: T2, T4 y T6 verdes.

Archivos documentales:

- spec/plan/tasks;
- `docs/roadmap/plan.md` y digest generado;
- handoff comercial.

Pasos:

1. revisar diff completo y permisos SQL;
2. buscar `email`, `user_metadata`, `accountId` de body y verificadores JWT
   paralelos en el diff;
3. ejecutar todos los gates aplicables;
4. pedir review final independiente de seguridad/simplicidad;
5. actualizar issue/handoff con comandos y resultados exactos;
6. commit y push de rama; abrir PR draft a `nightly`.

Aceptación: CI de PR observado y reportado por separado. No merge, deploy,
promoción, release ni modificación de datos reales.

## Stop conditions

Parar y pedir revisión si:

- la FK de profiles no puede retirarse sin ampliar el modelo de cuenta;
- PostgREST no valida Clerk TPA o no expone `auth.jwt()` como demostró ISA-885;
- la carrera deja profiles huérfanos o requiere locks globales;
- la ruta offline necesita confiar en el `sub` externo sin firma;
- hacen falta más de cinco archivos por corte, una dependencia, deploy remoto o
  mutación de grants reales.
