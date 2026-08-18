/** Catálogo `telemetry.*` de Command Orbit v0.3 (`docs/design/orbit-v03/14-i18n.md`). */
export const telemetryOrbitEs: Record<string, string> = {
  "telemetry.eyebrow": "Análisis post-sesión",
  "telemetry.lead":
    "Compara tu mejor vuelta con una referencia y te dice, curva a curva, dónde se va el tiempo y por qué.",
  "telemetry.title": "{{track}} · {{car}}",
  "telemetry.titleEmpty": "Sin sesión analizada",

  "telemetry.refs.label": "Referencia",
  "telemetry.refs.best": "vs mejor propia",
  "telemetry.refs.session": "vs mejor sesión",
  "telemetry.refs.pro": "vs referencia Vantare",

  "telemetry.status.synthetic": "Datos sintéticos",
  "telemetry.status.real": "Sesión real",
  "telemetry.status.empty": "Sin sesiones",

  "telemetry.kpi.lap": "Vuelta analizada",
  "telemetry.kpi.lapSub": "vuelta {{lap}} de {{laps}} · óptima teórica {{optimal}}",
  "telemetry.kpi.delta": "Delta a referencia",
  "telemetry.kpi.deltaSub": "referencia {{reference}} · {{label}}",
  "telemetry.kpi.sectors": "Sectores",
  "telemetry.kpi.consistency": "Consistencia",
  "telemetry.kpi.consistencySub": "{{good}} de {{laps}} vueltas a ±0.5 s",
  "telemetry.kpi.none": "—",
  "telemetry.kpi.noneSub": "sin datos de sesión",

  "telemetry.map.title": "Mapa",
  "telemetry.map.meta": "color = tiempo ganado / perdido",
  "telemetry.map.gain": "ganas",
  "telemetry.map.neutral": "neutro",
  "telemetry.map.loss": "pierdes",
  "telemetry.map.hint": "clic en una curva para saltar",
  "telemetry.map.empty": "El mapa se dibuja cuando haya una vuelta grabada.",

  "telemetry.traces.title": "Trazas",
  "telemetry.traces.axis": "Eje",
  "telemetry.traces.distance": "Distancia",
  "telemetry.traces.time": "Tiempo",
  "telemetry.traces.timeDisabled": "El eje temporal necesita la marca de tiempo por muestra, que la fuente todavía no expone.",
  "telemetry.traces.speed": "Velocidad",
  "telemetry.traces.speedUnit": "km/h",
  "telemetry.traces.pedals": "Acelerador / Freno",
  "telemetry.traces.pedalsUnit": "%",
  "telemetry.traces.steer": "Volante",
  "telemetry.traces.steerUnit": "°",
  "telemetry.traces.delta": "Delta",
  "telemetry.traces.deltaUnit": "s",
  "telemetry.traces.cursorEmpty": "— m",
  "telemetry.traces.cursor": "{{meters}} m · {{speed}} km/h",
  "telemetry.traces.mine": "tu vuelta",
  "telemetry.traces.ref": "referencia",
  "telemetry.traces.throttle": "acelerador",
  "telemetry.traces.brake": "freno",
  "telemetry.traces.empty": "Las trazas se dibujan cuando haya una vuelta grabada.",

  "telemetry.insights.title": "Dónde se va el tiempo",
  "telemetry.insights.meta": "ordenado por pérdida",
  "telemetry.insights.loss": "Pierdes tiempo en {{corner}}",
  "telemetry.insights.gain": "Ganas en {{corner}}",
  "telemetry.insights.flat": "{{corner}} · neutro",
  "telemetry.insights.empty": "Sin curvas que analizar todavía.",

  "telemetry.empty.title": "No hay sesiones disponibles",
  "telemetry.empty.body":
    "No hay sesiones disponibles · importa archivos locales de LMU cuando el flujo esté disponible.",

  "telemetry.context.title": "Sesiones",
  "telemetry.context.session": "{{when}} · {{laps}} vueltas · {{best}}",
  "telemetry.context.hint":
    "Fuente: archivos locales de LMU indexados en DuckDB (ADR 0005). El puente todavía no publica sesiones.",
  "telemetry.context.empty": "Sin sesiones indexadas.",

  "telemetry.demo.note":
    "el circuito, los canales y los insights los genera la propia pantalla para enseñar la estructura. No son una sesión tuya.",
  "telemetry.demo.lap": "2:04.512",
  "telemetry.demo.optimal": "2:04.101",
  "telemetry.demo.reference": "2:03.980",
  "telemetry.demo.referenceLabel": "vuelta 4",
  "telemetry.demo.why.t1": "Buen apoyo de entrada; mantienes 3 km/h más en el vértice.",
  "telemetry.demo.why.t3": "Frenas 9 m antes que la referencia y sueltas el freno de golpe.",
  "telemetry.demo.why.t5": "Trazada ligeramente ancha en la salida.",
  "telemetry.demo.why.t7":
    "Frenas 12 m antes y con un 15 % menos de presión; llegas al vértice 6 km/h más lento.",
  "telemetry.demo.why.t10": "Aceleras 8 m antes en la salida; ganas hasta la recta.",
  "telemetry.demo.why.t13": "Doble corrección de volante a mitad de curva; pierdes tracción.",
  "telemetry.demo.why.t15": "Cambias a 3.ª tarde; el motor cae fuera de par en la salida.",
  "telemetry.demo.why.t17": "Freno de 42 m contra 33 m de referencia; el coche entra menos girado.",
};
