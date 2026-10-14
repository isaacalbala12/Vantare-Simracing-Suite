# Perfil privado del piloto · #1612 / VANTA-9

**Preparado, sin aplicar.** La migración
`supabase/migrations/20261013225839_pilot_profile_private.sql` añade la tabla
`pilot_profiles`, los recibos privados `pilot_private.operations`, las RPC
`pilot_profile_load/save` y el bucket privado
`pilot-photos`. Requiere autorización separada de Isaac para producción.

La aplicación conserva primero una copia local protegida con DPAPI, separada
por issuer/subject de la cuenta Clerk restaurada. La cuenta local tiene su propio
namespace. El formulario nunca decide UUID, identidad, roles ni licencias.
La sincronización usa el puente nativo existente: JWT de datos con UUID y RLS.
Mientras ese gate esté cerrado o la tabla no exista, el guardado local funciona
y muestra que la sincronización quedó pendiente. Cargar inicialmente o guardar con sesión
reintenta; un conflicto entre dispositivos conserva ambas copias y no fuerza
la revisión remota.

Cada guardado conserva un UUID v4 `op_id`, el documento/foto enviado y su
revisión CAS en el mismo registro local protegido que el pendiente. Editar B
con A incierto conserva A intacto y B como copia local. Se reenvía A con la misma
clave, contenido y CAS hasta confirmar; solo entonces se crea la clave nueva de
B y se envía sobre la revisión confirmada. No hay huellas ni reconciliación por
comparar un SELECT con R+1. La RPC requiere `p_op_id` además de documento,
hash y revisión; no se conserva una sobrecarga que pueda eludir idempotencia.

El servidor serializa guardados de la misma cuenta mediante un advisory lock
transaccional, incluido el primer INSERT. En una misma transacción confirma el
CAS, `last_op_id` del perfil y el recibo inmutable `(account_id, op_id, result)`.
Un duplicado espera al intento aún en curso y devuelve exactamente su revisión,
documento y hash originales antes de validar un nuevo payload o evaluar CAS.
Si el original revierte, el reintento puede aplicar normalmente. Los recibos
conservan también operaciones anteriores: solo el último ID sería insuficiente
si otro dispositivo guarda antes del reintento. No se podan automáticamente;
cualquier futura política de retención debe mantener la garantía de reintento.

Los formatos locales anteriores de QA se leen sin perder el perfil pendiente y
reciben una clave durable. Un intento de esas versiones no tenía `op_id` en el
servidor: no se puede recuperar retroactivamente su confirmación; un CAS real
distinto permanece en conflicto, sin forzarlo. Este backend sigue sin desplegar.

Tras confirmar el último recibo, el cliente carga el perfil actual en esa misma
llamada si no queda edición pendiente. Un recibo de A/R1 no termina la carga si
otro dispositivo ya confirmó C/R2. Un rechazo definitivo HTTP400/22023 retira A
de forma durable y refresca la revisión remota sin borrar el borrador; se puede
corregir B y volver a guardar, incluso tras reiniciar. La RPC emite SQLSTATE
PT409 para CAS obsoleto (HTTP409 en PostgREST); el cliente admite también
HTTP500/40001 del paquete QA anterior. Ambos conservan el borrador y reanclan
la revisión actual, sin enviar automáticamente una sustitución. El pendiente
sin operación representa esta revisión necesaria; reabrir no recrea el intento.
Si falla la carga posterior, el intento rechazado sigue retirado y se conserva
la última revisión conocida hasta poder refrescar. Otros 500/503, transporte y
éxitos ilegibles conservan UUID/contenido/CAS inciertos.

La tabla es privada por `account_id = auth.uid()`, con `USING` y `WITH CHECK`.
Las RPC públicas son INVOKER, sin EXECUTE para PUBLIC/anon. La tabla solo
concede SELECT a authenticated. Guardar llama a una función SECURITY DEFINER
en `pilot_private`, con search_path vacío y owner `pilot_profile_writer`
NOLOGIN/NOINHERIT/NOBYPASSRLS; tiene únicamente SELECT/INSERT/UPDATE del perfil,
SELECT/INSERT de recibos, lectura de Storage y acceso a auth.uid(). No es owner
de las tablas: RLS sigue
aplicándose. Solo el administrador que ejecuta la migración recibe membresía
del escritor para transferir ownership sin requerir SUPERUSER; nunca los roles
de API. El esquema privado no puede estar expuesto por Data API.
Storage admite fotos
inmutables bajo `<UUID>/<SHA256>.jpg`; no hay upsert ni permisos de UPDATE.
Una policy restrictiva evita que una policy global de Storage permita leer o
escribir fotos ajenas. Otra guardia restrictiva de UPDATE impide reemplazar
objetos o moverlos al/del bucket incluso ante policies globales. DELETE también
queda cerrado para impedir reemplazos por borrar y reinsertar. La limpieza
necesitará autoridad separada. El bucket no es público. El JPEG admite 24 KiB; nunca se
sube la original. Al retirar/cambiar foto el perfil deja de referenciar la anterior;
los objetos anteriores permanecen privados. Su limpieza queda para un trabajo
posterior, sin borrados de usuarios desde este encargo.

