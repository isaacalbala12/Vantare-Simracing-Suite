/** Catálogo `roadmap.*` de Command Orbit v0.3 (`docs/design/orbit-v03/14-i18n.md`).
    Solo rótulos: fases, áreas e hitos vienen de `docs/roadmap-source.json`. */
export const roadmapOrbitEs: Record<string, string> = {
  "roadmap.eyebrow": "Dirección del producto",
  "roadmap.title": "Roadmap",
  "roadmap.lead":
    "Fases, áreas e hitos declarados en docs/roadmap-source.json. Progreso en escala 0/10/25/50/75/100; sin fechas públicas.",

  "roadmap.source.loading": "Cargando la fuente…",
  "roadmap.source.ok": "Fuente disponible · {{version}}",
  "roadmap.source.fallback": "Fuente empaquetada · {{version}}",

  "roadmap.kpi.phase": "Fase actual",
  "roadmap.kpi.phaseSub": "{{target}} · {{progress}} % · {{fronts}} frentes abiertos",
  "roadmap.kpi.phaseNoneSub": "la fuente no declara ninguna fase en curso",
  "roadmap.kpi.areas": "Áreas",
  "roadmap.kpi.areasSub": "{{active}} en curso · {{planned}} planificadas",
  "roadmap.kpi.milestones": "Hitos",
  "roadmap.kpi.milestonesNoneSub": "la fuente no declara hitos",
  "roadmap.kpi.channel": "Canal",
  "roadmap.kpi.channelSub": "testers y nightly reciben antes cada hito",
  "roadmap.kpi.none": "—",

  "roadmap.channel.stable": "Stable",
  "roadmap.channel.testers": "Testers",
  "roadmap.channel.nightly": "Nightly",

  "roadmap.phases.title": "Fases",
  "roadmap.phases.meta": "{{n}} fases · progreso declarado",
  "roadmap.phases.eyebrowLine": "{{state}} · {{target}} · {{progress}} %",
  "roadmap.phases.eyebrowShort": "{{state}} · {{progress}} %",

  "roadmap.state.done": "Completada",
  "roadmap.state.active": "En curso",
  "roadmap.state.planned": "Por planear",
  "roadmap.state.future": "Futuro",

  "roadmap.areas.title": "Áreas",
  "roadmap.areas.progress": "{{progress}} % del área",
  "roadmap.areaState.done": "completada",
  "roadmap.areaState.active": "en curso",
  "roadmap.areaState.planned": "planificada",
  "roadmap.areaState.future": "futuro",

  "roadmap.milestones.title": "Hitos",
  "roadmap.milestones.meta": "orden declarado",

  "roadmap.context.title": "Fases",
  "roadmap.context.hint": "Pulsa una fase para saltar a su columna.",
};
