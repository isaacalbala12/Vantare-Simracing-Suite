# Perfil privado del piloto · #1612 / VANTA-9

**Preparado, sin aplicar.** La migración
`supabase/migrations/20261013225839_pilot_profile_private.sql` añade la tabla
`pilot_profiles`, las RPC `pilot_profile_load/save` y el bucket privado
`pilot-photos`. Requiere autorización separada de Isaac para producción.

La aplicación conserva primero una copia local protegida con DPAPI, separada
por issuer/subject de la cuenta Clerk restaurada. La cuenta local tiene su propio
namespace. El formulario nunca decide UUID, identidad, roles ni licencias.
La sincronización usa el puente nativo existente: JWT de datos con UUID y RLS.
Mientras ese gate esté cerrado o la tabla no exista, el guardado local funciona
y muestra que la sincronización quedó pendiente. Cargar inicialmente o guardar con sesión
reintenta; un conflicto entre dispositivos conserva ambas copias y no fuerza
la revisión remota.

La tabla es privada por `account_id = auth.uid()`, con `USING` y `WITH CHECK`.
Las funciones son INVOKER, sin EXECUTE para PUBLIC/anon. Storage admite fotos
inmutables bajo `<UUID>/<SHA256>.jpg`; no hay upsert ni permisos de UPDATE.
Una policy restrictiva evita que una policy global de Storage permita leer o
escribir fotos ajenas. El bucket no es público. El JPEG admite 24 KiB; nunca se
sube la original. Al retirar/cambiar foto el perfil deja de referenciar la anterior;
los objetos anteriores permanecen privados. Su limpieza queda para un trabajo
posterior, sin borrados de usuarios desde este encargo.

## Validación aislada

`supabase/tests/run-pilot-profile.py --pg-bin <PostgreSQL/bin> --output <evidencia>`
crea y cierra un PostgreSQL desechable en loopback, con pgTAP instalado. No acepta
DSN ni base existente. El bootstrap reproduce los contratos mínimos de
profiles/Auth/Storage; no demuestra el esquema completo de Supabase ni su API
HTTP de Storage. Los 19 checks cubren RLS, ACL, CAS, aislamiento entre cuentas,
foto propia, foto ausente y una policy global permisiva adversarial.

## Aplicación, después del OK

Antes de ejecutar: confirmar SHA del paquete autorizado, backup recuperable,
existencia y ownership real de `profiles`, esquema Auth/Storage y policies
vigentes; revisar que no existan objetos con estos nombres. No copiar tokens
ni claves a la evidencia. Aplicar la transacción únicamente por el procedimiento
de producción aprobado. Después verificar tabla/RPC/bucket, acceso de dos
cuentas propias de QA y rechazo de anon; probar guardar, sustituir y quitar foto.

Ante un fallo durante la transacción PostgreSQL revierte el paquete. Después
de una activación, cerrar el gate de uso del perfil y revocar EXECUTE de las RPC
antes de considerar una restauración. No borrar tabla, bucket ni objetos con
perfiles reales como rollback automático. La copia local permanece disponible.

El painter `vantare_ui::pilot_flag` queda preparado para widgets. Solo recibe
el país declarado del propio piloto; no infiere banderas de otros participantes.
Su colocación en cada widget requiere el diseño correspondiente de Opus.
