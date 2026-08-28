# Spec: bootstrap de cuenta interna desde Clerk

Estado: implementada y verificada localmente el 2026-08-28. Revisión Fable
medio inicial incorporada; pendiente review final del HEAD. Issue: ISA-909.

## Objetivo

Permitir que una sesión Clerk aceptada por Supabase Third-Party Auth resuelva de
forma idempotente una cuenta interna de Vantare. Clerk identifica a la persona;
el UUID interno de Vantare continúa siendo la autoridad para licencias,
dispositivos, grants y credenciales offline.

Este es el primer corte productivo de la transición. Entrega la frontera de
identidad y licencias, pero todavía no instala Clerk en React/Wails ni sustituye
el inicio de sesión visible de Supabase Auth.

## Decisiones cerradas

1. Una identidad se distingue por el par validado `(issuer, subject)`. No se
   usa email, nombre, metadata editable ni un `userId` enviado en el body.
2. El primer login Clerk sin mapping crea un UUID interno nuevo. No se intenta
   conservar automáticamente el UUID o perfil anterior.
3. `public.profiles.id` pasa a ser la raíz de cuenta interna y deja de depender
   por FK de `auth.users.id`. Los UUID actuales permanecen válidos.
4. Una única tabla `public.account_identities` relaciona identidad externa y
   cuenta. Su clave única es `(issuer, subject)` y no tiene acceso directo para
   `anon` ni `authenticated`.
5. La resolución y creación se ejecutan en una función privada con
   `security definer`, `search_path` vacío y claims leídos desde `auth.jwt()`.
   Las RPC públicas existentes continúan siendo la superficie de la app.
6. `license-credential` usa `verify_jwt = false`: el gateway de Edge no es la
   autoridad de tokens Clerk. La única puerta es una RPC PostgREST ejecutada con
   el bearer, donde Supabase TPA valida el JWT y `auth.jwt()` entrega los claims.
   El handler no verifica ni decodifica el token y no añade otra librería JWT.
7. La credencial Ed25519 firmada contiene el UUID interno. Ese `subject`, junto
   con la huella de dispositivo, pasa a ser la autoridad nativa online y
   offline; el `sub` externo nunca se compara con el UUID interno.
8. Las sesiones Supabase Auth actuales conservan su UUID solo cuando el `iss`
   termina en `/auth/v1` y su `sub` UUID pertenece a `auth.users`. Cualquier
   otro issuer, aunque use un subject con forma UUID, pasa por el mapping.
9. Los entitlements valiosos de una cuenta anterior se reasignan únicamente por
   una operación administrativa revisada y autorizada sobre UUID internos. Este
   corte no expone un endpoint de remapeo ni crea un migrador genérico.
10. No se añade dependencia nueva.

## Flujo

```text
Clerk session token
  -> license-credential recibe Authorization
  -> RPC PostgREST valida el JWT mediante Supabase TPA
  -> RPC lee auth.jwt().iss + auth.jwt().sub
  -> mapping existente: devuelve account_id
     mapping ausente Clerk: crea profile UUID + mapping, una sola vez
     sesión Supabase actual: conserva su UUID existente
  -> dispositivos y grants se consultan por account_id
  -> Edge firma credential.subject = account_id
  -> Go verifica firma, account_id UUID y dispositivo
```

Dos peticiones simultáneas de la misma identidad toman un advisory transaction
lock derivado de `(issuer, subject)`, vuelven a consultar el mapping y solo una
crea profile+mapping. Deben converger en el mismo UUID sin fila perdedora.

## Contrato de datos

`public.account_identities` contiene exclusivamente:

- `issuer text not null`;
- `subject text not null`;
- `account_id uuid not null references public.profiles(id) on delete cascade`;
- `created_at timestamptz not null default now()`;
- clave primaria `(issuer, subject)`.

La tabla tiene RLS habilitado, cero policies de usuario y privilegios de tabla
revocados a `anon` y `authenticated`. La función privada valida límites de
longitud y claims vacíos. No duplica la allowlist TPA por entorno: el issuer
completo forma parte de la clave. Nunca acepta `issuer`, `subject` o `account_id`
como argumentos procedentes del cliente.

La migración elimina solo la FK `profiles.id -> auth.users.id`. No modifica las
tablas históricas ajenas a la cuenta comercial ni crea una tabla `accounts`
paralela. El trigger actual de Supabase Auth sigue creando profiles con el mismo
UUID.

## Compatibilidad de licencia nativa

El código Go puede inspeccionar que un JWT tenga un `sub` externo no vacío para
rechazar tokens malformados, pero no usa ese valor como UUID de cuenta. En una
validación online aceptada:

- la firma Ed25519 autentica el contenido de la credencial;
- `credential.claims.subject` debe ser UUID;
- la huella firmada debe coincidir con el dispositivo local;
- `Result.UserID` es el UUID interno firmado.

