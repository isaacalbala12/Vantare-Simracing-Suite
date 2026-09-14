# Autoría de sistemas visuales

La guía vigente es [Workshop: autoría directa](overlays-studio/overlay-workshop-authoring-guide.md) y su [contrato](overlays-studio/os-09-overlay-workshop-contract.md).

Editar el TSX/CSS productivo que consume `WidgetVisualHost`; Workshop lo refleja mediante HMR. Un HTML es referencia visual, no otro renderer ni un compilador. No copiar automáticamente un scaffold antiguo ni crear un registro genérico sin una decisión de la tarea.

Mantener renderizadores puros, assets locales, CSS acotado, estados de datos explícitos y comprobación por superficie. No acceder desde el renderer a Wails, SSE, persistencia, permisos o posición. Los checks y la URL reproducible pertenecen al protocolo de Workshop.
