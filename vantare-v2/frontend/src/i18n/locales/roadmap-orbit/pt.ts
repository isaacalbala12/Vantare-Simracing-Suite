/** Catálogo `roadmap.*` do Command Orbit v0.3 (`docs/design/orbit-v03/14-i18n.md`).
    Vista «O que vem» (D-R3-F-1): uma coluna narrativa AGORA / PRÓXIMO / FEITO.
    O conteúdo público é editado e publicado no app. */
export const roadmapOrbitPt: Record<string, string> = {
  "roadmap.eyebrow": "Direção do produto",
  "roadmap.title": "Roadmap",
  "roadmap.lead":
    "Agora, a seguir e concluído. A equipa edita e publica este espaço na aplicação.",

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
  "roadmap.editor.open": "Editar",
  "roadmap.editor.close": "Fechar editor",
  "roadmap.editor.unpublished": "Ainda não há um roadmap publicado.",
  "roadmap.editor.help": "Escreve em espanhol; as traduções são opcionais. Guarda um rascunho antes de publicar.",
  "roadmap.editor.translations": "Traduções opcionais",
  "roadmap.editor.add": "Adicionar item",
  "roadmap.editor.save": "Guardar rascunho",
  "roadmap.editor.saving": "A guardar…",
  "roadmap.editor.publish": "Publicar para todos",
  "roadmap.editor.publishing": "A publicar…",
  "roadmap.editor.saved": "Rascunho guardado.",
  "roadmap.editor.published": "Roadmap publicado.",
  "roadmap.editor.item": "Item",
  "roadmap.editor.section": "Secção",
  "roadmap.editor.itemTitle": "Título",
  "roadmap.editor.itemBody": "Descrição",
  "roadmap.editor.up": "Subir",
  "roadmap.editor.down": "Descer",
  "roadmap.editor.delete": "Eliminar",
  "roadmap.editor.connectionError": "Não foi possível ligar ao roadmap.",
  "roadmap.editor.invalidRemote": "O roadmap recebido é inválido.",
  "roadmap.editor.invalid.size": "Há demasiados itens ou o conteúdo é demasiado longo.",
  "roadmap.editor.invalid.id": "Um ID de item é inválido ou duplicado.",
  "roadmap.editor.invalid.section": "Uma secção é inválida.",
  "roadmap.editor.invalid.title": "Preenche os títulos nos quatro idiomas.",
  "roadmap.editor.invalid.body": "Uma descrição é demasiado longa.",
};
