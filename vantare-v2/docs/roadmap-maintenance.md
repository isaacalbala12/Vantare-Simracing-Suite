# Roadmap público · #1535

**ClickUp es la única fuente**: workspace `90151421613`, espacio Vantare,
lista Desarrollo. Títulos «Tipo · Nombre». GitHub Issues es seguimiento interno.
No hay editor en Hub, plan.md ni generador desde GitHub. Supabase conserva el
historial de publicaciones: visual_roadmap_current_v2 sirve el documento completo;
visual_roadmap_current conserva la lectura v1 para las apps instaladas;
la Action sustituye la publicación manual como único escritor del roadmap.

La Action `.github/workflows/clickup-roadmap.yml` consulta cada seis horas y
admite dispatch. Isaac configura CLICKUP_API_TOKEN como secreto de GitHub;
solo se usa al preparar el JSON. Ausencia de secreto, fuente ambigua/incompleta,
estado desconocido o límites excedidos falla sin sustituir datos anteriores.

Destino aprobado por el orquestador: **visual_roadmap en Supabase existente**.
Funciona con el repositorio privado. Hub, web y digest leen únicamente la RPC
visual_roadmap_current_v2 con URL/anon key públicas del build/sitio; ninguna
lectura depende de GitHub. La Action usa una conexión SQL con rol dedicado,
sin service_role ni superusuario. No hay bucket, Pages, release o rama de datos.

Migración preparada: supabase/migrations/20261010001000_visual_roadmap_clickup.sql.
Amplía validador v1/v2 y crea visual_roadmap_sync: valida, bloquea la tabla,
no escribe si el documento no cambió y publica por el publisher existente.
Solo vantare_roadmap_publisher puede ejecutar sync; no recibe DML directo.
La configuración y aplicación están pendientes de revisión Sol+Opus.

Lector web: scripts/roadmap-web.js, parámetros supabaseUrl/anonKey públicos.
El sitio está fuera del checkout: integrar en su propio PR. Hub mantiene caché
y mensaje de error; todos reciben la misma publicación, no un JSON privado.

## Credencial mínima de CI (Isaac, tras revisión)

La migración crea vantare_roadmap_publisher LOGIN sin contraseña, NOINHERIT,
NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOREPLICATION, NOBYPASSRLS y límite 2.
Grants propios: USAGE schema public y EXECUTE visual_roadmap_sync(jsonb).
No se le concede lectura/DML de tablas ni EXECUTE visual_roadmap_publish.
Revisar también privilegios heredados de PUBLIC en el proyecto elegido: si
PUBLIC concede CREATE en schemas, DML o funciones sensibles, no activar CI
hasta revisarlo. NOINHERIT no elimina los privilegios implícitos de PUBLIC.
El rol no debe pertenecer a otros roles: NOINHERIT por sí solo no impide SET ROLE.
Comprobar rol/memberships/schema/tabla/function ACL con SQL local y una conexión
real del rol. No revocar grants globales de PUBLIC sin revisión de consumidores.

