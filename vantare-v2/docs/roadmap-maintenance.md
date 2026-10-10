# Roadmap público · #1535

**ClickUp es la única fuente**: workspace `90151421613`, espacio Vantare,
lista Desarrollo. Títulos «Tipo · Nombre». GitHub Issues es seguimiento interno.
No hay editor en Hub, plan.md ni generador desde GitHub. La publicación Supabase
anterior es historial inerte; nuevos lectores no usan visual_roadmap_current.

La Action `.github/workflows/clickup-roadmap.yml` consulta cada seis horas y
admite dispatch. Isaac configura CLICKUP_API_TOKEN como secreto de GitHub;
solo se usa al preparar el JSON. Ausencia de secreto, fuente ambigua/incompleta,
estado desconocido o límites excedidos falla sin sustituir datos anteriores.

Destino: **rama de datos roadmap-data**, con un único archivo roadmap.json.
Commit raíz sin código/workflows; actualizaciones posteriores sin force push.
El padre del commit evita perder cambios concurrentes. Nunca escribe nightly.
Se elige frente a un asset porque no publica releases y raw HTTPS no requiere
redirects ni token. Antes de activar, comprobar que el repo es público y que
los rulesets permiten la rama de datos sin rebajar la protección de nightly.

URL común a Hub/web/digest:
`https://raw.githubusercontent.com/isaacalbala12/Vantare-Simracing-Suite/refs/heads/roadmap-data/roadmap.json`.
Hub conserva caché válida y muestra error; Recargar hace GET manual sin bearer.
Lector web: `scripts/roadmap-web.js`. El sitio publicado está fuera del checkout
y debe incorporarlo en su propio PR; este trabajo no cambia producción.

## Contrato

Envelope `{id, published_at, document}`, ID UUID por hash del contenido.
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

Tests offline de scripts ClickUp, rama de datos y comunicaciones. Fixtures son
solo prueba y no se publican. Programación y dispatch requieren workflow en
**master**, rama por defecto: integrarlo solo en nightly no los activa.
Referencia: [eventos GitHub Actions](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows).
El orquestador coordina la promoción autorizada, secreto y verificación real.
No dispatch, publicación ni promoción desde este worker.

Rollback: nuevo commit normal restaurando JSON anterior en roadmap-data.
No recuperar plan.md ni la publicación manual Supabase.
