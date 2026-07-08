# Mantenimiento del Roadmap y Changelog (Vantare)

Procedimiento para editar el roadmap de forma **manual** y que se **actualice
solo** en la app de todos los usuarios, sin scripts de generación automática.

## 1. Dónde vive el roadmap

- **Fuente manual (la editas tú):** `docs/roadmap-source.json`.
  - Texto de las cards en `es/en/pt/it` (inline, no en i18n).
  - Progreso en la escala obligatoria `0/10/25/50/75/100`.
  - Fases, áreas de progreso y hitos (milestones).
- **App (runtime):** `frontend/src/hub/roadmap/roadmap-data.ts` trae el JSON
  por `fetch` en `RoadmapPage` (`fetchRoadmapDataset`). Si no hay red, usa
  `ROADMAP_FALLBACK` (copia empaquetada del JSON, en el mismo archivo).
- **UI:** `frontend/src/hub/pages/RoadmapPage.tsx`.
- **Changelog:** sigue en `docs/changelog.md` + array `ROADMAP_CHANGELOG`
  (ver §5). El "chrome" de la UI (eyebrows, labels, feedback, hero) sigue en
  los diccionarios i18n bajo `roadmap.*`.

## 2. Flujo manual (sin script)

No hay ningún script que regenere el roadmap desde otros documentos. El flujo
es:

1. **Tú editas `docs/roadmap-source.json`** (porcentajes, estado, texto de
   cards, hitos nuevos).
2. Haces commit/push del JSON al repo.
3. La app de cada usuario hace `fetch(ROADMAP_SOURCE_URL)` al abrir la pestaña
   Roadmap y muestra los valores nuevos. Sin nuevo release.

Los agentes pueden leer `roadmap-source.json` y proponer/transcribir cambios,
pero **la fuente de verdad la escribes tú a mano**. No se auto-genera nada.

Si más adelante quieres editar desde otro sitio (p.ej. un Google Doc exportado
a JSON o Supabase Storage), solo cambias la constante `ROADMAP_SOURCE_URL` en
`roadmap-data.ts`. No tocas otra cosa.

## 3. Escala de porcentajes (OBLIGATORIA)

Solo: `0, 10, 25, 50, 75, 100`.

- `0` — ni empezado / bloqueado.
- `10` — explorado, sin trabajo real.
- `25` — base puesta, bastante por hacer.
- `50` — mitad del camino.
- `75` — casi hecho, pulido / restante menor.
- `100` — cerrado.

Cualquier `%` fuera de esa escala se considera bug. `nearestOnScale` lo ajusta
al valor más cercano al renderizar el progreso global.

## 4. Cómo valorar el % (criterio del producto)

- El `%` refleja trabajo real restante, no esperanza ni marketing.
- Lo fijas tú manualmente al cerrar cada fase o avanzar una área.
- `%` global = media entera de las áreas, redondeada a la escala.

## 5. Procedimiento de changelog (paso a paso)

Cuando se cierra una feature / hotfix que el usuario deba ver:

1. Añadir la entrada a `docs/changelog.md` respetando su formato.
2. Añadir la misma entrada (solo las últimas 5) al array `ROADMAP_CHANGELOG`
   en `roadmap-data.ts`:
   `{ id, version, date, titleKey, bodyKey }`.
   `titleKey` / `bodyKey` apuntan a `roadmap.changelog.<id>.title/.body` en los
   4 diccionarios i18n.
3. Correr `pnpm --dir frontend test` y `pnpm --dir frontend build`.
4. Commit + tag según `docs/versioning-and-release-gates.md`.

Reglas:

- No commitear PNGs salvo decisión explícita.
- El botón "Ver changelog completo" enlaza a `ROADMAP_CHANGELOG_URL`, no
  renderiza `docs/changelog.md` en runtime.
- El array se sincroniza a mano con `docs/changelog.md`; no hay lectura
  automática.

## 6. No tocar

- Backend Go, Supabase/Auth, runtime OBS, LayoutStudio.
- `position` / `x` / `y` / `w` / `h`.
- Dependencias nuevas.
- `release-roadmap-execution-index.md` y `roadmap-execution-board.md` son
  contexto de ejecución; el roadmap de la app los consume como inspiración
  manual, no los lee ni los edita automáticamente.

## 7. Fuente de "Desarrollo por features" (features)

La pestaña "Desarrollo por features" del Roadmap sigue el mismo patrón que la
pestaña "Roadmap actual": fuente manual (JSON), sin script de auto-generación.

### Dónde vive

- **Fuente manual:** `docs/features-source.json` (categorías + features).
- **URL pública (runtime):** `FEATURES_SOURCE_URL` en
  `frontend/src/hub/roadmap/features-data.ts` — apunta a raw GitHub:
  `https://raw.githubusercontent.com/isaacalbala12/Vantare-Simracing-Suite/main/docs/features-source.json`.
- **Fallback offline (bundled):** `FEATURES_FALLBACK` en el mismo archivo
  `features-data.ts`. Debe estar sincronizado a mano con el JSON fuente.
- **UI:** `frontend/src/hub/roadmap/roadmap-features.ts` consume el dataset y
  expone `TIPO_META` (4 tipos), `STATUS_META` (3 status) y `getActiveSections`.
- **Script eliminado:** `scripts/generate-roadmap-progress.mjs` ya no existe.
  No hay auto-generación. Las features son manuales.

### Schema de validación

El JSON fuente debe cumplir:

- `category` debe existir en `categories[].id`.
- `status` ∈ `in-development | research | future`.
- `tipo` ∈ `feature | bugfix | improve | component`.
- `percent` ∈ `0 | 10 | 25 | 50 | 75 | 100`.
- `label` y `description` son `LocalizedText` (4 idiomas: es, en, pt, it).
- `pickText` se reusa de `roadmap-data.ts` para obtener el texto según el
  locale activo.

### Cómo añadir una feature

1. Abre `docs/features-source.json`.
2. Localiza el array `features[]`.
3. Añade un objeto con:
   - `id` (único, kebab-case)
   - `category` (debe coincidir con un id en `categories[]`)
   - `label` (4 idiomas)
   - `description` (4 idiomas)
   - `tipo`
   - `status`
   - `percent`
4. Abre `frontend/src/hub/roadmap/features-data.ts`, localiza
   `FEATURES_FALLBACK.features` y replica exactamente el mismo objeto.
5. Ejecuta los checks: `tsc --noEmit`, `pnpm test`, `pnpm build`.

### Cómo añadir una categoría

1. Abre `docs/features-source.json`.
2. Localiza el array `categories[]`.
3. Añade un objeto con:
   - `id` (único, kebab-case)
   - `label` (4 idiomas)
   - `order` (número de orden en la UI)
4. Replica el mismo objeto en `FEATURES_FALLBACK.categories` en
   `features-data.ts`.
5. Asegúrate de que las features existentes referencian el nuevo `id` si
   corresponde.