La caché offline conserva el contrato actual: solo se usa con la sesión exacta
guardada en Credential Manager y una credencial firmada, ligada al dispositivo.
El token protegido solo se persiste después de una validación online aceptada y
la caché se escribe en esa misma validación; esa pareja es el invariante que
permite usar el UUID firmado como subject esperado offline. No se degrada a
aceptar cualquier sesión Clerk con el mismo `sub`. El borrado de cache al cerrar
sesión y la transición entre cuentas quedan inventariados en ISA-911.

## Estados observables

- `created`: identidad nueva y cuenta interna creada;
- `existing`: identidad ya vinculada, mismo UUID;
- `legacy`: sesión Supabase Auth actual, mismo UUID;
- `unauthorized`: JWT ausente/no validado, claims vacíos o usuario legacy ya
  eliminado.

La respuesta pública de licencia no necesita publicar el nombre del estado. Los
tests de base de datos lo observan mediante el resultado y las filas persistidas;
los fallos se traducen a los códigos cerrados existentes de la Edge Function.

## Camino de entitlements antiguos

La implementación no mueve datos reales. El procedimiento operativo futuro es:

1. el usuario inicia sesión y obtiene un UUID interno nuevo;
2. un owner verifica por un canal independiente la propiedad de la compra;
3. se prepara un dry-run que enumera exactamente los grants a mover entre dos
   UUID internos;
4. backup, apply y rollback requieren autorización separada de Isaac;
5. nunca se usa la coincidencia de email como prueba suficiente.

Si este proceso necesitara automatización recurrente, se abrirá otra issue. No
se anticipa aquí una API de linking.

## Tech stack y comandos

- PostgreSQL/Supabase migrations y pgTAP.
- Supabase Edge Functions en Deno/TypeScript.
- Go para licencia nativa y caché offline.
- Sin cambios frontend en este primer corte.

Desde la raíz Git:

```powershell
supabase --version
supabase migration new clerk_account_bootstrap
pwsh -File supabase/tests/run-supabase-hardening-postgres.ps1
deno test --allow-env supabase/functions/license-credential/index.test.ts
```

Desde `vantare-v2`:

```powershell
go test ./internal/license/...
go test ./...
python .github/scripts/roadmap_digest.py --repo . --ref origin/nightly
git diff --check
```

El nombre timestamp de la migración lo crea la CLI; no se inventa a mano. No se
aplica schema remoto ni se leen archivos `.env*`.

## Estructura esperada

- `supabase/migrations/<cli>_clerk_account_bootstrap.sql`: tabla, helper privado,
  compatibilidad de RPC y rollback comentado.
- `supabase/tests/clerk_account_bootstrap_test.sql`: permisos, autoridad,
  idempotencia y conflictos.
- `supabase/tests/run-supabase-hardening-postgres.ps1`: inclusión del contrato y
  carrera concurrente real.
- `supabase/functions/license-credential/index.ts` y test: resolver UUID interno
  antes de leer y firmar grants.
- `supabase/config.toml`: `verify_jwt = false` explícito para
  `license-credential`.
- `vantare-v2/internal/license/service.go`, `credential.go` y tests: separar
  `sub` externo de la cuenta firmada.

## Estilo y simplicidad

- Una tabla, un resolver privado y las RPC ya existentes.
- SQL con nombres concretos y errores cerrados; sin JSON dinámico ni providers.
- Funciones Go pequeñas; no se crea `IdentityManager`, interfaz genérica o
  paquete nuevo.
- La Edge Function conserva su store actual y solo cambia su entrada de
  `userId externo` a `accountId interno`.
- Ningún fallback inventa identidad, entitlement o dispositivo.

## Estrategia de pruebas

### Base de datos

- `anon` no ejecuta RPC ni accede a la tabla.
- `authenticated` no lee/escribe `account_identities` directamente.
- claims ausentes, issuer vacío y subject vacío fallan cerrados.
- dos llamadas secuenciales Clerk devuelven el mismo UUID y una fila.
- dos llamadas concurrentes Clerk devuelven el mismo UUID sin profile huérfano.
- dos subjects distintos obtienen UUID distintos.
- un JWT no puede elegir `account_id` ni apropiarse de un UUID por email.
- una sesión Supabase Auth existente conserva su UUID.
- un issuer externo con subject UUID igual a un usuario Supabase no hereda esa
  cuenta.
- claim, lectura y reset de dispositivo operan sobre el UUID resuelto.
- las cuatro RPC funcionan con claims Clerk y no evalúan `auth.uid()`.

### Edge Function

- un subject Clerk no UUID puede recibir una credencial cuyo subject sí es el
  UUID interno devuelto por el store.
- el store usa el token de usuario para la RPC y el UUID resuelto para las
  lecturas admin.
