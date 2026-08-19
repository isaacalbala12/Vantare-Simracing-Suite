/** Catálogo `telemetry.*` do Command Orbit v0.3 (`docs/design/orbit-v03/14-i18n.md`). */
export const telemetryOrbitPt: Record<string, string> = {
  "telemetry.eyebrow": "Análise pós-sessão",
  "telemetry.lead":
    "Compara a tua melhor volta com uma referência e diz-te, curva a curva, onde se perde o tempo e porquê.",
  "telemetry.title": "{{track}} · {{car}}",
  "telemetry.titleEmpty": "Sem volta analisada",

  "telemetry.refs.label": "Referência",
  "telemetry.refs.best": "vs melhor própria",
  "telemetry.refs.session": "vs melhor sessão",
  "telemetry.refs.pro": "vs referência Vantare",

  "telemetry.status.synthetic": "Dados sintéticos",
  "telemetry.status.real": "Sessão real",
  "telemetry.status.empty": "Sem sessões",

  "telemetry.kpi.lap": "Volta analisada",
  "telemetry.kpi.lapSub": "volta {{lap}} de {{laps}} · ótima teórica {{optimal}}",
  "telemetry.kpi.delta": "Delta à referência",
  "telemetry.kpi.deltaSub": "referência {{reference}} · {{label}}",
  "telemetry.kpi.sectors": "Setores",
  "telemetry.kpi.consistency": "Consistência",
  "telemetry.kpi.consistencySub": "{{good}} de {{laps}} voltas a ±0.5 s",
  "telemetry.kpi.none": "—",
  "telemetry.kpi.noneSub": "sem dados de sessão",

  "telemetry.map.title": "Mapa",
  "telemetry.map.meta": "cor = tempo ganho / perdido",
  "telemetry.map.gain": "ganhas",
  "telemetry.map.neutral": "neutro",
  "telemetry.map.loss": "perdes",
  "telemetry.map.hint": "clica numa curva para saltar",
  "telemetry.map.empty": "O mapa é desenhado quando houver uma volta gravada.",

  "telemetry.traces.title": "Traços",
  "telemetry.traces.axis": "Eixo",
  "telemetry.traces.distance": "Distância",
  "telemetry.traces.time": "Tempo",
  "telemetry.traces.timeDisabled": "O eixo temporal precisa da marca de tempo por amostra, que a fonte ainda não expõe.",
  "telemetry.traces.speed": "Velocidade",
  "telemetry.traces.speedUnit": "km/h",
  "telemetry.traces.pedals": "Acelerador / Travão",
  "telemetry.traces.pedalsUnit": "%",
  "telemetry.traces.steer": "Volante",
  "telemetry.traces.steerUnit": "°",
  "telemetry.traces.delta": "Delta",
  "telemetry.traces.deltaUnit": "s",
  "telemetry.traces.cursorEmpty": "— m",
  "telemetry.traces.cursor": "{{meters}} m · {{speed}} km/h",
  "telemetry.traces.mine": "a tua volta",
  "telemetry.traces.ref": "referência",
  "telemetry.traces.throttle": "acelerador",
  "telemetry.traces.brake": "travão",
  "telemetry.traces.empty": "Os traços são desenhados quando houver uma volta gravada.",

  "telemetry.insights.title": "Onde se perde o tempo",
  "telemetry.insights.meta": "ordenado por perda",
  "telemetry.insights.loss": "Perdes tempo em {{corner}}",
  "telemetry.insights.gain": "Ganhas em {{corner}}",
  "telemetry.insights.flat": "{{corner}} · neutro",
  "telemetry.insights.empty": "Ainda não há curvas para analisar.",

  "telemetry.empty.title": "Não há sessões disponíveis",
  "telemetry.empty.body":
    "Não há sessões disponíveis · importa ficheiros locais de LMU quando o fluxo estiver disponível.",

  "telemetry.context.title": "Sessões",
  "telemetry.context.session": "{{when}} · {{laps}} voltas · {{best}}",
  "telemetry.context.hint":
    "Fonte: ficheiros locais de LMU indexados em DuckDB (ADR 0005). A ponte ainda não publica sessões.",
  "telemetry.context.empty": "Sem sessões indexadas.",

  "telemetry.demo.note":
    "o circuito, os canais e os insights são gerados por este ecrã para mostrar a estrutura. Não são uma sessão tua.",
  "telemetry.demo.lap": "2:04.512",
  "telemetry.demo.optimal": "2:04.101",
  "telemetry.demo.reference": "2:03.980",
  "telemetry.demo.referenceLabel": "volta 4",
  "telemetry.demo.why.t1": "Bom apoio de entrada; mantens mais 3 km/h no vértice.",
  "telemetry.demo.why.t3": "Travas 9 m antes da referência e largas o travão de repente.",
  "telemetry.demo.why.t5": "Trajetória ligeiramente aberta na saída.",
  "telemetry.demo.why.t7":
    "Travas 12 m antes e com menos 15 % de pressão; chegas ao vértice 6 km/h mais lento.",
  "telemetry.demo.why.t10": "Aceleras 8 m antes na saída; ganhas até à reta.",
  "telemetry.demo.why.t13": "Dupla correção de volante a meio da curva; perdes tração.",
  "telemetry.demo.why.t15": "Metes a 3.ª tarde; o motor cai fora do binário na saída.",
  "telemetry.demo.why.t17": "Travagem de 42 m contra 33 m da referência; o carro entra menos virado.",
};
