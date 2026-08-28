# Plan técnico ISA-909: bootstrap de cuenta Clerk

Estado: propuesta inicial para revisión Fable. Base:
`origin/nightly@1c45cc827e47976ed41e1f28463529c04579e806`.

## Resultado del corte

Al finalizar, la frontera SQL/Edge/Go aceptará una sesión Clerk ya validada por
Supabase TPA, creará o recuperará un UUID interno y emitirá la credencial offline
existente con ese UUID. La pantalla de login seguirá siendo la actual: este plan
prepara el backend y el runtime nativo para el SDD de integración visual.

## Grafo de dependencias

```text
P0 contrato y baseline
  -> P1 resolver SQL + mapping
       -> P2 Edge firma account_id
            -> P3 Go confía en subject firmado
                 -> P4 gates y documentación
```

No se desarrollan P1-P3 en paralelo: comparten el contrato de `account_id` y un
cambio en P1 puede invalidar los tests posteriores.

## P0 — Congelar contrato y baseline

Objetivo: demostrar qué falla hoy antes de cambiar comportamiento.

Acciones:

1. registrar versión de Supabase CLI y ayuda de `migration new`;
2. ejecutar tests actuales de hardening, Edge credential y Go license;
3. confirmar que hoy un `sub` Clerk no UUID es rechazado por Edge y Go;
4. crear la migración con la CLI, sin aplicar nada remoto.

Checkpoint: baseline documentado; cualquier deuda heredada se separa del fallo
objetivo. Si Docker/Postgres local no está disponible, se registra el bloqueo y
no se presenta un test simulado como prueba SQL.

## P1 — Resolver identidad y cuenta en PostgreSQL

Entrega vertical: una identidad validada obtiene un UUID interno usable por las
RPC de licencia.

Orden TDD:

1. añadir pgTAP rojo para tabla cerrada, claims inválidos, identidad nueva,
   identidad repetida, identidad distinta y sesión legacy;
2. crear `public.account_identities`, RLS y revocaciones;
3. retirar únicamente la FK de `profiles.id` hacia `auth.users`;
4. implementar `private.resolve_current_account()` leyendo `auth.jwt()`;
5. sustituir `auth.uid()` por el resolver en `claim_active_device`,
   `read_account_entitlements`, `reset_active_device` y el wrapper compatible;
6. añadir carrera real al runner PowerShell y comprobar una sola identidad,
   mismo UUID y cero profiles huérfanos;
7. documentar SQL de rollback sin ejecutarlo.

Aceptación: todas las RPC operan por UUID interno; no existe escritura directa
del mapping desde roles de usuario y el cliente no aporta identidad como input.

Rollback local: restaurar las funciones anteriores, eliminar helper/mapping y
recrear la FK de `profiles` solo si no existen profiles sin `auth.users`. El
precheck de esa condición es obligatorio y el rollback debe abortar si falla.

## P2 — Emitir credencial desde el UUID interno

Entrega vertical: `license-credential` deja de exigir que Clerk tenga UUID.

Orden TDD:

1. test rojo: auth externa válida + store que resuelve UUID interno produce una
   credencial con el UUID interno;
2. cambiar el store para que su RPC devuelva `accountId` y usarlo en lecturas
   admin de dispositivos, grants y roles;
3. separar presencia del bearer de resolución de cuenta; no usar
   `supabase.auth.getUser()` en esta función para tokens Clerk;
4. validar el `accountId` antes de firmar;
5. declarar `[functions.license-credential] verify_jwt = true` explícitamente;
6. mantener el body cerrado a `deviceFingerprint`.

Aceptación: `user_...` nunca se usa como FK ni como subject de credencial; todos
los casos previos de grants, roles y dispositivo siguen pasando.

Seguridad: el handler depende de la validación JWT de la plataforma y de una RPC
que deriva claims desde `auth.jwt()`. Un test de config impide desactivar
silenciosamente `verify_jwt`.

## P3 — Separar sesión externa y cuenta firmada en Go

Entrega vertical: el runtime nativo acepta el token externo sin debilitar firma,
dispositivo ni caché.

Orden TDD:

1. test rojo para JWT `sub=user_...` + credencial firmada con UUID interno;
2. relajar el parser local solo a JWT estructuralmente válido y `sub` no vacío;
3. crear una ruta online del verifier que toma el subject de la credencial
   firmada y exige que sea UUID, sin compararlo con el `sub` externo;
4. conservar `verifyCached` con subject esperado de la credencial/cache y token
   protegido exacto;
5. ajustar resultados de error para no presentar el subject externo como
   `UserID` interno;
6. ejecutar regresiones de firma, device mismatch, clock y offline grace.

Aceptación: ningún dato no firmado concede una cuenta. `Result.UserID` solo se
publica desde una credencial válida o desde una caché válida.

## P4 — Gates y cierre documental

1. ejecutar tests SQL focales y carrera concurrente;
2. ejecutar suite Edge de `license-credential`;
3. ejecutar `go test ./internal/license/...` y `go test ./...`;
4. ejecutar validadores de roadmap y `git diff --check`;
5. revisar diff completo para secretos, permisos amplios, email auth y
   abstracciones innecesarias;
6. actualizar spec, plan, tareas, roadmap, handoff e issue con evidencia real;
7. revisión final independiente de seguridad y sobreingeniería;
8. commit, push y PR draft a `nightly` únicamente si todos los gates aplicables
   están verdes.

No se hace deploy de schema/Edge, merge, promoción ni release.

## Archivos por corte

| Corte | Archivos máximos esperados | Verificación |
| --- | --- | --- |
| P1 | migración, pgTAP, runner SQL | pgTAP + carrera |
| P2 | Edge index, Edge test, config | Deno tests + config contract |
| P3 | service, credential y sus tests | Go focal + completo |
| P4 | spec/plan/tasks, roadmap, digest, handoff | digest + diff |

Si un corte necesita más de cinco archivos productivos/test, se pausa y se
redivide antes de seguir.

## Riesgos y mitigaciones

- **Carrera de primer login:** unique key + transacción y test concurrente real.
- **Profile huérfano:** limpiar la creación perdedora dentro de la misma función
  y comprobar conteos.
- **JWT no validado:** `verify_jwt=true` explícito + claims leídos en SQL.
- **Secuestro por email/metadata:** esos campos no aparecen en inputs ni reglas.
- **Regresión Supabase Auth:** caso legacy mantiene UUID y suite existente.
- **Regresión offline:** firma, UUID, dispositivo, reloj y token protegido se
  conservan; solo cambia la relación con el `sub` externo en online.
- **Borrado de usuario legacy:** retirar la FK elimina su cascade sobre profile.
  La eliminación de cuenta queda fuera de alcance y se documenta como riesgo;
  no se borra ningún usuario real.
- **Segundo TPA:** no se admite por accidente; requiere issue y extensión
  explícita del contrato de emisores.

## Definition of done

- Criterios de éxito de la spec demostrados por tests observables.
- Sin dependencia, provider genérico, UI Clerk o migrador de cuentas.
- Rollback revisado y ninguna mutación remota.
- Estado exacto reflejado en issue, handoff y roadmap.
- Fable medio y review final no dejan hallazgos P0/P1 abiertos.
