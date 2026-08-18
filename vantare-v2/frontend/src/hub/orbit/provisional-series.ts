import type { Series } from "./next-starts";

/**
 * DATOS PROVISIONALES · no es una fuente de producto.
 *
 * El hub todavía no expone un fixture de series de Le Mans Ultimate al
 * frontend. Hasta que exista, la columna contextual alimenta "Próximas
 * carreras" con la cadencia publicada que el prototipo v0.3 usó como muestra
 * (`vantare-exploration-v03-orbit.html`). En cuanto haya fuente real, este
 * módulo se borra y `SideRaces` consume el fixture; el motor `nextStarts` no
 * cambia.
 */
export const PROVISIONAL_SERIES_NOTE =
  "Cadencia publicada · fixture provisional del prototipo v0.3";

export const PROVISIONAL_SERIES: Series[] = [
  { id: "lmgt3-fixed", name: "LMGT3 Fixed", tier: "beginner", license: "Bronze SR", track: "Sebring (School)", cls: "LMGT3 Class", setup: "Fixed", raceMin: 20, sessions: "P 3 · Q 8 · R 20", every: 15, offset: 15 },
  { id: "mclaren-q5", name: "Logitech McLaren G Challenge Q5", tier: "beginner", license: "Bronze SR", track: "Monza (WEC)", cls: "McLaren 720S LMGT3", setup: "Fixed", raceMin: 20, sessions: "P 3 · Q 8 · R 20", every: 15, offset: 30 },
  { id: "lmp3-fixed", name: "LMP3 Fixed", tier: "beginner", license: "Bronze SR", track: "Fuji (Classic)", cls: "LMP3 Class", setup: "Fixed", raceMin: 20, sessions: "P 3 · Q 8 · R 20", every: 15, offset: 45 },
  { id: "lmgt3-sprint", name: "LMGT3 Sprint Cup", tier: "intermediate", license: "Silver SR", track: "COTA (National)", cls: "LMGT3 Class", setup: "Open", raceMin: 30, sessions: "P 3 · Q 8 · R 30", every: 20, offset: 15 },
  { id: "proto-fixed", name: "Prototype Fixed", tier: "intermediate", license: "Silver SR", track: "Barcelona (ELMS)", cls: "LMP2 (ELMS) & LMP3", setup: "Fixed", raceMin: 30, sessions: "P 3 · Q 8 · R 30", every: 20, offset: 30 },
  { id: "elms-sprint", name: "ELMS Sprint Trophy", tier: "intermediate", license: "Silver SR", track: "Portimao (WEC)", cls: "LMP2, LMP3 & LMGT3", setup: "Open", raceMin: 30, sessions: "P 3 · Q 8 · R 30", every: 20, offset: 45 },
  { id: "one-stint", name: "One Stint Sprint", tier: "advanced", license: "Gold SR", track: "Paul Ricard (Layout 1A)", cls: "Hypercar & LMGT3", setup: "Open", raceMin: 40, sessions: "P 5 · Q 10 · R 40", every: 30, offset: 15 },
  { id: "elms-super60", name: "ELMS Super 60", tier: "advanced", license: "Gold SR", track: "Spa (ELMS)", cls: "LMP2, LMP3 (70 L) & LMGT3 (75 % VE)", setup: "Open", raceMin: 60, sessions: "P 5 · Q 10 · R 60", every: 30, offset: 30 },
  { id: "wec-xperience", name: "WEC-Xperience", tier: "advanced", license: "Gold SR", track: "Silverstone (ELMS)", cls: "Hypercar & LMGT3 · 75 % VE", setup: "Open", raceMin: 60, sessions: "P 5 · Q 10 · R 60", every: 30, offset: 45 },
  { id: "wec-weekly", name: "WEC Weekly", tier: "weekly", license: "SR S2", track: "Portimao (ELMS)", cls: "Hypercar & LMGT3", setup: "Open", raceMin: 100, sessions: "P 10 · Q 15 · R 100", weeklyUTC: ["02:00", "06:00", "09:00", "12:00", "15:00", "18:00", "20:00", "23:00"], days: [1, 2, 3, 4, 5, 6, 0] },
];
