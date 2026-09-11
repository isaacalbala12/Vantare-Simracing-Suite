import type { Locale } from "../../../i18n/i18n";

const en = {
  position: "POS", driverNumber: "NO", driverName: "DRIVER", vehicleClass: "CLASS",
  gap: "TO LEADER", paceGap: "TO BEST", interval: "INTERVAL", currentLap: "LAP",
  lastLap: "LAST LAP", bestLap: "BEST LAP", pit: "PIT", tireCompound: "TYRE",
  you: "YOU", remaining: "REMAINING", race: "RACE", practice: "PRACTICE", qualifying: "QUALIFYING",
  stale: "DATA OUT OF DATE", disconnected: "DISCONNECTED", missing: "NO DATA", error: "DATA ERROR",
  trackTemp: "TRACK", ambientTemp: "AIR", wind: "WIND",
  relative: "RELATIVE", delta: "DELTA", pedals: "PEDALS", playerGap: "TO YOU",
  clutch: "CLUTCH", brake: "BRAKE", throttle: "THROTTLE",
};

export const functionalLabels: Record<Locale, typeof en> = {
  en,
  es: { ...en, driverName: "PILOTO", vehicleClass: "CLASE", gap: "AL LÍDER", paceGap: "AL MEJOR",
    interval: "INTERVALO", currentLap: "VUELTA", lastLap: "ÚLT. VUELTA", bestLap: "MEJOR V.",
    tireCompound: "NEUM.", you: "TÚ", remaining: "RESTANTE", race: "CARRERA", practice: "PRÁCTICA",
    qualifying: "CLASIFICACIÓN", stale: "DATOS ANTIGUOS", disconnected: "DESCONECTADO", missing: "SIN DATOS", error: "ERROR DE DATOS",
    trackTemp: "PISTA", ambientTemp: "AIRE", wind: "VIENTO",
    relative: "RELATIVO", pedals: "PEDALES", playerGap: "A TI",
    clutch: "EMBRAGUE", brake: "FRENO", throttle: "ACELERADOR" },
  pt: { ...en, driverName: "PILOTO", vehicleClass: "CLASSE", gap: "AO LÍDER", paceGap: "AO MELHOR",
    interval: "INTERVALO", currentLap: "VOLTA", lastLap: "ÚLT. VOLTA", bestLap: "MELHOR V.",
    tireCompound: "PNEU", you: "VOCÊ", remaining: "RESTANTE", race: "CORRIDA", practice: "TREINO",
    qualifying: "CLASSIFICAÇÃO", stale: "DADOS ANTIGOS", disconnected: "DESCONECTADO", missing: "SEM DADOS", error: "ERRO DE DADOS",
    trackTemp: "PISTA", ambientTemp: "AR", wind: "VENTO",
    relative: "RELATIVO", pedals: "PEDAIS", playerGap: "A VOCÊ",
    clutch: "EMBREAGEM", brake: "FREIO", throttle: "ACELERADOR" },
  it: { ...en, driverName: "PILOTA", vehicleClass: "CLASSE", gap: "DAL LEADER", paceGap: "DAL MIGLIORE",
    interval: "INTERVALLO", currentLap: "GIRO", lastLap: "ULT. GIRO", bestLap: "MIGLIORE",
    tireCompound: "GOMMA", you: "TU", remaining: "RIMANENTE", race: "GARA", practice: "PROVE",
    qualifying: "QUALIFICHE", stale: "DATI NON AGGIORNATI", disconnected: "DISCONNESSO", missing: "NESSUN DATO", error: "ERRORE DATI",
    trackTemp: "PISTA", ambientTemp: "ARIA", wind: "VENTO",
    relative: "RELATIVO", pedals: "PEDALI", playerGap: "A TE",
    clutch: "FRIZIONE", brake: "FRENO", throttle: "ACCELERATORE" },
};
