# Mantenimiento del roadmap público

Isaac comunica los cambios a Codex por chat. Codex actualiza una única
publicación compartida en Supabase; la app solo la muestra como línea temporal,
tablero por estado y gráfico de distribución. No hay editor en la app, archivo
de contenido ni generador.

## Actualización solicitada por Isaac

1. Leer la publicación vigente con `visual_roadmap_current` y comprobar el
   proyecto Supabase de destino. Si no hay publicación, comenzar con
   `{"schemaVersion":1,"items":[]}`.
2. Preparar los cambios solicitados conservando los identificadores de hitos
   existentes. Cada hito tiene `id` UUID, `section` (`done`, `now` o `next`),
   `title` y `body` en `es`, `en`, `pt`, `it`. El título español es obligatorio;
   las demás traducciones pueden quedar vacías y la app mostrará español.
   El orden de los hitos dentro de cada estado es el orden de `items`.
3. Si el contenido o el destino es ambiguo, aclararlo con Isaac. No derivar
   automáticamente estados o fechas de GitHub/Notion ni inventar porcentajes.
4. Comprobar `visual_roadmap_valid(document)` y publicar mediante la conexión
   SQL privilegiada con `visual_roadmap_publish(document)`. La función conserva
   la versión anterior como `superseded` y publica la nueva de forma atómica.
   Los clientes `anon` y `authenticated` no tienen permiso para publicar.
5. Releer `visual_roadmap_current` y comprobar ID, texto, orden y estado.
   Verificar en una sesión lectora que aparece al recargar Roadmap. Registrar
   el cambio en la tarea Notion aplicable.

El seguimiento interno, las dependencias y los canales siguen en Notion y
GitHub. Publicar un hito no cambia el estado de una tarea, PR, canal o release.

## Primera activación

La migración `supabase/migrations/20260924000000_visual_roadmap.sql` crea el
almacenamiento y las funciones de lectura y publicación. Probar primero en un
entorno de prueba con una sesión lectora; después de integrar la PR y validar
su despliegue, aplicar la migración al entorno elegido. La migración no importa
ni publica el plan histórico. Hasta la primera publicación, la pantalla muestra
un estado vacío.
