/** Catálogo `roadmap.*` de Command Orbit v0.3 (`docs/design/orbit-v03/14-i18n.md`).
    Vista «Qué viene» (D-R3-F-1): una columna narrativa AHORA / PRÓXIMO / HECHO.
    El contenido público se edita y publica desde la app. */
export const roadmapOrbitEs: Record<string, string> = {
  "roadmap.eyebrow": "Dirección del producto",
  "roadmap.title": "Roadmap",
  "roadmap.lead":
    "Ahora, después y hecho. El equipo edita y publica este espacio desde la aplicación.",

  "roadmap.source.loading": "Cargando la fuente…",
  "roadmap.source.ok": "Fuente disponible · {{version}}",
  "roadmap.source.fallback": "Fuente empaquetada · {{version}}",

  "roadmap.channel.stable": "Stable",
  "roadmap.channel.testers": "Testers",
  "roadmap.channel.nightly": "Nightly",

  "roadmap.state.done": "Completada",
  "roadmap.state.active": "En curso",
  "roadmap.state.planned": "Por planear",
  "roadmap.state.future": "Futuro",

  "roadmap.now.title": "Ahora",
  "roadmap.now.position": "Fase {{n}} de {{total}}",
  "roadmap.now.none": "La fuente no declara ninguna fase en curso.",
  "roadmap.now.anchored": "Hitos de esta fase",

  "roadmap.next.title": "Próximo",
  "roadmap.next.none": "La fuente no declara ninguna fase por planear.",
  "roadmap.next.plans": "Planes declarados",

  "roadmap.done.title": "Hecho",
  "roadmap.done.accordion": "Fases completadas e hitos publicados",
  "roadmap.done.summary": "{{phases}} fases · {{releases}} publicados",
  "roadmap.done.none": "La fuente no declara ninguna fase completada.",
  "roadmap.done.released": "Publicado",

  "roadmap.delivered.title": "Entregado recientemente",
  "roadmap.delivered.note":
    "{{n}} cambios leídos de los commits ya mergeados a nightly, no del plan.",
  "roadmap.delivered.kind.feat": "Novedad",
  "roadmap.delivered.kind.fix": "Corrección",
  "roadmap.delivered.kind.perf": "Rendimiento",
  "roadmap.delivered.kind.docs": "Documentación",
  "roadmap.delivered.kind.change": "Cambio",

  "roadmap.derived": "derivado",
  "roadmap.derivedNote":
    "La fuente no dice a qué fase pertenece cada hito: el reparto sale de su tipo.",

  "roadmap.context.title": "Roadmap",
  "roadmap.context.nowSub": "la fase en curso",
  "roadmap.context.nextSub": "por planear y futuras",
  "roadmap.context.doneSub": "completadas y publicadas",
  "roadmap.context.hint": "Pulsa una sección para saltar a ella.",
  "roadmap.editor.open": "Editar",
  "roadmap.editor.close": "Cerrar edición",
  "roadmap.editor.unpublished": "Todavía no hay un roadmap publicado.",
  "roadmap.editor.help": "Escribe en español; las traducciones son opcionales. Guarda un borrador antes de publicar.",
  "roadmap.editor.translations": "Traducciones opcionales",
  "roadmap.editor.add": "Añadir elemento",
  "roadmap.editor.save": "Guardar borrador",
  "roadmap.editor.saving": "Guardando…",
  "roadmap.editor.publish": "Publicar para todos",
  "roadmap.editor.publishing": "Publicando…",
  "roadmap.editor.saved": "Borrador guardado.",
  "roadmap.editor.published": "Roadmap publicado.",
  "roadmap.editor.item": "Elemento",
  "roadmap.editor.section": "Sección",
  "roadmap.editor.itemTitle": "Título",
  "roadmap.editor.itemBody": "Descripción",
  "roadmap.editor.up": "Subir",
  "roadmap.editor.down": "Bajar",
  "roadmap.editor.delete": "Eliminar",
  "roadmap.editor.connectionError": "No se pudo conectar con el roadmap.",
  "roadmap.editor.invalidRemote": "El roadmap recibido no es válido.",
  "roadmap.editor.invalid.size": "Hay demasiados elementos o el contenido es demasiado largo.",
  "roadmap.editor.invalid.id": "Hay un identificador de elemento inválido o repetido.",
  "roadmap.editor.invalid.section": "Hay una sección inválida.",
  "roadmap.editor.invalid.title": "Completa los títulos en los cuatro idiomas.",
  "roadmap.editor.invalid.body": "Una descripción es demasiado larga.",
};
