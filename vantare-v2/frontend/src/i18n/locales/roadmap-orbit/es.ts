/** Catálogo `roadmap.*` de Command Orbit v0.3 (`docs/design/orbit-v03/14-i18n.md`).
    Vista «Qué viene» (D-R3-F-1): una columna narrativa AHORA / PRÓXIMO / HECHO.
    Solo rótulos: fases e hitos vienen de `docs/roadmap-source.json`. */
export const roadmapOrbitEs: Record<string, string> = {
  "roadmap.eyebrow": "Dirección del producto",
  "roadmap.title": "Roadmap",
  "roadmap.lead":
    "Lo que se está haciendo ahora, lo que viene después y lo ya publicado, tal y como lo declara docs/roadmap-source.json.",

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

  "roadmap.derived": "derivado",
  "roadmap.derivedNote":
    "La fuente no dice a qué fase pertenece cada hito: el reparto sale de su tipo.",

  "roadmap.context.title": "Roadmap",
  "roadmap.context.nowSub": "la fase en curso",
  "roadmap.context.nextSub": "por planear y futuras",
  "roadmap.context.doneSub": "completadas y publicadas",
  "roadmap.context.hint": "Pulsa una sección para saltar a ella.",
};
