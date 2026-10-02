import type { Locale } from "../../../i18n/i18n";

const en = {
  fastestLap: "FASTEST LAP",
  position: "POS", driverNumber: "NO", driverName: "DRIVER", vehicleClass: "CLASS",
  gap: "TO LEADER", paceGap: "TO BEST", interval: "INTERVAL", currentLap: "LAP",
  lastLap: "LAST LAP", bestLap: "BEST LAP", personalBest: "PERSONAL BEST", pit: "PIT", tireCompound: "TYRE",
  you: "YOU", remaining: "REMAINING", race: "RACE", practice: "PRACTICE", qualifying: "QUALIFYING",
  lapMoreOne: "1 lap more than you", lapsMore: "{count} laps more than you",
  lapLessOne: "1 lap fewer than you", lapsLess: "{count} laps fewer than you",
  lapUnit: "L",
  stale: "DATA OUT OF DATE", disconnected: "DISCONNECTED", missing: "NO DATA", error: "DATA ERROR",
  trackTemperature: "TRACK", airTemperature: "AIR", estimatedLaps: "EST. LAPS LEFT", totalLaps: "TOTAL LAPS",
  trackTemp: "TRACK", ambientTemp: "AIR", wind: "WIND", track: "TRACK",
  rain: "RAIN", wetness: "WET", dry: "DRY", pressure: "PRESS",
  relative: "RELATIVE", delta: "DELTA", pedals: "PEDALS", playerGap: "TO YOU",
  clutch: "CLUTCH", brake: "BRAKE", throttle: "THROTTLE",
  fuel: "FUEL", virtualEnergy: "VIRTUAL ENERGY", virtualEnergyUnavailable: "VIRTUAL ENERGY SIGNAL UNAVAILABLE", avg: "AVG", laps: "LAPS", required: "REQ", history: "HISTORY", estFinish: "EST. FINISH",
  aero: "AERO", body: "BODY", suspension: "SUSP", tyre: "TYRE", damage: "DAMAGE",
  speed: "SPEED", rpm: "RPM", gear: "GEAR",
  leader: "LEADER", ahead: "AHEAD", behind: "BEHIND", rival: "RIVAL", noRival: "NO RIVAL",
  caution: "CAUTION", flag: "FLAG", sectors: "SECTORS", green: "GREEN", yellow: "YELLOW", red: "RED", blue: "BLUE", black: "BLACK", white: "WHITE", checkered: "CHECKERED",
  gaining: "GAINING", losing: "LOSING", stable: "STABLE", unknown: "UNKNOWN", deltaTrace: "DELTA TRACE", trackMap: "TRACK MAP",
  noTelemetry: "NO TELEMETRY", trackNotMapped: "TRACK NOT MAPPED", reference: "REFERENCE", classUnavailable: "CLASS N/A",
  schedule: "SCHEDULE", noEvents: "NO EVENTS", pedalInputs: "PEDAL INPUTS", preview: "PREVIEW",
};

