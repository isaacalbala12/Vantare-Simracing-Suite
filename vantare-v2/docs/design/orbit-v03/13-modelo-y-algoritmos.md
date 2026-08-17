# 13 · Modelo de datos y algoritmos (extraídos del prototipo)

TypeScript puro, sin dependencias. Son la **referencia de comportamiento**; en el frontend viven en el dominio (`hub/calendar`, `strategy/*`), no en componentes. Cada algoritmo trae casos de prueba mínimos.

## 13.1 Estado global del hub
```ts
type Plan = "free" | "overlays" | "engineer" | "suite";
type Channel = "stable" | "testers" | "nightly";
type SimStatus = "connected" | "searching" | "disconnected";
type UpdateState = "none" | "available" | "downloading" | "ready";
type SaveState = "saved" | "dirty";
type OverlayState = "stopped" | "running";
type Density = "compact" | "balanced" | "comfortable";
const ACCESS: Record<Plan, Record<ViewId, boolean>> = {
  free:     { inicio:1, studio:1, launcher:1, carreras:1, estrategia:0, ingeniero:0, telemetria:0, roadmap:1, ajustes:1, testing:0 },
  overlays: { inicio:1, studio:1, launcher:1, carreras:1, estrategia:1, ingeniero:0, telemetria:1, roadmap:1, ajustes:1, testing:0 },
  engineer: { inicio:1, studio:0, launcher:1, carreras:1, estrategia:1, ingeniero:1, telemetria:1, roadmap:1, ajustes:1, testing:0 },
  suite:    { inicio:1, studio:1, launcher:1, carreras:1, estrategia:1, ingeniero:1, telemetria:1, roadmap:1, ajustes:1, testing:0 },
} as any; // testing = channel !== "stable"
const REQUIRED_PLAN = { studio: "Overlays", estrategia: "Overlays", ingeniero: "Engineer", telemetria: "Overlays" };
```

## 13.2 Studio
```ts
interface WidgetDoc { id: string; name: string; system: string; design: string; state: "activo" | "oculto"; x: number; y: number; w: number; h: number; hidden?: boolean; }
// lienzo 1920×1080; posiciones % = x/1920, y/1080, w/1920 (los .cw usan cqw)
```

## 13.3 Calendario
```ts
interface Series {
  id: string; name: string; tier: "beginner" | "intermediate" | "advanced" | "weekly";
  license: string; track: string; cls: string; setup: "Fixed" | "Open"; raceMin: number; sessions: string;
  every?: number; offset?: number;             // intervalo: salidas cuando minuto ≡ offset (mod every) en UTC
  weeklyUTC?: string[]; days?: number[];       // slots "HH:MM" UTC en días getUTCDay()
}
/** Próximas `count` salidas de una serie desde `from`. */
function nextStarts(s: Series, from: Date, count = 4): Date[] {
  const out: Date[] = [];
  if (s.every) {
    const t = new Date(from); t.setSeconds(0, 0);
    let k = Math.ceil((t.getUTCMinutes() - s.offset!) / s.every);
    let cand = new Date(t); cand.setUTCMinutes(s.offset! + k * s.every, 0, 0);
    while (cand < from) cand = new Date(cand.getTime() + s.every * 60000);
    for (let i = 0; i < count; i++) out.push(new Date(cand.getTime() + i * s.every * 60000));
    return out;
  }
  const day0 = new Date(from); day0.setUTCHours(0, 0, 0, 0);
  for (let d = 0; d < 8 && out.length < count; d++) {
    const day = new Date(day0.getTime() + d * 86400000);
    if (!s.days!.includes(day.getUTCDay())) continue;
    for (const hm of s.weeklyUTC!) { const [h, m] = hm.split(":").map(Number); const c = new Date(day); c.setUTCHours(h, m, 0, 0); if (c >= from && out.length < count) out.push(c); }
  }
  return out;
}
/** Próximas salidas de un conjunto, ordenadas por hora y nombre. */
const upcoming = (pool: Series[], from: Date, limit: number) =>
  pool.flatMap(s => nextStarts(s, from, 2).map(at => ({ s, at }))).sort((a, b) => +a.at - +b.at || a.s.name.localeCompare(b.s.name)).slice(0, limit);
```
Pruebas: (a) `every 15, offset 15`, from 10:07:30Z → 10:15, 10:30, 10:45, 11:00. (b) `every 20, offset 45`, from 10:50Z → 11:05 (45+20=65→:05). (c) semanal `["02:00","23:00"]` días L–D, from Dom 23:30Z → Lun 02:00. (d) `from` exactamente en una salida la incluye. Vistas: Día = salidas del día local; Semana = "cada N min · :mm+" o slots; Timeline = 24 h desde la hora en punto actual, ancho = `min(raceMin, every − 3)`.

## 13.4 Inicio · dial
`target = upcoming(followed.length ? followed : all, now, 1)[0]`; `frac = clamp(remaining / (every || 180) min)`; arco `stroke-dashoffset = 100 − frac·100` (pathLength 100), punto `rotate(frac·360°)`; texto `en mm:ss` (`h m` si ≥ 1 h). Refresco 1 s; al llegar a 0 se recalcula.

