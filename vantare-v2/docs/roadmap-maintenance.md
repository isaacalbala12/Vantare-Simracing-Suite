# Roadmap público · #1535

**ClickUp es la única fuente**: workspace `90151421613`, espacio Vantare,
lista Desarrollo. Títulos «Tipo · Nombre». GitHub Issues es seguimiento interno.
No hay editor en Hub, plan.md ni generador desde GitHub. Supabase conserva el
historial de publicaciones y sirve la publicación actual mediante visual_roadmap_current;
la Action sustituye la publicación manual como único escritor del roadmap.

La Action `.github/workflows/clickup-roadmap.yml` consulta cada seis horas y
admite dispatch. Isaac configura CLICKUP_API_TOKEN como secreto de GitHub;
solo se usa al preparar el JSON. Ausencia de secreto, fuente ambigua/incompleta,
estado desconocido o límites excedidos falla sin sustituir datos anteriores.

Destino aprobado por el orquestador: **visual_roadmap en Supabase existente**.
Funciona con el repositorio privado. Hub, web y digest leen únicamente la RPC
visual_roadmap_current con URL/anon key públicas del build/sitio; ninguna
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
Grant único: USAGE schema public y EXECUTE visual_roadmap_sync(jsonb).
No puede leer/escribir tablas ni ejecutar visual_roadmap_publish directamente.
Revisar también privilegios heredados de PUBLIC en el proyecto elegido: si
PUBLIC concede DML o funciones sensibles, no activar CI hasta revisarlo.
Comprobar rol/tabla/function ACL con SQL local y una conexión real del rol.

Después de aprobación, Isaac fija contraseña mediante prompt protegido
(psql \password vantare_roadmap_publisher), nunca en SQL versionado, logs o chat.
Guardar secretos GitHub ROADMAP_PGHOST, ROADMAP_PGPORT, ROADMAP_PGDATABASE,
ROADMAP_PGUSER (exactamente vantare_roadmap_publisher), ROADMAP_PGPASSWORD.
CLICKUP_API_TOKEN es un secreto separado; solo el paso de lectura lo recibe.
El runner necesita psql/libpq con raíz TLS system y verify-full; si no está
disponible se falla, no se rebaja TLS ni se instala infraestructura nueva.
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
Hub acepta caché v1/v2; services IPC v6 exige recompilar el conjunto.

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

Rollback: republicar documento v2 anterior por sync usando el rol dedicado,
tras autorización. No recuperar plan.md ni una fuente de contenido alternativa.