- UUID interno ausente o inválido falla con `invalid_account`.
- un bearer rechazado por PostgREST se traduce a HTTP 401; nunca a 503.
- firma, grants, roles, device-limit y errores existentes no regresionan.
- el body no admite issuer, subject, email ni accountId.

### Go

- JWT con `sub = user_...` alcanza la validación online.
- una credencial correctamente firmada fija `Result.UserID` al UUID interno.
- firma inválida, subject firmado no UUID o dispositivo distinto fallan.
- la ruta Supabase Auth UUID continúa pasando.
- un 401 Edge produce `ErrCredentialRejected` y no activa gracia offline aunque
  el token presentado coincida con el protegido.
- el fallback offline exige token protegido exacto y conserva la cuenta firmada.

## Límites

### Siempre

- Derivar identidad solo de claims que PostgREST validó mediante Supabase TPA.
- Mantener el UUID interno y la firma como autoridad de licencia.
- Escribir primero el test rojo de cada comportamiento.
- Revisar permisos, RLS, rollback y carrera antes de considerar el schema listo.
- Actualizar issue, handoff y roadmap con el estado real.

### Consultar antes

- Añadir una dependencia o un segundo proveedor TPA.
- Crear una API de linking/remapeo o mover datos reales.
- Cambiar el modelo de cuenta más allá de retirar la FK de `profiles`.
- Tocar Billing checkout/portal, Testing Center o el frontend de Cuenta.
- Aplicar migraciones o desplegar Edge Functions en remoto.

### Nunca

- Confiar en email, `user_metadata` o campos enviados por el cliente.
- Firmar una credencial si la RPC TPA no devolvió un UUID interno válido.
- Copiar secretos, tokens o `.env*` a logs, tests o documentación.
- Crear sincronización Clerk -> Supabase Auth o doble fuente de usuarios.
- Hacer merge, promoción, release o mutación de datos reales en esta entrega.

## Criterios de éxito

1. El mismo `(issuer, subject)` resuelve siempre el mismo UUID interno, incluso
   con concurrencia.
2. Identidades distintas no colisionan y no quedan profiles huérfanos.
3. El cliente no puede elegir cuenta ni ganar grants por email o metadata.
4. Las sesiones Supabase actuales siguen usando su UUID.
5. La credencial firmada y Go consumen el UUID interno aunque Clerk use un
   subject no UUID.
6. Tests SQL, Edge, Go, roadmap y diff pasan localmente.
7. No se añade Clerk UI, dependencia nueva, deploy remoto ni migración real.

## Limitaciones conocidas del corte

Solo las cuatro RPC de licencia dejan de usar `auth.uid()`. Billing,
Testing Center y otras tablas/policies todavía contienen casts UUID o FKs a
`auth.users`, por lo que no se presentan como compatibles con Clerk. ISA-911
inventaría y divide esas superficies antes de habilitar el login Clerk visible.

Retirar la FK `profiles -> auth.users` elimina también su antiguo
`on delete cascade`: borrar un usuario Supabase Auth ya no elimina su profile,
devices, grants ni assignments. Este corte no borra usuarios ni inventa una
política de lifecycle sustitutiva; ISA-911 debe decidirla. El precheck de rollback
falla si encuentra esos profiles sin `auth.users`, de modo que no se puede
restaurar la FK ocultando datos huérfanos.

El sufijo `/auth/v1` es exclusivamente el selector de compatibilidad legacy y
falla cerrado si el subject UUID no existe en `auth.users`. La allowlist TPA de
Supabase debe contener solo los issuers aprobados: un segundo proveedor no se
habilita implícitamente por este resolver.

## Preguntas abiertas

Ninguna para este corte. El SDK/UI Clerk, la persistencia de su sesión en Wails
y cualquier herramienta repetible de remapeo pertenecen a SDD posteriores.

## Revisión Fable

Fable 5 con esfuerzo medio emitió `APROBADO_CON_CAMBIOS`. Se aceptaron el lock
por identidad, la rama legacy por issuer, el shim `auth.jwt()` en tests, el 401
cerrado y el inventario ISA-911. Su hipótesis de que el gateway Edge no acepta
TPA no se tomó como hecho: la documentación oficial afirma soporte TPA para
Functions, pero no especifica inequívocamente ese gateway. Para eliminar esa
dependencia, este corte usa la ruta PostgREST TPA ya demostrada por ISA-885.
La primera revisión final emitió `CHANGES_REQUIRED`: exigió clasificar también
los status PostgREST 401/403 como rechazo de credencial y cerrar el caso de un
usuario legacy borrado. Ambos hallazgos se convirtieron primero en regresiones
rojas y después quedaron corregidos. La segunda revisión Fable 5 con esfuerzo
medio emitió `ACCEPT`, sin hallazgos P0/P1/P2 ni simplificaciones necesarias
antes de integrar.