## Validación aislada

`supabase/tests/run-pilot-profile.py --pg-bin <PostgreSQL/bin> --output <evidencia>`
crea y cierra un PostgreSQL desechable en loopback, con pgTAP instalado. No acepta
DSN ni base existente. El bootstrap reproduce los contratos mínimos de
profiles/Auth/Storage; no demuestra el esquema completo de Supabase ni su API
HTTP de Storage. Los 90 checks cubren RLS, ACL, CAS, aislamiento entre cuentas,
rechazo del DML directo, contrato nativo, foto propia/ausente e inmutabilidad
ante una policy global permisiva adversarial. El runner comprueba además cuatro
rechazos de reversión por consentimiento/perfiles/fotos/recibos y diez postchecks
del paquete QA retirado, conservando
las cuentas y policies ajenas al paquete.
Además usa dos conexiones y barreras explícitas: A sin COMMIT, load que ve R=0,
reintento bloqueado en el advisory lock, confirmación de A y recibo idéntico,
B con revisión 1, otro dispositivo C y reintento tardío de A. C no cambia y un
CAS nuevo obsoleto se rechaza. Sin sleeps ni consultas a una instancia existente.
`--non-superuser-migration` repite el paquete con un administrador CREATEROLE
sin SUPERUSER en el mismo entorno desechable. No certifica los privilegios
reales de la instancia de Supabase. Para transferir ownership, el administrador
debe poder asumir el rol receptor ([PostgreSQL ALTER FUNCTION](https://www.postgresql.org/docs/current/sql-alterfunction.html)).

El servidor valida tipos, límites, controles, ISO y simuladores como el cliente;
la descripción admite LF (la UI normaliza CRLF/CR). Los campos futuros siguen
admitidos, con número finito/profundidad legibles por serde_json. El presupuesto
de 48 KiB incluye campos por defecto y reserva conservadora de 32780 bytes
cuando hay foto para su máximo base64. El servidor puede rechazar un documento
próximo al límite aunque un JPEG pequeño cupiera; conserva la copia local.
El cliente comprueba antes de crear una nueva operación con foto el documento
sin JPEG serializado con espacios y la misma reserva de 32780 bytes. Los blobs
anteriores siguen siendo legibles para corregirlos. La negativa tipada del
servidor cubre las restantes diferencias de validación, sin bloquear futuras
correcciones. Referencia de estados HTTP: [PostgREST](https://docs.postgrest.org/en/stable/references/errors.html).

## Aplicación, después del OK

Antes de ejecutar: confirmar SHA del paquete autorizado, backup recuperable,
existencia y ownership real de `profiles`, esquema Auth/Storage y policies
vigentes; revisar que no existan objetos con estos nombres, esquema ni rol,
y que `pilot_private` no esté expuesto por Data API. No copiar tokens
ni claves a la evidencia. Aplicar la transacción únicamente por el procedimiento
de producción aprobado. Después verificar tabla/RPC/bucket, acceso de dos
cuentas propias de QA y rechazo de anon; probar guardar, sustituir y quitar foto.

Ante un fallo durante la transacción PostgreSQL revierte el paquete. Después
de una activación, cerrar el gate de uso del perfil y revocar EXECUTE de las RPC
antes de considerar una restauración. No borrar tabla, bucket ni objetos con
perfiles reales como rollback automático. La copia local permanece disponible.

Para retirar una activación de **QA desechable en loopback y sin datos**, usar
`supabase/rollback/pilot-profile-empty-qa.sql` con el mismo rol administrativo
que aplicó el paquete (los REVOKE deben retirar los grants de ese grantor):
primero `SET vantare.pilot_qa_rollback='empty-disposable'`, después el archivo.
El script exige 127.0.0.1 y bloquea las tablas mientras verifica que no existen
perfiles, recibos ni objetos del bucket. Si existen, aborta conservando todo: cerrar el
gate/revocar RPC y preparar una recuperación específica autorizada. No contiene
borrado de perfiles/fotos ni CASCADE. Retira únicamente tabla, funciones,
policies, bucket vacío, esquema y rol del paquete; dependencias ajenas abortan
la transacción. Los datos de profiles y policies ajenas se conservan. El runner
demuestra las negativas y la retirada posterior al commit. No modifica el
historial de migraciones: registrar la retirada QA por separado y no reejecutar
automáticamente una migración que el historial ya marque aplicada.

El painter `vantare_ui::pilot_flag` queda preparado para widgets. Solo recibe
el país declarado del propio piloto; no infiere banderas de otros participantes.
Su colocación en cada widget requiere el diseño correspondiente de Opus.
