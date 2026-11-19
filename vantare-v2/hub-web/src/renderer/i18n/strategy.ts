const timeText = {
  lessThanMinute: "menos de un minuto",
  hours: (n: number) => `${n} ${n === 1 ? "hora" : "horas"}`,
  minutes: (n: number) => `${n} ${n === 1 ? "minuto" : "minutos"}`,
  stops: (n: number) =>
    n === 0 ? "sin paradas" : `${n} ${n === 1 ? "parada" : "paradas"}`,
  stints: (n: number) => `${n} ${n === 1 ? "stint" : "stints"}`,
};

export const strategy = {
  symbols: { more: "⋯", add: "+", flag: "⚑", next: "›" },
  returnToCollection: "← Tus estrategias",
  variantName: (name: string) => `Estrategia «${name}»`,
  dataReady: "Datos listos",
  noData: "Sin datos",
  title: "Estrategia",
  collection: "Tus estrategias",
  description:
    "Prepara el plan de paradas de una carrera con tus propios datos: combustible, energía virtual, neumáticos y boxes.",
  continue: "Continuar",
  back: "Atrás",
  new: "Nueva estrategia",
  newDetail: "Cinco pasos: carrera, reglas, piloto y revisión.",
  start: "Empezar",
  savedRaces: "Guardadas",
  onDevice: "En el archivo de estrategias de este equipo",
  opened: "Abierta",
  counts: (drivers: number, strategies: number) =>
    `${drivers} ${drivers === 1 ? "piloto" : "pilotos"} · ${strategies} ${strategies === 1 ? "estrategia" : "estrategias"}`,
  empty: "Aún no tienes estrategias",
  emptyDetail:
    "Crea la primera con el asistente o abre un archivo de estrategias que tengas en este equipo.",
  imported: "Hemos traído tu último borrador del Hub anterior",
  importedDetail:
    "Ya está en tu archivo de estrategias. El archivo antiguo sigue igual: no lo hemos cambiado ni borrado.",
  recovered: "Tu archivo de estrategias estaba dañado y no se podía leer",
  recoveredDetail:
    "Hemos guardado una copia aparte, con el final «.invalid», en la carpeta de datos de Vantare, y empezado con un archivo vacío. La copia no se toca.",
  protected: "Este archivo es de una versión más nueva de Vantare",
  protectedDetail:
    "Para no estropearlo, no lo hemos abierto ni cambiado. Actualiza Vantare para usarlo. Mientras tanto no se guarda nada encima.",
  understood: "Entendido",
  dirtySwitch: "Guarda o descarta antes de cambiar de carrera",
  dirtyRace: (current: string, target: string) =>
    `Tienes cambios sin guardar en «${current}». Para abrir «${target}», primero guárdalos o descártalos.`,
  saveAndOpen: "Guardar y abrir",
  discardAndOpen: "Descartar y abrir",
  stay: (name: string) => `Seguir en ${name}`,
  more: "Más acciones de archivo",
  fileActions: "Archivo",
  file: {
    saved: "Guardado",
    dirty: "Sin guardar",
    pending: "Datos sin confirmar",
    empty: "Archivo vacío",
    protected: "Protegido",
  },
  save: "Guardar",
  saveAs: "Guardar como…",
  open: "Abrir archivo…",
  openOther: "Abrir otro archivo…",
  discard: "Descartar cambios",
  conflict: "No se ha guardado: el archivo ha cambiado fuera de esta pantalla.",
  confirmConflict:
    "Los datos de la carrera han cambiado fuera de esta pantalla. Revisa lo que has escrito y vuelve a confirmar.",
  saved: "Guardado.",
  created: "Carrera creada.",
  loading: "Abriendo estrategias…",
  errors: {
    strategyFileUnavailable: "No se puede usar ese archivo.",
    strategyFileTooLarge: "Ese archivo de estrategias es demasiado grande.",
    strategyTargetExists:
      "Ya existe un archivo con ese nombre. Elige otro nombre.",
    strategyDirty: "Guarda o descarta los cambios antes de continuar.",
    strategyEditPending:
      "Confirma o descarta los datos pendientes antes de continuar.",
    strategyInvalidText:
      "No se han podido usar esos datos. Revisa lo que has escrito.",
    strategyInvalidInput: "El cálculo no ha aceptado los datos. Revísalos.",
    strategyImportFailed: "No hemos podido traer los datos del Hub anterior.",
    busy: "El archivo está ocupado. Vuelve a intentarlo.",
    other: "No se ha podido completar la acción.",
  },
  steps: ["Inicio", "Combinación", "Reglas", "Pilotos", "Revisa y crea"],
  stepsLabel: "Pasos de la nueva estrategia",
  step: (n: number) => `Paso ${n} de 5`,
  stepHeading: (n: number) => `Paso ${n} de 5 · ${strategy.steps[n - 1]}`,
  headings: [
    "Prepara tu próxima carrera",
    "¿Dónde y con qué coche?",
    "Reglas de la carrera",
    "Tu piloto",
    "Revisa y crea la carrera",
  ],
  introduction:
    "Escribes tú los datos de la carrera y del coche; Vantare calcula cuándo parar y cuánto cargar en cada parada.",
  manual: "Con tus datos",
  manualDetail:
    "Combustible, energía virtual, neumáticos y tiempos de boxes escritos a mano. No necesita telemetría.",
  combination:
    "Una carrera personalizada: escribe el circuito y la clase o el coche tal como quieras verlos.",
  fuelAndEnergy: "Combustible y energía virtual",
  advanced: "Neumáticos y boxes",
  service: "En la parada",
  parallel: "A la vez",
  sequential: "Uno tras otro",
  serviceHelp: "Repostar, recargar y cambiar ruedas a la vez o seguidos",
  driver: "Piloto",
  driverDetail:
    "El cálculo con tus datos usa un solo piloto durante toda la carrera.",
  review:
    "Esta estrategia usa solo los datos que has escrito; no usa sesiones grabadas.",
  unsaved: "Si cierras sin guardar, la carrera se pierde.",
  create: "Crear carrera",
  edit: "Editar",
  editing: "Editando los datos de la carrera",
  editingDetail:
    "Los cambios no cuentan hasta que pulses «Confirmar datos» o «Confirmar y calcular». Mientras haya datos sin confirmar no puedes guardar el archivo ni cambiar de carrera.",
  cancelEdit: "Cancelar edición",
  confirm: "Confirmar datos",
  confirmed: "Datos confirmados.",
  unconfirmed: (count: number) =>
    count === 1 ? "1 dato sin confirmar" : `${count} datos sin confirmar`,
  noForm: "No se pueden mostrar los datos de esta carrera.",
  lapEstimate: (estimate: string) =>
    `Vueltas ≈ duración ÷ ritmo: unas ${estimate} vueltas. El plan usa las vueltas que indiques.`,
  before: (value: string) => `Antes: ${value}`,
  driverAndStrategy: "Piloto y estrategia",
  noFormation: "No hay",
  noWear: "sin desgaste",
  noLimit: "sin límite",
  together: "Todo a la vez",
  loads: (fuel: string, energy: string) =>
    `de ${fuel} L en ${fuel} L · de ${energy} % en ${energy} %`,
  perLap: (time: string) => `${time} por vuelta`,
  editBlock: (block: string) => `Editar ${block.toLowerCase()}`,
  yourRace: "Tu carrera",
  summaryHelp: "Se guarda al crear la carrera en el último paso.",
  race: "Carrera",
  car: "Coche",
  pits: "Boxes",
  plan: "Plan",
  variant: "Estrategia",
  issue: (n: number) =>
    n === 1
      ? "Revisa 1 dato antes de continuar"
      : `Revisa ${n} datos antes de continuar`,
  issueDetail:
    "Los campos marcados están vacíos o no son válidos. No se ha guardado nada a medias.",
  required: "Completa este campo.",
  length: "Acorta este texto.",
  control: "No uses saltos de línea ni caracteres invisibles.",
  positive: "Tiene que ser mayor que 0.",
  integer: "Escribe un número entero mayor que 0.",
  range: "Escribe un número dentro del intervalo indicado.",
  date: "Escribe una fecha y una hora válidas.",
  labels: {
    track: "Circuito",
    class: "Clase o coche",
    name: "Nombre de la carrera",
    startAt: "Salida",
    durationMinutes: "Duración",
    raceLaps: "Vueltas que vas a dar",
    formationSeconds: "Vuelta de formación",
    fuelCapacityLiters: "Depósito",
    fuelPerLapLiters: "Consumo por vuelta",
    reserveLaps: "Reserva al final",
    veCapacityPercent: "Energía virtual máxima",
    vePerLapPercent: "Energía virtual por vuelta",
    tyreLifeLaps: "Vida del neumático",
    degradationSeconds: "Pérdida por desgaste",
    pitTransitSeconds: "Tránsito por boxes",
    refuelRate: "Velocidad de repostaje",
    veRate: "Velocidad de recarga de energía",
    tyreServiceSeconds: "Cambio de neumáticos",
    fuelStep: "Cargar combustible de",
    veStep: "Cargar energía de",
    driverName: "Nombre del piloto",
    driverInitials: "Iniciales",
    basePaceSeconds: "Ritmo por vuelta",
    variantName: "Nombre de esta estrategia",
    variantNote: "Nota",
    serviceMode: "En la parada",
  },
  help: {
    startAt: "Fecha y hora de inicio",
    raceLaps: "El plan reparte estas vueltas",
    formationSeconds: "0 si no hay",
    reserveLaps:
      "Vueltas de combustible que quieres que sobren. 0 = sin reserva",
    veCapacityPercent: "0 si tu coche no la usa",
    tyreLifeLaps: "0 = sin límite",
    degradationSeconds: "Cuánto más lento vas cada vuelta con la misma goma",
    pitTransitSeconds: "Entrar, parar y salir, sin servicio",
    fuelStep: "Cantidades que se prueban en cada parada",
    variantName: "El cálculo con tus datos es para pista seca",
  },
  reviewLabels: {
    name: "Nombre",
    combo: "Circuito · clase",
    duration: "Duración · vueltas",
    laps: "Vueltas",
    lap: "vuelta",
    fuel: "Depósito · consumo",
    energy: "Energía virtual",
    tyres: "Neumáticos",
    transit: "Tránsito",
    service: "Repostaje · recarga",
    wheels: "Ruedas",
    pace: "Ritmo",
    loads: "Cargas",
  },
  optional: "Opcional",
  calc: {
    confirmAndCalculate: "Confirmar y calcular",
    changedOutside:
      "Los datos de la carrera han cambiado fuera de esta pantalla. Vuelve a calcular el plan.",
    calculate: "Calcular plan",
    again: "Calcular de nuevo",
    retry: "Reintentar",
    review: "Revisar datos",
    cancel: "Cancelar",
    eyebrow: (name: string) => `Plan · estrategia «${name}»`,
    uncalculated: {
      heading: "Sin calcular",
      sub: "Aún no hay plan para esta estrategia.",
      title: "Calcula tu plan",
      detail: (laps: string) =>
        `Vantare reparte ${laps === "1" ? "la vuelta" : laps ? `las ${laps} vueltas` : "las vueltas"} en stints y decide en qué vuelta parar y cuánto cargar en cada parada, con los datos de la pestaña Carrera.`,
    },
    changed: {
      heading: "Datos cambiados",
      sub: "El plan anterior ya no corresponde a los datos.",
      title: "Vuelve a calcular el plan",
      detail:
        "Has cambiado los datos de la carrera desde el último cálculo. Calcula el plan otra vez para que cuadre con ellos.",
    },
    calculating: {
      heading: "Calculando…",
      sub: "Con los datos confirmados en Carrera.",
      title: "Calculando el plan",
      detail:
        "Puedes cancelar cuando quieras: no se guarda nada a medias y tus datos no cambian.",
    },
    done: {
      heading: "Plan calculado",
      noStops: (laps: number) => `Sin paradas para ${lapsWord(laps)}.`,
      summary: (stints: string, stops: string, laps: number) =>
        `${stints} y ${stops} para ${lapsWord(laps)}.`,
      stopsOnly: (stops: string, laps: number) =>
        `${stops} para ${lapsWord(laps)}.`,
    },
    unfinished: {
      heading: "Cálculo sin terminar",
      sub: "No se ha encontrado un plan completo.",
    },
    failed: {
      heading: "No se pudo calcular",
      sub: "Tus datos están intactos.",
      title: "No se pudo calcular el plan",
      detail:
        "Algo falló durante el cálculo. Tus datos no han cambiado. Prueba otra vez; si se repite, revisa los datos de la pestaña Carrera.",
    },
    rejected: {
      heading: "Revisa los datos",
      sub: "El cálculo no ha aceptado alguno de los datos.",
      title: "El cálculo no ha aceptado los datos",
      detail: "Revisa los datos de la pestaña Carrera y vuelve a calcular.",
      field: (label: string) => `Revisa «${label}» en la pestaña Carrera.`,
      inField: "El cálculo no ha aceptado este dato. Revísalo.",
      general: "El cálculo no ha aceptado los datos. Revísalos.",
    },
    noSolution: {
      heading: "Sin plan posible",
      sub: "Con estos datos no se puede terminar la carrera.",
      hint: "Revisa el depósito, los consumos, la reserva o las vueltas en la pestaña Carrera.",
    },
    certificate: {
      label: "Qué garantiza este plan",
      proven: "Comprobado: es el plan más rápido con estos datos",
      provenDetail: (steps: string) =>
        `Vantare ha revisado todas las formas de repartir las paradas y las cargas${steps ? `, ${steps}` : ""}, y ninguna termina antes.`,
      coarse: "El paso de carga es más grueso que el que pediste",
      coarseDetail: (steps: string) =>
        steps
          ? `Es el plan más rápido de los que se pueden hacer cargando ${steps}. Con el paso que pediste podría haber uno algo más rápido.`
          : "Es el plan más rápido con el paso de carga que ha usado el cálculo. Con el paso que pediste podría haber uno algo más rápido.",
      coarseLine: (steps: string) =>
        steps
          ? `El paso de carga es más grueso que el que pediste: ${steps}.`
          : "El paso de carga es más grueso que el que pediste.",
      partial: "Plan válido, pero sin garantía de que sea el más rápido",
      unfinished: "El cálculo no ha terminado",
      noSolution: "Ningún plan termina la carrera con estos datos",
      reasons: {
        searchBudgetExhausted:
          "La búsqueda se detuvo antes de poder comprobarlo",
        fineGridNoFallback:
          "Con pasos de carga tan finos no se pudo completar el cálculo; prueba con pasos más gruesos",
        constraintsUnsatisfiable:
          "Las reglas del evento o el calendario editado no lo permiten",
        noFeasiblePlan: "No hay plan posible con estos datos y pasos",
      },
      searchStopped: "La búsqueda se detuvo antes de encontrar un plan",
      steps: (fuel: string, energy: string) =>
        [
          fuel && `de ${fuel} L en ${fuel} L`,
          energy && `de ${energy} % en ${energy} %`,
        ]
          .filter(Boolean)
          .join(" y "),
    },
    figures: {
      label: "Cifras del plan",
      duration: "Duración",
      durationNote: "horas : min : s",
      laps: "Vueltas",
      asked: "las que pediste",
      stops: "Paradas",
      allTyres: "todas con ruedas nuevas",
      noTyres: "sin cambio de ruedas",
      someTyres: (some: number, all: number) =>
        `ruedas nuevas en ${some} de ${all}`,
      left: "Sobra al final",
      askedReserve: (value: string) => `pediste ${value} v`,
    },
    full: "Carrera completa",
    timeline: (stints: number, stops: number, laps: number) =>
      `Línea de tiempo: ${timeText.stints(stints)} y ${timeText.stops(stops)} en ${lapsWord(laps)}`,
    tooLong: "Este plan tiene demasiadas paradas para dibujarlo.",
    unreadable: {
      title: "No se puede saber cómo va el cálculo",
      detail:
        "No hemos podido leer el resultado. Puedes volver a intentarlo o cancelar el cálculo.",
    },
    list: "Stints y paradas",
    stint: (n: number) => `Stint ${n}`,
    stop: (n: number) => `Parada ${n}`,
    lapsRange: (from: number, to: number) =>
      from === to ? `Vuelta ${from}` : `Vueltas ${from}–${to}`,
    lap: (n: number) => `Vuelta ${n}`,
    lapCount: (n: number) => lapsWord(n),
    leaves: (load: string) => `sale con ${load}`,
    arrives: (load: string) => `llega con ${load}`,
    noLoad: "sin carga",
    freshTyres: "ruedas nuevas",
    sameTyres: "mismas ruedas",
    services: { parallel: "a la vez", sequential: "uno tras otro" },
    announce: {
      calculating: "Calculando el plan.",
      cancelled: "Cálculo cancelado.",
      done: (duration: string, stops: string) =>
        `Plan calculado: ${duration}; ${stops}.`,
      unproven: "Plan calculado sin garantía de ser el más rápido.",
      failed: "No se pudo calcular el plan.",
      unfinished: "No se pudo completar el cálculo del plan.",
      noSolution: "Ningún plan termina la carrera con estos datos.",
    },
    time: timeText,
  },
};

function lapsWord(laps: number) {
  return `${laps} ${laps === 1 ? "vuelta" : "vueltas"}`;
}
