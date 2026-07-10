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

La pestaña "Desarrollo por features" tiene fuente manual con **subtasks
(checkboxes)**. El progreso se calcula del ratio done/total de las subtasks.

### Dónde vive

- **Fuente manual:** `docs/features-source.json`.
- **URL pública:** `FEATURES_SOURCE_URL` en `features-data.ts`.
- **Fallback offline:** `FEATURES_FALLBACK` en `features-data.ts` (sincronizado
  a mano con el JSON).
- **UI:** `FeatureCard` muestra checkboxes + barra de progreso calculada.
- **Script eliminado:** `scripts/generate-roadmap-progress.mjs` no existe.

### Schema de features

```json
{
  "id": "string (kebab-case, único)",
  "category": "string (debe existir en categories[].id)",
  "label": LocalizedText,
  "description": LocalizedText,
  "tipo": "feature | bugfix | improve | component",
  "status": "in-development | research | future",
  "subtasks": [
    { "label": LocalizedText, "done": boolean }
  ]
}
```

**No hay campo `percent`.** El % se calcula: `Math.round((done / total) * 100)`.

### Cómo editar el progreso

1. Abrir `docs/features-source.json`.
2. Localizar la feature por `id`.
3. Cambiar `done: true` en las subtasks completadas.
4. Sincronizar `FEATURES_FALLBACK` en `features-data.ts`.
5. Checks + commit.

### Cómo añadir una feature

1. Añadir categoría si no existe (con `id`, `label` 4 idiomas, `order`).
2. Añadir feature con todos los campos incluyendo `subtasks[]`.
3. Sincronizar `FEATURES_FALLBACK`.
4. Checks + commit.

### Status → UI

| Status | Badge | Color |
|---|---|---|
| `in-development` | EN DESARROLLO | Rojo |
| `research` | EN INVESTIGACIÓN | Violeta |
| `future` | PRÓXIMAMENTE | Gris |
