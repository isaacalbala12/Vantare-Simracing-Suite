/** Catálogo `roadmap.*` do Command Orbit v0.3 (`docs/design/orbit-v03/14-i18n.md`).
    Vista «O que vem» (D-R3-F-1): uma coluna narrativa AGORA / PRÓXIMO / FEITO.
    Só rótulos: fases e marcos vêm de `docs/roadmap/roadmap.json`. */
export const roadmapOrbitPt: Record<string, string> = {
  "roadmap.eyebrow": "Direção do produto",
  "roadmap.title": "Roadmap",
  "roadmap.lead":
    "O que está a ser feito agora, o que vem a seguir e o que já foi publicado, tal como declara docs/roadmap/plan.md.",

  "roadmap.source.loading": "A carregar a fonte…",
  "roadmap.source.ok": "Fonte disponível · {{version}}",
  "roadmap.source.fallback": "Cópia empacotada · {{version}}",

  "roadmap.channel.stable": "Stable",
  "roadmap.channel.testers": "Testers",
  "roadmap.channel.nightly": "Nightly",

  "roadmap.state.done": "Concluída",
  "roadmap.state.active": "Em curso",
  "roadmap.state.planned": "Por planear",
  "roadmap.state.future": "Futuro",

  "roadmap.now.title": "Agora",
  "roadmap.now.position": "Fase {{n}} de {{total}}",
  "roadmap.now.none": "A fonte não declara nenhuma fase em curso.",
  "roadmap.now.anchored": "Marcos desta fase",

  "roadmap.next.title": "Próximo",
  "roadmap.next.none": "A fonte não declara nenhuma fase por planear.",
  "roadmap.next.plans": "Planos declarados",

  "roadmap.done.title": "Feito",
  "roadmap.done.accordion": "Fases concluídas e marcos publicados",
  "roadmap.done.summary": "{{phases}} fases · {{releases}} publicados",
  "roadmap.done.none": "A fonte não declara nenhuma fase concluída.",
  "roadmap.done.released": "Publicado",

  "roadmap.delivered.title": "Entregue recentemente",
  "roadmap.delivered.note":
    "{{n}} alterações lidas dos commits já integrados em nightly, não do plano.",
  "roadmap.delivered.kind.feat": "Novidade",
  "roadmap.delivered.kind.fix": "Correção",
  "roadmap.delivered.kind.perf": "Desempenho",
  "roadmap.delivered.kind.docs": "Documentação",
  "roadmap.delivered.kind.change": "Alteração",

  "roadmap.derived": "derivado",
  "roadmap.derivedNote":
    "A fonte não diz a que fase pertence cada marco: a distribuição vem do seu tipo.",

  "roadmap.context.title": "Roadmap",
  "roadmap.context.nowSub": "a fase em curso",
  "roadmap.context.nextSub": "por planear e futuras",
  "roadmap.context.doneSub": "concluídas e publicadas",
  "roadmap.context.hint": "Carrega numa secção para saltar para ela.",
};
