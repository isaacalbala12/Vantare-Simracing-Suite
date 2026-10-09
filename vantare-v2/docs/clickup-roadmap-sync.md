# ClickUp → publicación Supabase (#1496, feedback 9-oct)

El Hub sigue leyendo exclusivamente `visual_roadmap_current` por services.
El nuevo script es una herramienta externa, manual y de una sola dirección;
no introduce credenciales ClickUp, sincronización periódica ni editor en Hub.

Fuente: workspace indicado, espacio **Vantare**, lista **Desarrollo**, también
dentro de carpetas. Rechaza nombres ambiguos. Consulta todas las páginas,
subtareas y tareas cerradas. Conserva el título exacto «Tipo · Nombre» y cada
subtarea como hito con su propia situación; el cuerpo indica su cadena de
padres y estado exacto. No copia descripciones, comentarios, usuarios ni
campos privados. UUID v5 estable por ID ClickUp: renombrar/mover de estado
no cambia la identidad. No convierte estado complete en prueba de release.

| ClickUp | Publicación | Hub |
|---|---|---|
| idea | later | Más adelante |
| en progreso | now | Ahora |
| por revisar | now | Ahora (estado visible en texto) |
| testers | next | Siguiente (estado visible en texto) |
| complete | done | Entregado |

La idea mapea a `later`, añadido al validador SQL y nativo sin cambiar schema v1,
presupuestos ni permisos. Tablero muestra los cuatro grupos; Circuito y
Temporada conservan sus presentaciones existentes, Entregado también en carril.
Los cinco estados originales permanecen en el texto. La API no garantiza el
orden manual de las vistas ClickUp: se conserva el orden devuelto por la API,
sin inventar fechas, progreso o campos de temporada.

## Orden seguro

1. Probar sin red ni credenciales desde `vantare-v2`:
   `python -m unittest discover -s scripts -p test_clickup_roadmap.py`
   y `python scripts/clickup-roadmap.py --fixture scripts/testdata/clickup-roadmap.json --output-dir C:/tmp/roadmap-example --expected-publication none`.
   Los fixtures no se pueden publicar. Son ejemplos, nunca datos productivos.
2. Revisar/aplicar en Supabase LOCAL la migración
   `supabase/migrations/20261009000000_visual_roadmap_later.sql` y ejecutar
   `supabase/tests/visual_roadmap_later.test.sql` con pgTAP. Validar con Hub nativo
   lector la publicación de prueba. **No aplicar en producción sin Isaac.**
   El lector Go legado rechaza `later`; queda fuera del brief nativo. Mientras
   siga conectado al mismo backend, no publicar `later` allí hasta adaptar y
   verificar ese consumidor en una tarea autorizada o aislar el entorno nativo.
3. Isaac aporta `CLICKUP_API_TOKEN` en el entorno; no pasarlo por argumentos,
   imprimirlo ni guardarlo en `.env`. Solo se usa en el header Authorization a
   `api.clickup.com`; las redirecciones se rechazan. Leer proyecto y versión
   vigente con `visual_roadmap_current`. Si está vacío, usar `none`.
4. Preparar sin escribir remoto:
   `python scripts/clickup-roadmap.py --workspace-id <id> --output-dir C:/tmp/roadmap-review --expected-publication <UUID-o-none>`.
   Revisar `roadmap.json`, `publish.sql`, destino y digest SHA256 anunciado.
   Más de 40 tareas/subtareas, textos largos, padre ausente/cíclico, estado
   desconocido o consulta incompleta abortan; **no se recortan tareas**.
   El límite de 40 es del contrato existente: si Desarrollo lo supera, dejar
   pendiente una decisión de publicación/contrato antes de sincronizar.
5. Pedir autorización para ESA publicación/digest/proyecto. Configurar libpq
   `PGHOST/PGPORT/PGDATABASE/PGUSER` y su credencial protegida existente fuera
   del repo. No usar roles anon/authenticated/service_role: el publisher SQL
   requiere sesión privilegiada. Con autorización explícita, repetir el comando
   con `--publish --approved-sql-sha256 <digest> --expected-db-host <PGHOST aprobado> --expected-db-user <PGUSER aprobado>`.
   Host y usuario fijan el proyecto incluso con un pooler compartido.
   Si ClickUp cambió, el digest cambia y se aborta. El script envía SQL por stdin,
   nunca una DSN/contraseña en argumentos; guarda recibo local de publicación.
6. SQL bloquea la tabla y comprueba el UUID vigente dentro de la transacción;
   si otro editor publicó desde la revisión, aborta. Publisher existente valida,
   conserva anterior como superseded y publica atómicamente. Si se pierde la
   respuesta, releer antes de reintentar. Releer como anon y pulsar Recargar en
   Hub; verificar los cuatro estados, nombres, subtareas y las tres vistas.

Rollback: republicar el documento anterior revisado mediante el mismo publisher
(con autorización). Restaurar el validador antiguo solo después de retirar
publicaciones con `later`, usando el rollback adjunto. Ninguna ejecución del
worker aplica migraciones o escribe en Supabase; no se ha usado token real.

Referencia técnica primaria: [Get Tasks](https://developer.clickup.com/reference/gettasks),
[Get Spaces](https://developer.clickup.com/reference/getspaces),
[Get Folderless Lists](https://developer.clickup.com/reference/getfolderlesslists),
[FAQ de subtareas](https://developer.clickup.com/docs/faq).
