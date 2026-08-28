# ISA-885 · sesión Clerk real y Supabase TPA local

Fecha de cierre de evidencia: 2026-08-28

Resultado: **PASS del contrato Clerk session token → Supabase TPA local**

Alcance: spike no productivo, `roadmap:not-required`

## Conclusión

Una aplicación **Clerk development** reclamada mediante la CLI oficial emitió
un session token RS256 con `role=authenticated`. Un Supabase local aislado,
configurado con `[auth.third_party.clerk]`, aceptó ese JWT y lo convirtió en el
rol Postgres `authenticated`.

La prueba real sobre PostgREST y RLS demostró que la sesión Clerk pudo:

- insertar una fila cuyo propietario se derivó de `auth.jwt()->>'sub'`;
- leer esa fila propia;
- recibir `403` al intentar insertar para otro sujeto;
- ocultar todas las filas a una petición anónima.

No se abrió Vantare, no se tocó Supabase remoto y no hubo código productivo,
migración, deploy, billing, licencia, promoción ni release.

El PASS no resuelve por sí solo la migración de cuentas. Clerk no sincroniza
usuarios en Supabase Auth: su `sub` es un identificador textual de Clerk, no el
UUID interno que hoy relaciona `profiles`, `user_entitlements` y `auth.users`.
Una futura implementación de Vantare deberá mantener un mapping server-side
explícito `clerk_user_id -> account UUID`; el email no debe ser autoridad.

## Matriz de evidencia

| Prueba | Resultado | Evidencia sanitizada |
| --- | --- | --- |
| Autenticar la CLI | **PASS** | OAuth humano completado en el navegador compartido; la CLI quedó vinculada a una aplicación development. |
| Configurar el claim requerido | **PASS** | El schema vivo de Clerk aceptó exactamente `session.claims.role = "authenticated"`. |
| Compilar el harness temporal | **PASS** | Next.js 16.3.3 y TypeScript terminaron sin errores. |
| Crear y activar sesión de prueba | **PASS** | El Backend SDK oficial creó un usuario reservado de test y una sesión development; ambos se eliminaron en `finally`. |
| Obtener session token | **PASS** | `alg=RS256`, `kid` y `sid` presentes, `sub` en namespace Clerk, `role=authenticated`, TTL observado de 60 s. El JWT nunca se imprimió. |
| Renovar session token | **PASS** | Una segunda acuñación posterior produjo otro JWT sin exponer su valor. |
| Supabase TPA acepta el token | **PASS** | PostgREST respondió `201` al insert y `200` al select usando el JWT Clerk y la publishable key local. |
| RLS conserva el sujeto | **PASS** | La fila insertada y leída tuvo `user_id = auth.jwt()->>'sub'`; una escritura con propietario diferente respondió `403`. |
| Control anónimo | **PASS** | PostgREST respondió `200` con cero filas visibles sin bearer token. |
| Caracterizar mapping interno | **PASS** | El `sub` Clerk no es UUID y la integración nativa no crea un usuario Supabase Auth. Se requiere mapping server-side al UUID interno existente. No se diseñó schema productivo. |
| Revocación y limpieza de usuarios | **PASS** | Cada sesión se revocó y cada usuario de test se eliminó mediante el SDK oficial, incluso al fallar una aserción intermedia. |
| Limpieza de runtime local | **PASS** | Cero contenedores `isa885-clerk-tpa`, puerto 5174 cerrado y `.env.local` temporal eliminado sin leerlo. |

## Procedimiento mínimo ejecutado

Todo el runtime se creó bajo `C:\tmp`, fuera del repo. Se usaron Clerk CLI
3.2.0, Supabase CLI 2.105.0, Docker Desktop y los SDK oficiales ya incluidos en
el starter temporal.

1. Se reclamó una aplicación Clerk exclusivamente development mediante
   `clerk auth login`.
2. Se consultó el schema vivo y se aplicó el patch mínimo:

   ```json
   {"session":{"claims":{"role":"authenticated"}}}
   ```

3. El SDK de backend creó una identidad reservada de test, creó una sesión y
   obtuvo el session token en memoria.
4. Se arrancó un Supabase local con puertos aislados y únicamente los servicios
   necesarios. Su configuración relevante fue:

   ```toml
   [auth.third_party.clerk]
   enabled = true
   domain = "<dominio-development-clerk>"
   ```

5. En una tabla efímera se habilitó RLS, se concedió acceso explícito solo a
   `authenticated` y se aplicaron policies que comparaban
   `auth.jwt()->>'sub'` con `user_id`.
6. Se hicieron las peticiones PostgREST positiva, de propietario incorrecto y
   anónima. El script solo devolvió códigos HTTP y booleanos.
