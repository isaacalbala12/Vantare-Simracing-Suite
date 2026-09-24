/** Catalogo `roadmap.*` di Command Orbit v0.3 (`docs/design/orbit-v03/14-i18n.md`).
    Vista «Cosa arriva» (D-R3-F-1): una colonna narrativa ORA / PROSSIMO / FATTO.
    Il contenuto pubblico viene modificato e pubblicato nell'app. */
export const roadmapOrbitIt: Record<string, string> = {
  "roadmap.eyebrow": "Direzione del prodotto",
  "roadmap.title": "Roadmap",
  "roadmap.lead":
    "Ora, prossimamente e fatto. Il team modifica e pubblica questo spazio nell'app.",

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

  "roadmap.delivered.title": "Consegnato di recente",
  "roadmap.delivered.note":
    "{{n}} modifiche lette dai commit già uniti in nightly, non dal piano.",
  "roadmap.delivered.kind.feat": "Novità",
  "roadmap.delivered.kind.fix": "Correzione",
  "roadmap.delivered.kind.perf": "Prestazioni",
  "roadmap.delivered.kind.docs": "Documentazione",
  "roadmap.delivered.kind.change": "Modifica",

  "roadmap.derived": "derivato",
  "roadmap.derivedNote":
    "La fonte non dice a quale fase appartiene ogni traguardo: la ripartizione viene dal suo tipo.",

  "roadmap.context.title": "Roadmap",
  "roadmap.context.nowSub": "la fase in corso",
  "roadmap.context.nextSub": "da pianificare e future",
  "roadmap.context.doneSub": "completate e pubblicate",
  "roadmap.context.hint": "Tocca una sezione per saltarci.",
  "roadmap.editor.open": "Modifica",
  "roadmap.editor.close": "Chiudi editor",
  "roadmap.editor.unpublished": "Nessun roadmap è stato ancora pubblicato.",
  "roadmap.editor.help": "Scrivi in spagnolo; le traduzioni sono facoltative. Salva una bozza prima di pubblicare.",
  "roadmap.editor.translations": "Traduzioni facoltative",
  "roadmap.editor.add": "Aggiungi elemento",
  "roadmap.editor.save": "Salva bozza",
  "roadmap.editor.saving": "Salvataggio…",
  "roadmap.editor.publish": "Pubblica per tutti",
  "roadmap.editor.publishing": "Pubblicazione…",
  "roadmap.editor.saved": "Bozza salvata.",
  "roadmap.editor.published": "Roadmap pubblicato.",
  "roadmap.editor.item": "Elemento",
  "roadmap.editor.section": "Sezione",
  "roadmap.editor.itemTitle": "Titolo",
  "roadmap.editor.itemBody": "Descrizione",
  "roadmap.editor.up": "Su",
  "roadmap.editor.down": "Giù",
  "roadmap.editor.delete": "Elimina",
  "roadmap.editor.connectionError": "Impossibile connettersi al roadmap.",
  "roadmap.editor.invalidRemote": "Il roadmap ricevuto non è valido.",
  "roadmap.editor.invalid.size": "Ci sono troppi elementi o il contenuto è troppo lungo.",
  "roadmap.editor.invalid.id": "Un ID elemento non è valido o è duplicato.",
  "roadmap.editor.invalid.section": "Una sezione non è valida.",
  "roadmap.editor.invalid.title": "Completa i titoli in tutte e quattro le lingue.",
  "roadmap.editor.invalid.body": "Una descrizione è troppo lunga.",
};