export const functionalLabels: Record<Locale, typeof en> = {
  en,
  es: { ...en, fastestLap: "VUELTA RÁPIDA", driverName: "PILOTO", vehicleClass: "CLASE", gap: "AL LÍDER", paceGap: "AL MEJOR",
    interval: "INTERVALO", currentLap: "VUELTA", lastLap: "ÚLT. VUELTA", bestLap: "MEJOR V.", personalBest: "MEJOR PERSONAL",
    tireCompound: "NEUM.", you: "TÚ", remaining: "RESTANTE", race: "CARRERA", practice: "PRÁCTICA",
    qualifying: "CLASIFICACIÓN", stale: "DATOS ANTIGUOS", disconnected: "DESCONECTADO", missing: "SIN DATOS", error: "ERROR DE DATOS",
    lapMoreOne: "1 vuelta más que tú", lapsMore: "{count} vueltas más que tú",
    lapLessOne: "1 vuelta menos que tú", lapsLess: "{count} vueltas menos que tú",
    lapUnit: "V",
    trackTemperature: "PISTA", airTemperature: "AIRE", estimatedLaps: "V. REST. EST.", totalLaps: "V. TOTALES",
    trackTemp: "PISTA", ambientTemp: "AIRE", wind: "VIENTO", track: "PISTA",
    rain: "LLUVIA", wetness: "HÚMEDO", dry: "SECO", pressure: "PRES",
    relative: "RELATIVO", pedals: "PEDALES", playerGap: "A TI", estFinish: "EST. META",
    clutch: "EMBRAGUE", brake: "FRENO", throttle: "ACELERADOR", virtualEnergy: "ENERGÍA VIRTUAL", virtualEnergyUnavailable: "ENERGÍA VIRTUAL NO DISPONIBLE EN LA SEÑAL EN VIVO",
    fuel: "COMBUSTIBLE", avg: "MED.", laps: "VUELTAS", required: "NEC.", history: "HISTORIAL", body: "CARROC.", tyre: "NEUM.", damage: "DAÑOS", speed: "VELOCIDAD", gear: "MARCHA",
    leader: "LÍDER", ahead: "DELANTE", behind: "DETRÁS", rival: "RIVAL", noRival: "SIN RIVAL", caution: "PRECAUCIÓN", flag: "BANDERA", sectors: "SECTORES",
    green: "VERDE", yellow: "AMARILLA", red: "ROJA", blue: "AZUL", black: "NEGRA", white: "BLANCA", checkered: "CUADROS",
    gaining: "GANANDO", losing: "PERDIENDO", stable: "ESTABLE", unknown: "DESCONOCIDO", deltaTrace: "TRAZA DELTA", trackMap: "MAPA DE PISTA", noTelemetry: "SIN TELEMETRÍA", trackNotMapped: "PISTA SIN MAPA", reference: "REFERENCIA", classUnavailable: "CLASE N/D", schedule: "CALENDARIO", noEvents: "SIN EVENTOS", pedalInputs: "PEDALES", preview: "VISTA PREVIA" },
  pt: { ...en, fastestLap: "VOLTA MAIS RÁPIDA", driverName: "PILOTO", vehicleClass: "CLASSE", gap: "AO LÍDER", paceGap: "AO MELHOR",
    interval: "INTERVALO", currentLap: "VOLTA", lastLap: "ÚLT. VOLTA", bestLap: "MELHOR V.", personalBest: "MELHOR PESSOAL",
    tireCompound: "PNEU", you: "VOCÊ", remaining: "RESTANTE", race: "CORRIDA", practice: "TREINO",
    qualifying: "CLASSIFICAÇÃO", stale: "DADOS ANTIGOS", disconnected: "DESCONECTADO", missing: "SEM DADOS", error: "ERRO DE DADOS",
    lapMoreOne: "1 volta a mais que você", lapsMore: "{count} voltas a mais que você",
    lapLessOne: "1 volta a menos que você", lapsLess: "{count} voltas a menos que você",
    lapUnit: "V",
    trackTemperature: "PISTA", airTemperature: "AR", estimatedLaps: "V. REST. EST.", totalLaps: "V. TOTAIS",
    trackTemp: "PISTA", ambientTemp: "AR", wind: "VENTO", track: "PISTA",
    relative: "RELATIVO", pedals: "PEDAIS", playerGap: "A VOCÊ", estFinish: "EST. FIM",
    clutch: "EMBREAGEM", brake: "FREIO", throttle: "ACELERADOR", virtualEnergy: "ENERGIA VIRTUAL", virtualEnergyUnavailable: "SINAL DE ENERGIA VIRTUAL INDISPONÍVEL",
    fuel: "COMBUSTÍVEL", avg: "MÉD.", laps: "VOLTAS", required: "NEC.", history: "HISTÓRICO", body: "CARROC.", tyre: "PNEU", damage: "DANOS", speed: "VELOCIDADE", gear: "MARCHA",
    rain: "CHUVA", wetness: "MOLHADO", dry: "SECO", pressure: "PRESS", leader: "LÍDER", ahead: "À FRENTE", behind: "ATRÁS", rival: "RIVAL", noRival: "SEM RIVAL", caution: "ATENÇÃO", flag: "BANDEIRA", sectors: "SETORES",
    green: "VERDE", yellow: "AMARELA", red: "VERMELHA", blue: "AZUL", black: "PRETA", white: "BRANCA", checkered: "QUADRICULADA",
    gaining: "GANHANDO", losing: "PERDENDO", stable: "ESTÁVEL", unknown: "DESCONHECIDO", deltaTrace: "TRAÇO DELTA", trackMap: "MAPA DA PISTA", noTelemetry: "SEM TELEMETRIA", trackNotMapped: "PISTA SEM MAPA", reference: "REFERÊNCIA", classUnavailable: "CLASSE N/D", schedule: "AGENDA", noEvents: "SEM EVENTOS", pedalInputs: "PEDAIS", preview: "PRÉVIA" },
  it: { ...en, fastestLap: "GIRO PIÙ VELOCE", driverName: "PILOTA", vehicleClass: "CLASSE", gap: "DAL LEADER", paceGap: "DAL MIGLIORE",
    interval: "INTERVALLO", currentLap: "GIRO", lastLap: "ULT. GIRO", bestLap: "MIGLIORE", personalBest: "MIGLIOR PERSONALE",
    tireCompound: "GOMMA", you: "TU", remaining: "RIMANENTE", race: "GARA", practice: "PROVE",
    qualifying: "QUALIFICHE", stale: "DATI NON AGGIORNATI", disconnected: "DISCONNESSO", missing: "NESSUN DATO", error: "ERRORE DATI",
    lapMoreOne: "1 giro in più di te", lapsMore: "{count} giri in più di te",
    lapLessOne: "1 giro in meno di te", lapsLess: "{count} giri in meno di te",
    lapUnit: "G",
    trackTemperature: "PISTA", airTemperature: "ARIA", estimatedLaps: "GIRI REST. ST.", totalLaps: "GIRI TOTALI",
    trackTemp: "PISTA", ambientTemp: "ARIA", wind: "VENTO", track: "PISTA",
    relative: "RELATIVO", pedals: "PEDALI", playerGap: "A TE", estFinish: "STIMA FINALE",
    clutch: "FRIZIONE", brake: "FRENO", throttle: "ACCELERATORE", virtualEnergy: "ENERGIA VIRTUALE", virtualEnergyUnavailable: "SEGNALE ENERGIA VIRTUALE NON DISPONIBILE",
    fuel: "CARBURANTE", avg: "MED.", laps: "GIRI", required: "NEC.", history: "STORICO", body: "CARROZZ.", tyre: "GOMMA", damage: "DANNI", speed: "VELOCITÀ", gear: "MARCIA",
    rain: "PIOGGIA", wetness: "BAGNATO", dry: "ASCIUTTO", pressure: "PRESS", leader: "LEADER", ahead: "DAVANTI", behind: "DIETRO", rival: "RIVALE", noRival: "NESSUN RIVALE", caution: "ATTENZIONE", flag: "BANDIERA", sectors: "SETTORI",
    green: "VERDE", yellow: "GIALLA", red: "ROSSA", blue: "BLU", black: "NERA", white: "BIANCA", checkered: "SCACCHI",
    gaining: "GUADAGNO", losing: "PERDITA", stable: "STABILE", unknown: "SCONOSCIUTO", deltaTrace: "TRACCIA DELTA", trackMap: "MAPPA PISTA", noTelemetry: "SENZA TELEMETRIA", trackNotMapped: "PISTA NON MAPPATA", reference: "RIFERIMENTO", classUnavailable: "CLASSE N/D", schedule: "CALENDARIO", noEvents: "NESSUN EVENTO", pedalInputs: "PEDALI", preview: "ANTEPRIMA" },
};

export function sessionDisplayLabel(locale: Locale, sessionCode: string | undefined): string {
	if (!sessionCode) return "";
  const code = sessionCode.toLowerCase();
  if (code === "race" || code === "practice" || code === "qualifying") return functionalLabels[locale][code];
  return sessionCode;
}

/** Localize semantic markers from legacy and V2 timing formatters at render time. */
export function localizeStandingsValue(value: string, labels: typeof en): string {
 if (value.toUpperCase() === "LEADER") return labels.leader;
 const laps = /^([+-]\d+) vueltas?$/.exec(value);
 return laps ? `${laps[1]} ${labels.lapUnit}` : value;
}
