# Mantenimiento del Roadmap y Changelog (Vantare)

Documento de procedimiento para editar los porcentajes del roadmap y mantener el
changelog. Orientado a que cualquier modelo worker (o humano) entienda las reglas
sin tener que re-derivarlas del chat de orquestación.

Este documento es fuente de verdad operativa para las tareas `ROADMAP-I18N`,
`ROADMAP-DUAL`, `ROADMAP-CHANGELOG` y `ROADMAP-FEEDBACK`.

## 1. Dónde vive el roadmap

- Datos: `frontend/src/hub/roadmap/roadmap-data.ts`.
- UI: `frontend/src/hub/pages/RoadmapPage.tsx`.
- Textos editoriales internacionalizados en `frontend/src/i18n/locales/{es,en,pt,it}.ts`
  bajo el namespace `roadmap.*`.

## 2. Dos roadmaps

- `ROADMAP_CURRENT`: línea activa (v0.1.x). Datos manuales, editados por el producto.
- `ROADMAP_NEXT`: siguiente major. Snapshot en build-time de las filas `R0x` de
  `docs/release-roadmap-execution-index.md`. NO es lectura en runtime: se copian
  los datos a `roadmap-data.ts` cuando se regenera.

El toggle en `RoadmapPage` cambia qué dataset se renderiza (`useState<"current"|"next">`).

## 3. Escala de porcentajes (OBLIGATORIA)

Solo estos valores: `0, 10, 25, 50, 75, 100`.

Significado sugerido:

- `0` — ni siquiera empezado / bloqueado.
- `10` — explorado, sin trabajo real hecho.
- `25` — base puesta, bastante por hacer.
- `50` — mitad del camino.
- `75` — casi hecho, pulido / restante menor.
- `100` — cerrado.

Cualquier `%` fuera de esa escala se considera bug y debe corregirse al valor más
cercano de la escala.

## 4. Cómo valorar el % de una fase o área (criterio del producto)

- El `%` refleja trabajo real restante, no esperanza ni marketing.
- `ROADMAP_CURRENT`: lo fija el producto (Isaac) manualmente al cerrar cada fase.
  Se edita el número directamente en `roadmap-data.ts`.
- `ROADMAP_NEXT`: se deriva del estado de la fila en el release index:

  | estado en board | %  |
  |-----------------|----|
  | done            | 100|
  | in-progress     | 75 |
  | next            | 50 |
  | ready           | 25 |
  | planned         | 10 |
  | blocked / later | 0  |

  Al hacer el snapshot se aplica este mapeo y se redondea a la escala.
- `%` global = media entera de las áreas (o fases, según corresponda), redondeada
  al valor de la escala más cercano.

## 5. Procedimiento de changelog (paso a paso)

Cuando se cierra una feature / hotfix que el usuario deba ver:

1. Añadir la entrada a `docs/changelog.md` respetando su formato existente
   (versión, fecha, bullets).
2. Añadir la misma entrada (solo las últimas 5) al array `ROADMAP_CHANGELOG` en
   `roadmap-data.ts`:
   `{ version: string; date: string; titleKey: string; bodyKey: string }`.
   `titleKey` / `bodyKey` apuntan a `roadmap.changelog.<id>.title` / `.body` en los
   4 diccionarios i18n.
3. Correr `pnpm --dir frontend test` y `pnpm --dir frontend build`.
4. Commit + tag según `docs/versioning-and-release-gates.md`.

Reglas:

- No commitear PNGs salvo decisión explícita.
- El botón "Ver changelog completo" en Roadmap enlaza a `ROADMAP_CHANGELOG_URL`
  (constante en `roadmap-data.ts`), no renderiza `docs/changelog.md` en runtime.
- El array `ROADMAP_CHANGELOG` se sincroniza a mano con `docs/changelog.md`; no hay
  lectura automática.

## 6. No tocar

- Backend Go, Supabase/Auth, runtime OBS, LayoutStudio.
- `position` / `x` / `y` / `w` / `h`.
- Dependencias nuevas.
- `roadmap-execution-board.md` y `release-roadmap-execution-index.md` son fuente de
  verdad; el roadmap los consume (snapshot), no los edita.