## 13.5 Estrategia
```ts
interface Event { startMin: number; durationMin: number; tankL: number; pitS: number; }          // 14:00, 240, 90, 64
interface Driver { id: string; name: string; ini: string; color: string; cls: string; dry: [paceS, Lpl]; wet: [...]; eco: [...]; }
interface Strategy { id: string; name: string; note: string; mode: "dry" | "wet" | "eco"; order: DriverId[]; state: "Al día" | "Borrador";
  overrides: Record<number, { laps?: number; fuel?: number }>; tyres: Record<number, Partial<Record<Corner, TyreId>>>; }
interface Tyre { id: string; comp: "soft" | "medium" | "hard"; }             // 8 M · 8 H · 8 S
type Corner = "FL" | "FR" | "RL" | "RR";
interface Stint { i: number; d: DriverId; laps: number; fuel: number; pace: number; start: number; end: number; lap0: number; lap1: number; over: boolean; manual: boolean; }
interface Plan { stints: Stint[]; totalLaps: number; total: number; stops: number; maxLaps: number; avgFuel: number; avgPace: number; }

function buildPlan(ev: Event, drivers: Record<string, Driver>, st: Strategy): Plan {
  const order = st.order.slice();
  const pace = (d: string) => drivers[d][st.mode][0], fuel = (d: string) => drivers[d][st.mode][1];
  const avgPace = avg(order.map(pace)), avgFuel = avg(order.map(fuel));
  const maxLaps = Math.floor(ev.tankL / avgFuel);
  const totalLaps = Math.ceil((ev.durationMin * 60) / avgPace);           // la última vuelta se completa
  let n = Math.max(order.length, Math.ceil(totalLaps / maxLaps));         // stints = mín. que cabe, ≥ nº pilotos
  while (order.length < n) order.push(st.order[order.length % st.order.length]);  // rotación se repite
  const ov = st.overrides, fixed = Object.keys(ov).map(Number).filter(i => i < n && (ov[i].laps ?? 0) > 0);
  const free = n - fixed.length, freeLaps = Math.max(0, totalLaps - sum(fixed.map(i => ov[i].laps!)));
  const base = free ? Math.floor(freeLaps / free) : 0, extra = free ? freeLaps % free : 0;
  const stints: Stint[] = []; let t = 0, lap = 0, k = 0;
  for (let i = 0; i < n; i++) {
    const d = order[i], p = pace(d);
    const laps = fixed.includes(i) ? ov[i].laps! : base + (k++ < extra ? 1 : 0);
    const f = (ov[i]?.fuel ?? 0) > 0 ? ov[i].fuel! : laps * fuel(d);
    const start = t; t += laps * p;
    stints.push({ i, d, laps, fuel: Math.min(f, ev.tankL), pace: p, start, end: t, lap0: lap + 1, lap1: lap + laps, over: f > ev.tankL + 0.01, manual: !!ov[i] });
    lap += laps; if (i < n - 1) t += ev.pitS;
  }
  return { stints, totalLaps, total: t, stops: n - 1, maxLaps, avgFuel, avgPace };
}
```
Derivados: hora de stint = `startMin + start/60`; ventana de boxes = vuelta `max(lap0, lap1−3)`; parada entre stints: "`tank` L en depósito (`min(tank, fuel_siguiente)` L añadidos) · vuelta `lap1`". Distribución = vueltas o tiempo por piloto. Condición de neumático = `100 − 12·usos` (rango `−8`), ámbar si > 2 usos. **Comparación**: gana quien completa **más vueltas**; texto: ahorro = `(stopsA − stopsB)·pitS`, coste = `(paceB − paceA)·lapsB`, "compensa" si ahorro > coste.
Pruebas: (a) 240 min, 104 s, 2.75 L, 90 L, 4 pilotos → 139 vueltas, 5 stints (28,28,28,28,27), 4 paradas, S5 = piloto 1. (b) override S1 = 20 → resto 30,30,29,29 (o equivalente equilibrado), `manual` true. (c) 20 min, 124.5 s, 2.10 L, 70 L, 1 piloto → 10 vueltas, 1 stint, 0 paradas. (d) eco (+0.4 s, ×0.94) reduce vueltas totales en 1–2 y puede quitar una parada solo si `ceil(fuel/tank)` baja.

Disponibilidad: `ranges[driver] = [status, fromMin, toMin][]`; añadir un tramo **recorta** los que solapa (parte anterior y posterior se conservan) y ordena por inicio.

## 13.6 Telemetría (sintético, hasta DuckDB)
`CORNERS: { n: "T7", d: +0.18, why: string, pos: 0.44 }[]` (pos = fracción de vuelta). Canales de 400 muestras: velocidad 250 base menos gaussianas por curva; freno antes de la curva; throttle 0 en curva; volante ± con `g`. Delta acumulado = suma de `d` al pasar cada `pos` (una vez por curva) × escala de referencia (best 1 · session .85 · pro 1.6). Mapa: Catmull-Rom sobre 19 puntos, tramo por curva = ±4.5 % de la longitud, color rojo si `d > .04`, verde si `< −.02`.

## 13.7 Persistencia
`localStorage` claves `vantare.v03orbit.{view,sidebar,rightDock,density}` con `store.get/set` tolerante a excepciones.
