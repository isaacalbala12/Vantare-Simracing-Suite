# Guía para agentes de IA: cómo editar el Roadmap de Vantare

Este documento es para **agentes worker** (Kimi, GLM, Codex, Deepseek, etc.) que
reciben una tarea relacionada con el roadmap. Si eres un humano, lee en su
lugar `docs/roadmap-maintenance.md` (procedimiento manual del producto).

## 1. Regla de oro

**El roadmap es manual.** No existe (ni debe existir) un script que lo regenere
desde otros documentos. Tú, como agente, **lees la fuente, propones cambios y
los transcribes a mano** a los archivos correctos. Nada de auto-generación.

## 2. Dónde está cada cosa

Hay **dos archivos de datos** que deben mantenerse en sincronía:

| Archivo | Para qué es | Quién lo lee |
|---|---|---|
| `docs/roadmap-source.json` | **Fuente de verdad manual.** Lo edita Isaac (o tú, por encargo suyo). | La app en runtime, por `fetch`. |
| `frontend/src/hub/roadmap/roadmap-data.ts` | Constante `ROADMAP_FALLBACK` (copia empaquetada del JSON) + `ROADMAP_SOURCE_URL` (URL del JSON). | La app sin red, como respaldo. |

Y un archivo de UI que solo cambia si la tarea lo pide:

- `frontend/src/hub/pages/RoadmapPage.tsx` — renderiza el dataset. No lo toques
  salvo que el cambio sea de render (p.ej. un nuevo campo).
- `frontend/src/hub/components/DashboardFeatureCarousel.tsx` — usa
  `ROADMAP_FALLBACK.areas` para el carrusel del dashboard. Si tocas las áreas,
  asegúrate de que el fallback también.

Y un archivo de i18n para el changelog:

- `frontend/src/i18n/locales/{es,en,pt,it}.ts` — claves
  `roadmap.changelog.<id>.title` y `.body`. Solo se editan cuando añades una
  entrada al changelog (§6.4).

## 3. Schema del JSON fuente

`docs/roadmap-source.json` tiene esta forma:

```json
{
  "version": 1,
  "updatedAt": "YYYY-MM-DD",
  "note": "Fuente manual del roadmap (v0.1.x). ...",
  "phases": [ /* RoadmapPhase[] */ ],
  "areas":   [ /* RoadmapArea[]   */ ],
  "milestones": [ /* RoadmapMilestone[] */ ]
}
```

Tipos (definidos en `roadmap-data.ts`):

```ts
type LocalizedText = { es: string; en: string; pt: string; it: string };

type RoadmapPhase = {
  id: string;                // único, kebab-case (ej. "beta-iteration")
  phaseLabel: LocalizedText; // "Fase 2"
  title: LocalizedText;      // "Pulido beta v0.1.x"
  target: LocalizedText;     // "v0.1.x"
  status: "done" | "in-progress" | "planned" | "future";
  progress: 0 | 10 | 25 | 50 | 75 | 100;
  summary: LocalizedText;
  highlights: LocalizedText[]; // 2-4 bullets cortos
};

type RoadmapArea = {
  id: string;          // ej. "calendar-local"
  title: LocalizedText;
  progress: 0 | 10 | 25 | 50 | 75 | 100;
  status: "done" | "in-progress" | "planned" | "future";
};

type RoadmapMilestone = {
  id: string;        // único, ej. "calendar-refactor"
  type: "release" | "feature" | "fix" | "plan";
  title: LocalizedText;
  body: LocalizedText;
  label: LocalizedText; // badge corto ("Release", "Feature", "Fix", "Plan")
};
```

Reglas del schema:

- `id` único y estable. No lo cambies salvo que sepas lo que haces; se usa
  como key de React.
- `progress` solo valores de la escala `0, 10, 25, 50, 75, 100`. Nada de
  `33`, `47`, `80`. Si dudas, usa `nearestOnScale` mental: 33→25, 50→50, 80→75.
- `LocalizedText` debe tener los **4 idiomas** con texto real, no vacío y no
  copia literal entre idiomas. Si no sabes traducir a pt/it, déjalo en español
  y marca con `// TODO(i18n)` en un commit aparte, pero **no dejes `""`**.

## 4. Procedimiento paso a paso

### 4.1. Actualizar un porcentaje (caso más común)

1. Lee `docs/roadmap-source.json` y localiza el item por `id`.
2. Cambia `progress` al valor de la escala y, si aplica, `status`.
3. Edita `frontend/src/hub/roadmap/roadmap-data.ts`, busca
   `ROADMAP_FALLBACK` y aplica **exactamente el mismo cambio** al item con ese
   mismo `id`. El fallback es una copia TS del JSON.
4. Si el item es un área (`ROADMAP_FALLBACK.areas`), el
   `DashboardFeatureCarousel` lo recoge automáticamente; no hay que tocarlo.
5. Ejecuta los checks (§5).

### 4.2. Cambiar el texto de una card

1. Edita el campo `title` / `summary` / `highlights` en el JSON (los 4
   idiomas).
2. Replica el cambio en `ROADMAP_FALLBACK` con los 4 idiomas.
3. Ejecuta los checks (§5).

### 4.3. Añadir una fase / área / milestone

1. Elige un `id` kebab-case único (mira primero el JSON para evitar colisión).
2. En el JSON, añade el objeto completo en `phases` / `areas` / `milestones`,
   con texto en los 4 idiomas, `status` y `progress` de la escala.
3. Replica el objeto en `ROADMAP_FALLBACK`.
4. Si es un área, recuerda que aparece en el `DashboardFeatureCarousel`
   automáticamente.
