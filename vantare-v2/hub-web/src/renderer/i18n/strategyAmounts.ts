// Los textos de «fijar a mano» el combustible y la energía de cada parada (E5g).
// Todos los números que aparecen en ellos los da el anfitrión: aquí solo se
// escriben.

type Amount = "fuel" | "ve";

export const amounts = {
  group: (stop: number) => `Combustible y energía de la parada ${stop}`,
  fuel: "Combustible",
  energy: "Energía virtual",
  // el nombre de cada casilla, con su parada
  fuelOf: (stop: number) => `Combustible de la parada ${stop}`,
  energyOf: (stop: number) => `Energía de la parada ${stop}`,
  howFuel: (stop: number) => `Combustible de la parada ${stop}: cómo se decide`,
  howEnergy: (stop: number) => `Energía de la parada ${stop}: cómo se decide`,
  auto: "Automático",
  manual: "A mano",
  decided: "lo decide el cálculo",
  pinned: "fijado por ti",
  pinnedStop: "con cantidades fijadas por ti",
  unit: { fuel: "L", ve: "%" } as Record<Amount, string>,
  // los botones de + y − de cada casilla
  more: (step: string, unit: string, what: string, stop: number) =>
    `Añadir ${step} ${unit} ${what} de la parada ${stop}`,
  less: (step: string, unit: string, what: string, stop: number) =>
    `Quitar ${step} ${unit} ${what} de la parada ${stop}`,
  whatFuel: "al combustible",
  whatEnergy: "a la energía",
  symbols: { minus: "−", plus: "+" },
  pitTime: "Tiempo en boxes",
  pitBefore: (time: string) => `antes ${time}`,
  unused: "Este coche no usa energía virtual.",
  limits: {
    arrival: (a: string, b: string, unit: string) =>
      a === b
        ? `Se llega con ${a} ${unit}.`
        : `Se llega con entre ${a} y ${b} ${unit}.`,
    noArrival:
      "Con lo que fijaste en las paradas de antes, no se llega a esta parada.",
    range: (a: string, b: string, unit: string) =>
      a === b
        ? `Solo puedes fijar ${a} ${unit}.`
        : `Puedes fijar de ${a} a ${b} ${unit}.`,
    noRange: "Con lo demás como está, aquí no sirve ninguna cantidad.",
    unavailable:
      "Aquí el cálculo no puede decir cuánto cabe. Lo sabrás al recalcular.",
  },
  issue: {
    // la vuelta es la del anfitrión; sin ella, solo se dice que no llega con reserva
    belowMinLap: (value: string, what: "fuel" | "ve", lap: number) =>
      `Con ${value} no hay plan: te quedarías sin ${what === "fuel" ? "combustible" : "energía"} en la vuelta ${lap}, aunque cargues lo máximo en las otras paradas.`,
    belowMinReserve: (value: string) =>
      `Con ${value} llegas a meta, pero sin la reserva que pediste.`,
    needsAtLeast: (value: string) => `Hace falta al menos ${value}.`,
    aboveMax: (value: string, max: string) =>
      `Con ${value} no hay plan: aquí se puede fijar como mucho ${max}.`,
    noRange:
      "Con lo que has fijado en las otras paradas, aquí no hay ninguna cantidad que dé plan. Prueba a volver alguna parada a automático.",
  },
  // what a refused amount leaves: the host keeps the last valid one
  keeps: (value: string) => `El plan se queda con ${value}.`,
  keepsAutomatic: "El plan se queda con lo que decide el cálculo.",
  errors: {
    notNumber: "Escribe solo un número, por ejemplo 70.",
    negative: "No puede ser menos de 0.",
    wholeFuel: "Escribe litros enteros: el cálculo carga de 1 L en 1 L.",
    wholeEnergy: "Escribe porcentajes enteros: el cálculo carga de 1 % en 1 %.",
    grid: (step: string, unit: string) =>
      `El cálculo carga de ${step} ${unit} en ${step} ${unit}.`,
    pair: (below: string, above: string) => `Puedes poner ${below} o ${above}.`,
    nearest: (value: string) => `Lo más cercano que puedes poner es ${value}.`,
    aboveFuel: (max: string) =>
      `No cabe: el depósito no admite más de ${max} L.`,
    aboveFuelNoMax: "No cabe en el depósito.",
    aboveEnergy: (max: string) =>
      `No cabe: la energía no puede pasar de ${max} %.`,
    aboveEnergyNoMax: "No cabe: la energía no llega a tanto.",
    notInUseFuel: "Este coche no usa combustible: no se puede fijar.",
    notInUseEnergy: "Este coche no usa energía virtual: no se puede fijar.",
  },
  foot: "Lo que fijes a mano se respeta al recalcular; el resto lo decide el cálculo. Las ruedas y el modo de servicio los decide siempre el cálculo.",
  clear: "Volver todo a automático",
  announce: {
    fixed: (stop: number, what: "fuel" | "ve", value: string) =>
      `Parada ${stop}: ${what === "fuel" ? "combustible" : "energía"} fijado en ${value}.`,
    automatic: (stop: number, what: "fuel" | "ve") =>
      `Parada ${stop}: ${what === "fuel" ? "combustible" : "energía"} en automático.`,
    cleared: "Todo vuelve a automático. Recalcula para ver el plan.",
    noPlanFor: (stop: number) =>
      `Ningún plan cumple lo que fijaste: mira la parada ${stop}.`,
    noPlan: "Ningún plan cumple lo que fijaste.",
  },
  summary: {
    one: (stop: number, value: string) =>
      `Has fijado ${value} en la parada ${stop}.`,
    many: (stops: number) => `Has fijado cantidades en ${stops} paradas.`,
  },
  pending:
    "«Restablecer» vuelve al último plan válido, con las cantidades que tuviera fijadas; para quitar todo lo fijado, usa «Volver todo a automático».",
  pendingFixed:
    "Al recalcular, Vantare respeta lo que fijaste y decide el resto.",
  certificate: {
    title: "Comprobado: es el plan más rápido respetando lo que fijaste",
    detail: (steps: string) =>
      `Vantare ha dejado tal cual lo que fijaste y ha revisado todas las formas de repartir el resto${steps ? `, ${steps}` : ""}.`,
  },
  figure: {
    slower: (amount: string) => `${amount} más que el automático`,
    faster: (amount: string) => `${amount} menos que el automático`,
    fixedStops: (count: number) =>
      count === 1
        ? "1 con cantidades fijadas"
        : `${count} con cantidades fijadas`,
  },
  slower: (amount: string, automatic: string) =>
    `Lo que fijaste hace el plan ${amount} más lento que el plan automático (${automatic}).`,
  finish: (what: "fuel" | "ve", value: string, automatic: string) =>
    value === automatic
      ? `Llegarás a meta con ${value} de ${what === "fuel" ? "combustible" : "energía"}, igual que con el automático.`
      : `Llegarás a meta con ${value} de ${what === "fuel" ? "combustible" : "energía"} (con el automático, ${automatic}).`,
  noPlan: {
    heading: "Sin plan con lo que fijaste",
    sub: "Con las cantidades que fijaste no se puede terminar la carrera.",
    title: "Ningún plan cumple lo que fijaste",
    stop: (stop: number) =>
      `Con lo que fijaste en la parada ${stop} no hay plan que termine la carrera. Cambia esa cantidad o vuelve a «Automático».`,
    generic:
      "Con las cantidades que fijaste no hay plan que termine la carrera. Cambia alguna o vuelve a «Automático».",
    backStop: (stop: number) => `Volver la parada ${stop} a automático`,
    pick: "Elige la parada",
    pending: "Recalcula para ver si hay plan con lo que has fijado ahora.",
  },
  again: {
    title: "¿Calcular de nuevo y perder lo que fijaste?",
    detail: (stops: number) =>
      `Se pierden las cantidades que fijaste a mano en ${stops === 1 ? "1 parada" : `${stops} paradas`}: el cálculo nuevo decide todo.`,
    confirm: "Calcular de nuevo",
    cancel: "Cancelar",
  },
};
