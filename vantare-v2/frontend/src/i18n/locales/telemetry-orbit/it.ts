/** Catalogo `telemetry.*` di Command Orbit v0.3 (`docs/design/orbit-v03/14-i18n.md`). */
export const telemetryOrbitIt: Record<string, string> = {
  "telemetry.eyebrow": "Analisi post-sessione",
  "telemetry.lead":
    "Confronta il tuo giro migliore con un riferimento e ti dice, curva per curva, dove se ne va il tempo e perché.",
  "telemetry.title": "{{track}} · {{car}}",
  "telemetry.titleEmpty": "Nessun giro analizzato",

  "telemetry.refs.label": "Riferimento",
  "telemetry.refs.best": "vs miglior personale",
  "telemetry.refs.session": "vs miglior sessione",
  "telemetry.refs.pro": "vs riferimento Vantare",

  "telemetry.status.synthetic": "Dati sintetici",
  "telemetry.status.real": "Sessione reale",
  "telemetry.status.empty": "Nessuna sessione",

  "telemetry.kpi.lap": "Giro analizzato",
  "telemetry.kpi.lapSub": "giro {{lap}} di {{laps}} · ottimale teorico {{optimal}}",
  "telemetry.kpi.delta": "Delta dal riferimento",
  "telemetry.kpi.deltaSub": "riferimento {{reference}} · {{label}}",
  "telemetry.kpi.sectors": "Settori",
  "telemetry.kpi.consistency": "Costanza",
  "telemetry.kpi.consistencySub": "{{good}} giri su {{laps}} entro ±0.5 s",
  "telemetry.kpi.none": "—",
  "telemetry.kpi.noneSub": "nessun dato di sessione",

  "telemetry.map.title": "Mappa",
  "telemetry.map.meta": "colore = tempo guadagnato / perso",
  "telemetry.map.gain": "guadagni",
  "telemetry.map.neutral": "neutro",
  "telemetry.map.loss": "perdi",
  "telemetry.map.hint": "clic su una curva per saltare",
  "telemetry.map.empty": "La mappa si disegna quando c'è un giro registrato.",

  "telemetry.traces.title": "Tracce",
  "telemetry.traces.axis": "Asse",
  "telemetry.traces.distance": "Distanza",
  "telemetry.traces.time": "Tempo",
  "telemetry.traces.timeDisabled": "L'asse temporale richiede il timestamp per campione, che la sorgente non espone ancora.",
  "telemetry.traces.speed": "Velocità",
  "telemetry.traces.speedUnit": "km/h",
  "telemetry.traces.pedals": "Acceleratore / Freno",
  "telemetry.traces.pedalsUnit": "%",
  "telemetry.traces.steer": "Sterzo",
  "telemetry.traces.steerUnit": "°",
  "telemetry.traces.delta": "Delta",
  "telemetry.traces.deltaUnit": "s",
  "telemetry.traces.cursorEmpty": "— m",
  "telemetry.traces.cursor": "{{meters}} m · {{speed}} km/h",
  "telemetry.traces.mine": "il tuo giro",
  "telemetry.traces.ref": "riferimento",
  "telemetry.traces.throttle": "acceleratore",
  "telemetry.traces.brake": "freno",
  "telemetry.traces.empty": "Le tracce si disegnano quando c'è un giro registrato.",

  "telemetry.insights.title": "Dove se ne va il tempo",
  "telemetry.insights.meta": "ordinato per perdita",
  "telemetry.insights.loss": "Perdi tempo in {{corner}}",
  "telemetry.insights.gain": "Guadagni in {{corner}}",
  "telemetry.insights.flat": "{{corner}} · neutro",
  "telemetry.insights.empty": "Ancora nessuna curva da analizzare.",

  "telemetry.empty.body":
    "Nessuna sessione disponibile · importa i file locali di LMU quando il flusso sarà disponibile.",

  "telemetry.context.title": "Sessioni",
  "telemetry.context.session": "{{when}} · {{laps}} giri · {{best}}",
  "telemetry.context.hint":
    "Fonte: file locali di LMU indicizzati in DuckDB (ADR 0005). Il ponte non pubblica ancora sessioni.",
  "telemetry.context.empty": "Nessuna sessione indicizzata.",

  "telemetry.demo.note":
    "il circuito, i canali e gli insight li genera questa schermata per mostrare la struttura. Non sono una tua sessione.",
  "telemetry.demo.lap": "2:04.512",
  "telemetry.demo.optimal": "2:04.101",
  "telemetry.demo.reference": "2:03.980",
  "telemetry.demo.referenceLabel": "giro 4",
  "telemetry.demo.why.t1": "Buon appoggio in ingresso; mantieni 3 km/h in più al vertice.",
  "telemetry.demo.why.t3": "Freni 9 m prima del riferimento e rilasci il freno di colpo.",
  "telemetry.demo.why.t5": "Traiettoria leggermente larga in uscita.",
  "telemetry.demo.why.t7":
    "Freni 12 m prima e con il 15 % di pressione in meno; arrivi al vertice 6 km/h più lento.",
  "telemetry.demo.why.t10": "Acceleri 8 m prima in uscita; guadagni fino al rettilineo.",
  "telemetry.demo.why.t13": "Doppia correzione di sterzo a metà curva; perdi trazione.",
  "telemetry.demo.why.t15": "Passi in 3ª tardi; il motore esce dalla coppia in uscita.",
  "telemetry.demo.why.t17": "Frenata di 42 m contro 33 m del riferimento; l'auto entra meno girata.",
};
