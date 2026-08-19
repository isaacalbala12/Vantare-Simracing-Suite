/** Catalogo `roadmap.*` di Command Orbit v0.3 (`docs/design/orbit-v03/14-i18n.md`).
    Vista «Cosa arriva» (D-R3-F-1): una colonna narrativa ORA / PROSSIMO / FATTO.
    Solo etichette: fasi e traguardi vengono da `docs/roadmap-source.json`. */
export const roadmapOrbitIt: Record<string, string> = {
  "roadmap.eyebrow": "Direzione del prodotto",
  "roadmap.title": "Roadmap",
  "roadmap.lead":
    "Ciò su cui si sta lavorando ora, ciò che arriva dopo e ciò che è già pubblicato, così come lo dichiara docs/roadmap-source.json.",

  "roadmap.source.loading": "Caricamento della fonte…",
  "roadmap.source.ok": "Fonte disponibile · {{version}}",
  "roadmap.source.fallback": "Copia inclusa · {{version}}",

  "roadmap.channel.stable": "Stable",
  "roadmap.channel.testers": "Testers",
  "roadmap.channel.nightly": "Nightly",

  "roadmap.state.done": "Completata",
  "roadmap.state.active": "In corso",
  "roadmap.state.planned": "Da pianificare",
  "roadmap.state.future": "Futuro",

  "roadmap.now.title": "Ora",
  "roadmap.now.position": "Fase {{n}} di {{total}}",
  "roadmap.now.none": "La fonte non dichiara nessuna fase in corso.",
  "roadmap.now.anchored": "Traguardi di questa fase",

  "roadmap.next.title": "Prossimo",
  "roadmap.next.none": "La fonte non dichiara nessuna fase da pianificare.",
  "roadmap.next.plans": "Piani dichiarati",

  "roadmap.done.title": "Fatto",
  "roadmap.done.accordion": "Fasi completate e traguardi pubblicati",
  "roadmap.done.summary": "{{phases}} fasi · {{releases}} pubblicati",
  "roadmap.done.none": "La fonte non dichiara nessuna fase completata.",
  "roadmap.done.released": "Pubblicato",

  "roadmap.derived": "derivato",
  "roadmap.derivedNote":
    "La fonte non dice a quale fase appartiene ogni traguardo: la ripartizione viene dal suo tipo.",

  "roadmap.context.title": "Roadmap",
  "roadmap.context.nowSub": "la fase in corso",
  "roadmap.context.nextSub": "da pianificare e future",
  "roadmap.context.doneSub": "completate e pubblicate",
  "roadmap.context.hint": "Tocca una sezione per saltarci.",
};