Después de aprobación, Isaac fija contraseña mediante prompt protegido
(psql \password vantare_roadmap_publisher), nunca en SQL versionado, logs o chat.
Guardar secretos GitHub ROADMAP_PGHOST, ROADMAP_PGPORT, ROADMAP_PGDATABASE,
ROADMAP_PGUSER y ROADMAP_PGPASSWORD del rol dedicado.
Para CI IPv4, usar el pooler compartido existente en modo sesión (puerto 5432):
PGUSER = vantare_roadmap_publisher.<project-ref>. Con conexión directa, PGUSER
= vantare_roadmap_publisher y la red debe admitir la dirección del proyecto.
El SQL exige current_user = vantare_roadmap_publisher en ambos transportes;
no permite usar postgres como sustituto. Host/ref se toman del Dashboard del
proyecto revisado; no contratar IPv4 ni crear infraestructura desde esta entrega.
Referencia: [conexiones y roles personalizados Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres).
CLICKUP_API_TOKEN es un secreto separado; solo el paso de lectura lo recibe.
El runner usa verify-full y PGSSLROOTCERT apunta a
`.github/certs/supabase-prod-ca-2021.crt`, CA pública Supabase Root 2021.
No usa `system`: esa CA privada no pertenece al almacén público estándar.
SHA-256 del certificado DER: 807025AD50D4ED219D2C9C7D299C004F824EB00CF7F65AFEF607D07B72E6CAFA.
Fuente pública: [descarga Supabase](https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt).
Comparar con la descarga del Dashboard del proyecto antes de activar;
no aceptar una CA obtenida del servidor como su propia prueba de confianza.
[Supabase exige CA y verify-full](https://supabase.com/docs/guides/platform/ssl-enforcement).
Verificación real sin autenticación/SQL, 2026-10-10: STARTTLS Postgres contra
aws-0-eu-central-1.pooler.supabase.com:5432, CA/hostname correctos PASS;
hostname falso falla. Se elimina la sonda OpenSSL sin CA, que no probaba
el almacén del sistema; la evidencia libpq independiente sí lo comprueba. Libpq/psql 18.6 también
probado con verify-full: CA correcta llega al rechazo de routing esperado con
usuario ficticio sin tenant; CA system falla y PGHOST falso con PGHOSTADDR real
falla por hostname. Nunca se autenticó una cuenta ni se ejecutó SQL remoto.
Logs tls-libpq-* y tls-review.log en evidencia #1535.
El host concreto de CI aún no está configurado; repetir allí antes de activar:
`python scripts/verify_roadmap_tls.py --host <pooler> --port 5432 --ca <certificado>`.
El workflow ejecuta ese diagnóstico contra PGHOST antes de psql, que conserva
verify-full. La prueba no envía StartupMessage, usuario ni contraseña. No prueba
el tramo interno pooler→DB, ni pg_stat_ssl acredita el tramo cliente→pooler.
Si CA, host o herramientas no validan se falla; nunca rebajar TLS.
Referencia: [conexión TLS libpq](https://www.postgresql.org/docs/16/libpq-connect.html#LIBPQ-CONNECT-SSLROOTCERT).
Credentials por entorno de proceso, no argv, artefactos ni .env. El workflow
tiene contents:read y no escribe GitHub. No imprime SQL/respuestas de servidor.
Para Discord, variables públicas VANTARE_SUPABASE_URL/ANON_KEY del proyecto
fijado; no sustituir la anon key por una credencial privilegiada.

## Contrato

Envelope RPC `{id, published_at, document}`: ID/fecha asignados por Supabase.
schemaVersion 2 conserva items, UUID v5 de tarea, section, title/body es/en/pt/it.
Añade area (Tipo del título), version (una etiqueta semver explícita) y dueDate
(due_date UTC). Ausencia = null. No copia descripciones, comentarios, usuarios
ni campos personalizados. Renombrar/cambiar estado mantiene la identidad.
Hub nuevo acepta caché v1/v2 y usa current_v2; services IPC v6 exige recompilar
el conjunto. La RPC antigua devuelve schemaVersion=1 y solo id/section/title/body,
proyectando later→next para lectores anteriores a la sección later. Mantiene
id y published_at de la misma publicación, sin segunda fuente ni fila duplicada.
Se puede activar v2 sin esperar a actualizar todos los builds instalados.

idea → later; en progreso/por revisar → now; testers → next; complete → done.
Texto conserva estado y ancestros. Progreso por Tipo = complete / tareas
publicadas; cada subtarea cuenta independientemente. No mide esfuerzo,
aceptación ni releases. Fechas son previstas y una etiqueta no acredita release.
40 tareas, documento 40 KB y publicación 56 KB. No truncar.

## Validación y activación

Tests offline de scripts ClickUp y comunicaciones; pgTAP local de rol/RLS. Fixtures son
solo prueba y no se publican. Programación y dispatch requieren workflow en
**master**, rama por defecto: integrarlo solo en nightly no los activa.
Referencia: [eventos GitHub Actions](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows).
El orquestador coordina la promoción autorizada, secreto y verificación real.
No dispatch, publicación ni promoción desde este worker.

## Guardas y ACL efectivos (Sol/Opus)

Sync rechaza documento vacío. Si desaparece >=50% de los UUID actuales,
rechaza el cambio aunque el recuento total se mantenga con UUID nuevos.
No hay `--force` ni parámetro que CI pueda marcar. Tras inspeccionar el documento,
un administrador puede insertar una aprobación exacta:

```sql
insert into public.visual_roadmap_sync_approvals(document,expires_at)
values (<documento_v2_revisado>::jsonb, clock_timestamp()+interval '30 minutes');
```

La aprobación dura como máximo una hora desde la inserción (clock_timestamp).
Su caducidad se comprueba con clock_timestamp después del bloqueo de publicación;
BEGIN antiguo o espera del bloqueo no extienden su vigencia. Se consume dentro
de la transacción exitosa y no concede permisos para el siguiente cambio. CI no tiene lectura/DML
de esa tabla. Vacíos permanecen rechazados aun con aprobación. El histórico
v1 conserva su límite de caracteres para que marcar superseded no falle por
acentos; v2 mantiene el límite de bytes. Antes de aplicar, inspeccionar el tamaño
y guardar la publicación previa, sin corregir ni borrar filas reales desde CI.

PUBLIC pierde EXECUTE solo en race_schedule_my_draft(), is_active_owner(uuid)
y handle_new_user(); authenticated conserva las dos primeras. El trigger
existente sigue funcionando sin EXECUTE directo del caller. Inventario estático
de 107 nombres DEFINER incluyendo revocaciones FOREACH: solo el calendario
publicado queda con EXECUTE inicial PUBLIC. digest son shims de hash INVOKER;
se permiten si una instalación los marca DEFINER. La migración y pgTAP consultan
pg_proc + has_function_privilege y has_schema_privilege(USAGE), fuera de catálogos:
allowlist sync, race_schedule_current y ambos digest. Cualquier otra función
alcanzable hace fallar la migración antes de asignar credenciales; revisar su
consumidor y ACL, no añadirla por comodidad. Escribir/leer el calendario privado
con claims SQL manipulados queda denegado al LOGIN real en el test local.
El inventario estático no sustituye la auditoría del proyecto objetivo, incluidos
objetos externos, defaults de grants, CONNECT/TEMP, tablas y futuras migraciones.

## GitHub Free privado

Sin environments disponibles, los secretos son de repositorio. Este workflow
admite solo schedule/dispatch en la rama por defecto usando el nombre del evento,
no una lista master/nightly; dispatch de nightly/ramas de issue queda omitido.
Ese `if` NO aísla los secretos: cualquier colaborador con push puede añadir otro
workflow que los lea. En repo privado solo los colaboradores pueden pushear;
todos deben ser de confianza para esta credencial. Revisar accesos, workflows y
cambios de ramas antes de activar, quitar write a bots/personas que no deban
publicar y rotar credenciales al retirarlos. GitHub Free no ofrece aquí la barrera
de environments; el riesgo residual aceptable lo decide Isaac. El rol SQL reduce
el daño a reemplazar roadmap válido y usar sus conexiones, sin datos privados.
No se configura un environment inexistente ni se afirma aislamiento por ramas.
[Disponibilidad de environments/secrets en GitHub Free](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments).

## Pruebas SQL locales

Runner `supabase/tests/run-1535-postgres.py --pg-bin <binarios> --output <evidencia>`.
Necesita PostgreSQL con pgTAP; crea su propio PGDATA temporal, puerto loopback y
base desechable, borra entorno PG heredado, aplica migraciones reales sobre un
bootstrap explícito del contrato nativo. Nunca acepta DSN ni DB existente.
Fixture perfiles + account_identities + membership, sin filas auth.users.
PASS local PostgreSQL 18.6/pgTAP 1.3.4: 20+31, LOGIN real con claims falsos
denegado, authenticated owner conserva draft y bloque de rol repetido.
El trigger real handle_new_user sigue creando perfil/licencia desde un INSERT
permitido a service_role aunque PUBLIC no tenga EXECUTE directo. Crear un nuevo
DEFINER default-PUBLIC ficticio hace fallar el gate real de la migración.
Otro DEFINER sin USAGE queda excluido; conceder USAGE causa rechazo sin ampliar
la allowlist. Dos sesiones reales prueban 42501 tras caducar la aprobación,
con BEGIN antiguo y con espera del bloqueo, preservando documento y aprobación.
La inserción comprueba el límite de 1 h contra reloj real en transacciones antiguas.
El bootstrap es un subconjunto, no acredita todas las migraciones ni ACL remotos.
Antes de aplicar: repetir con copia LOCAL del esquema completo objetivo y auditar
allí los grants reales. Revisiones/activación remotas siguen fuera de esta entrega.

## Reversión preparada, no ejecutada

1. Desactivar el workflow primero y retirar sus secretos/autorización de CI.
2. Guardar publicación vigente y anterior (id, fecha, documento exacto), más
   exportación verificada de Testing si hay respuestas/contribuciones. No usar
   artefactos públicos para textos privados. Confirmar restauración en base local.
3. Para recuperar contenido, un administrador autorizado llama
   visual_roadmap_publish con el documento previo v1 o v2. El LOGIN no puede
   publicar v1; detener schedule evita que el siguiente sync lo pise. Los dos
   lectores siguen funcionando con la publicación/proyección compatible.
4. Si se retira la integración CI, con permisos administrativos y tras cerrar
   sus sesiones activas, ejecutar en una transacción revisada:

```sql
revoke execute on function public.visual_roadmap_sync(jsonb) from vantare_roadmap_publisher;
alter role vantare_roadmap_publisher nologin;
drop function public.visual_roadmap_sync(jsonb);
drop table public.visual_roadmap_sync_approvals;
revoke usage on schema public from vantare_roadmap_publisher;
drop role vantare_roadmap_publisher;
```

Si DROP ROLE detecta dependencias, parar e inventariar; no DROP OWNED global
sobre un rol preexistente. No restaurar los grants vulnerables PUBLIC ni quitar
current_v2 mientras existan lectores nuevos. La creación del rol tolera duplicate
object y reafirma atributos; memberships/ACL inesperados causan fallo cerrado.

Retirada de Testing solo con exportación/restauración comprobada y autorización
explícita de borrado; SQL preparado (destruye respuestas, no se ejecuta aquí):

```sql
begin;
drop function public.testing_participation_current(text);
drop function public.testing_answer_save(uuid,smallint,text);
drop function public.testing_contribution_submit(uuid,text,text,text);
drop table public.testing_answers, public.testing_contributions;
drop table public.testing_questionnaires;
commit;
```

P3-9 (cuota diaria) se difiere: solo miembros activos; añadir una cuota exige
fijar el límite/producto y definir respuesta al cliente. No se inventa un límite
ni se afirma protección antiabuso. Vigilar volumen antes de apertura amplia y
fijar cuota en seguimiento si Isaac la requiere. P3-8 se resuelve preservando v1;
P3-10 incluye runner y ejecución real, además de la revisión SQL estática.