5. Si es un milestone, recuerda que también puedes añadirlo al changelog
   (§4.4) si representa un release.
6. Ejecuta los checks (§5).

### 4.4. Añadir una entrada al changelog (release/hito público)

El changelog es distinto: vive en `docs/changelog.md` (humano) y se espeja en
`ROADMAP_CHANGELOG` (array de 5 entradas) más las claves i18n. Procedimiento
completo en `roadmap-maintenance.md` §5. Resumen:

1. Añade la entrada a `docs/changelog.md` con el formato existente (versión,
   fecha, bullets).
2. En `roadmap-data.ts`, en `ROADMAP_CHANGELOG`, añade la entrada
   `{ id, version, date, titleKey, bodyKey }` (mantén solo las últimas 5).
3. En los 4 diccionarios i18n (`es.ts`, `en.ts`, `pt.ts`, `it.ts`), añade
   `roadmap.changelog.<id>.title` y `roadmap.changelog.<id>.body` con texto
   en cada idioma.
4. Ejecuta los checks (§5).

### 4.5. Cambiar la URL de la fuente (Google Doc, Supabase, otro)

Solo si la tarea lo pide y está aprobada:

1. Cambia la constante `ROADMAP_SOURCE_URL` en
   `frontend/src/hub/roadmap/roadmap-data.ts`.
2. No toques otra cosa. La app ya hace fetch + fallback.

## 5. Checks obligatorios

Después de cualquier edición del roadmap, ejecuta en orden:

```bash
corepack pnpm --dir frontend exec tsc --noEmit
corepack pnpm --dir frontend test
corepack pnpm --dir frontend build
```

Criterios:

- `tsc` sin errores.
- Todos los tests pasan. Si rompes un test de `roadmap-data.test.ts` o
  `RoadmapPage.test.tsx`, **arregla el test, no lo debilites**. Los tests
  validan la forma del dataset y el render.
- Build OK (el warning de chunk size es preexistente y no cuenta).

Si no puedes ejecutar algún check, indícalo en el reporte final con el motivo
(AGENTS.md lo exige).

## 6. Reporte final (en español)

Estructura obligatoria, sin saltarse secciones:

```
Archivos creados / modificados:
- docs/roadmap-source.json: <cambio resumido>
- frontend/src/hub/roadmap/roadmap-data.ts (ROADMAP_FALLBACK): <cambio>
- [...]

Cambios de datos:
- <area X>: progress 25 -> 50
- <milestone Y>: añadido
- [...]

Checks ejecutados:
- tsc --noEmit: OK
- pnpm test: X / Y PASS
- pnpm build: OK

Checks no ejecutados y motivo:
- (si aplica)

Riesgos restantes:
- (si aplica; p.ej. "el fallback queda desincronizado si Isaac edita el
  JSON antes del próximo commit")

Verificación manual:
- <cómo probarlo en la app>
```

## 7. Lo que NO debes hacer

- **No** crees un script `.mjs` / `.ts` / `.ps1` que regenere el JSON desde
  `release-roadmap-execution-index.md`, `roadmap-execution-board.md` o
  `current-plan.md`. Eso fue lo que se eliminó; reintroducirlo revierte el
  cambio manual.
- **No** metas `ROADMAP_NEXT` ni el mapeo automático estado→%. Esos fueron
  eliminados.
- **No** metas `progress` fuera de la escala `0/10/25/50/75/100`. Si tu
  cálculo da `33`, usa `25` (justifícalo en el reporte).
- **No** dejes un `LocalizedText` con un idioma vacío. Si no tienes la
  traducción, pon el español y márcalo.
- **No** toques backend Go, Supabase/Auth, runtime OBS, LayoutStudio, ni
  `position/x/y/w/h` de los widgets. Esto es solo datos.
- **No** añadas dependencias ni modifiques la config de build.
- **No** commitees, staggees, pushees ni crees tags. La regla del board es:
  el agente no hace release. Commit lo hace Isaac.
- **No** debilites tests para que pasen. Si un test falla por tu cambio,
  actualízalo solo si la expectativa es obsoleta (y justifícalo); si es
  regresión, corrige los datos.
- **No** metas cadenas fake prohibidas: `v0.1.0.3 publicado`, `Q4 2026`,
  `+30 widgets`, `telemetria completa`. El test `ROADMAP_FALLBACK dataset
  does not contain prohibited fake strings` las caza.

## 8. Cuándo pedir revisión

Pide revisión humana (y **para**) si:

- Tienes que cambiar la `ROADMAP_SOURCE_URL`.
- Tienes que tocar el `RoadmapPage.tsx` (render).
- Tienes que añadir una nueva clave i18n no listada en §4.4.
- Encuentras el JSON y el `ROADMAP_FALLBACK` desincronizados antes de empezar
  la tarea (avisa y pregunta).
- El `progress` que quieres usar no está claro (pide criterio al producto).

## 9. Referencias rápidas

- `docs/roadmap-maintenance.md` — procedimiento del lado humano (escala,
  changelog, "no tocar").
- `docs/roadmap-source.json` — la fuente de verdad.
- `frontend/src/hub/roadmap/roadmap-data.ts` — tipos, `ROADMAP_FALLBACK`,
  `fetchRoadmapDataset`, constantes.
- `frontend/src/hub/roadmap/roadmap-data.test.ts` — tests del dataset y del
  fetch (miran la forma y la escala).
- `frontend/src/hub/pages/RoadmapPage.tsx` — render.
- `frontend/src/hub/components/DashboardFeatureCarousel.tsx` — consumidor del
  fallback en el dashboard.
- `frontend/src/i18n/locales/{es,en,pt,it}.ts` — claves de changelog
  (`roadmap.changelog.*`).
