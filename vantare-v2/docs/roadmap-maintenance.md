# Mantenimiento del roadmap público

El roadmap público se edita en el Hub de Vantare. No hay un archivo de contenido que mantener ni un generador que ejecutar.

## Edición

1. Inicia sesión con la cuenta Owner y abre **Roadmap**.
2. Pulsa **Editar**, añade las tarjetas y elige **Ahora**, **Después** o **Hecho**.
3. Escribe título y descripción en español. Las traducciones a inglés, portugués e italiano son opcionales; si faltan, la app muestra el texto español. Puedes cambiar el orden, la sección o eliminar tarjetas.
4. Pulsa **Guardar borrador**. Los demás usuarios siguen viendo la última versión publicada.
5. Revisa el contenido y pulsa **Publicar**. La publicación queda disponible para todos los usuarios, en cualquier equipo, al volver a cargar la sección.

El seguimiento interno, las dependencias y las decisiones siguen en Notion. Publicar el roadmap es una decisión editorial de Isaac y no cambia por sí solo el estado de una tarea, PR, canal o release.

## Contrato técnico

La migración `supabase/migrations/20260924000000_visual_roadmap.sql` crea el almacenamiento compartido. La lectura pública usa `visual_roadmap_current`; el borrador, guardado y publicación exigen la sesión Owner y se validan en la base de datos. El cliente Wails conecta estas operaciones con la pantalla. No se debe publicar un borrador por un proceso automático.

Antes de habilitar el flujo en un entorno, aplicar la migración y verificar manualmente con dos sesiones: Owner guarda sin publicar y un lector sigue viendo la versión anterior; Owner publica y el lector ve la nueva versión tras recargar. Si todavía no existe una publicación, se muestra un estado vacío honesto.