7. En `finally` se revocó la sesión y se eliminó el usuario Clerk. Después se
   detuvieron el servidor y los contenedores, se borraron los volúmenes del
   proyecto local y se eliminó el archivo temporal de entorno sin abrirlo.

La CLI `supabase db query --local --file` rechazó inicialmente el fichero por
intentar preparar varias sentencias a la vez. Se aplicó el mismo SQL con
`psql -v ON_ERROR_STOP=1` dentro del contenedor DB exacto del proyecto ISA-885;
no se tocó ningún otro entorno local.

## Evidencia sanitizada

La prueba de emisión y renovación devolvió:

```text
ok=true
role=authenticated
algorithm=RS256
has_key_id=true
has_session_id=true
subject_uses_clerk_namespace=true
ttl_seconds=60
refreshed_token_is_different=true
```

La prueba real TPA/RLS devolvió:

```text
ok=true
role=authenticated
insert_status=201
select_status=200
owns_inserted_row=true
reads_own_row=true
wrong_owner_status=403
wrong_owner_rejected=true
anonymous_status=200
anonymous_sees_no_rows=true
```

## Identidad y autoridad del UUID

La integración nativa resuelve autenticación y RLS con el JWT externo, pero no
sincroniza el usuario en Supabase Auth. Por eso `auth.uid()` no representa a un
usuario Clerk; la documentación usa `auth.jwt()->>'sub'`.

El esquema actual de Vantare descrito en `docs/supabase-schema-release.md` usa
UUID de `auth.users.id` en `profiles.id` y `user_entitlements.user_id`. La
solución productiva mínima deberá resolver el `sub` externo en servidor contra
un UUID interno estable antes de consultar cuenta, permisos o licencia. Este
spike no elige tabla, endpoint ni estrategia de migración: hacerlo aquí habría
sido arquitectura prematura.

## Seguridad y cleanup

- No se leyó, imprimió, copió ni versionó ningún `.env*`.
- No se mostraron secret keys, publishable keys, cookies, códigos, emails,
  IDs de usuario ni JWT.
- Los usuarios y sesiones sintéticos se eliminaron después de cada ejecución.
- El proyecto Supabase fue estrictamente local y sus contenedores/volúmenes se
  detuvieron y borraron por `project_id` exacto.
- Docker reanudó otros proyectos locales existentes al iniciar Desktop; no se
  detuvieron, modificaron ni inspeccionaron sus datos.
- El borrado recursivo de las tres carpetas inertes bajo `C:\tmp` fue bloqueado
  por la política local antes de ejecutarse. Permanecen sin procesos ni
  contenedores; el único `.env.local` temporal sí se eliminó de forma segura.
- La aplicación Clerk development permanece en la cuenta y la sesión global de
  la CLI continúa autenticada. No se eliminó el recurso remoto ni se cerró la
  sesión de la herramienta porque no eran necesarios para el spike.

## Fuentes vivas consultadas

- [Clerk: integración nativa con Supabase](https://clerk.com/docs/guides/development/integrations/databases/supabase)
  exige `role=authenticated`, entrega `session.getToken()` a Supabase y aclara
  que no sincroniza usuarios con Supabase Auth.
- [Supabase: Clerk como third-party auth](https://supabase.com/docs/guides/auth/third-party/clerk)
  documenta el dominio development y la configuración TPA.
- [Supabase: third-party auth](https://supabase.com/docs/guides/auth/third-party/overview)
  describe la validación de JWT asimétricos de proveedores externos.
- [Clerk: identidades reservadas de test](https://clerk.com/docs/guides/development/testing/test-emails-and-phones)
  permite probar development sin usar una identidad real.
- [Clerk: session tokens](https://clerk.com/docs/guides/sessions/session-tokens)
  define el JWT corto y sus claims.

Se consultó también el changelog vigente de Supabase antes de ejecutar; no se
encontró un cambio incompatible específico de Clerk TPA.

## Decisión que habilita

ISA-885 demuestra que Clerk puede sustituir la capa de login/sesión sin un
puente propio de tokens y que Supabase puede seguir aplicando RLS. Una issue
productiva posterior puede diseñar la migración mínima de identidad y cuentas,
manteniendo el UUID interno como autoridad. Este PASS no autoriza todavía esa
implementación ni la integración de este documento en `nightly`.

## Influencia de la skill Supabase

La skill exigió documentación viva, ejecución local-first, una query real y
RLS con grants explícitos. También evitó usar metadata editable, `service_role`
en cliente o una comprobación superficial del formato JWT como sustituto de la
aceptación TPA real.
