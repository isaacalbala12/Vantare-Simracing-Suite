# Mantenimiento del Roadmap y Changelog (Vantare)

> **Desde ISA-378 este documento describe el flujo anterior.** La fuente manual
> del roadmap es ahora `docs/roadmap/plan.md`, y el artefacto que consume la
> app es `docs/roadmap/roadmap.json`, que genera
> `.github/scripts/roadmap_digest.py` (tarea programada
> `.github/workflows/roadmap-digest.yml`) combinando el plan con los commits ya
> mergeados a `nightly`. `docs/roadmap-source.json` queda como referencia
> histórica: ya no lo lee nadie. Lo que sigue vale para el changelog (§5) y
> para entender de dónde viene el formato.

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

## 3. Porcentajes: se calculan solos

**Los porcentajes de las áreas ya no se escriben a mano.** Cada área declara en
`docs/roadmap-source.json` los proyectos del snapshot publico que la componen:

```json
{
  "id": "telemetry",
  "title": { "es": "Telemetría", "...": "..." },
  "progress": 25,
  "status": "in-progress",
  "projects": ["telemetry-core", "telemetry-analysis"]
}
```

La app suma las tareas de esos proyectos y muestra `hechas / totales`. El campo
`progress` queda **solo como respaldo** para cuando no hay red o el área no
tiene proyecto enlazado.

El motivo es concreto: mantener números a mano al lado de números vivos
garantiza que se desincronicen, y se desincronizaron. La vista editorial
publicaba 25% de telemetria mientras la pestaña de Proyectos, leyendo el mismo
Linear, mostraba 94%.

El porcentaje global es la media de las áreas, redondeada a entero. **Ya no se
ajusta a la escala 0/10/25/50/75/100**: redondear un 94% medido hasta 100%
anunciaría como terminado algo que no lo está. `nearestOnScale` y
`PROGRESS_SCALE` siguen existiendo para el progreso de las *fases*, que sí es
editorial.

### Áreas sin fuente automática

Tres áreas no tienen proyecto en Linear y conservan su número manual:

| Área | Estado |
|---|---|
| Launcher | sin proyecto en Linear |
| Calendario local | sin proyecto en Linear |
| UI v5.2 | sin proyecto en Linear |

Para automatizarlas hay que crear su proyecto en Linear, añadirlo a
`docs/roadmap-linear-catalog.json` y enlazarlo desde el área.

## 4. Que sigue siendo manual

- **El texto** de fases, áreas e hitos, en los cuatro idiomas.
- **El estado** de cada área y fase (`done`, `in-progress`, `planned`,
  `future`).
- **El progreso de las fases**, que sí es un juicio editorial sobre un bloque
  de roadmap y no se corresponde con ningun proyecto concreto.
- **Qué proyectos componen cada área**, es decir, el enlace `projects`.

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

## 7. Segunda pestaña: "Proyectos" (conectada a Linear)

La segunda pestaña del Roadmap ya **no** es "Desarrollo por features". Desde
ISA-258 muestra proyectos agrupados en tabs, cuya fuente operativa es Linear.

### Cómo funciona

- **Catálogo privado (qué es público):** `docs/roadmap-linear-catalog.json`.
  Fija qué proyectos de Linear se publican, con qué `id` opaco, en qué pestaña
  y con qué copy en `es/en/pt/it`. El UUID de Linear vive aquí y **nunca** sale
  en la salida pública.
- **Snapshot público:** `docs/roadmap-public.snapshot.json`. Es lo que consume
  la app. Incluye `generatedAt` y `staleAfterSeconds`.
- **Cliente:** `frontend/src/hub/roadmap/projects-data.ts` valida el snapshot
  entero antes de aceptarlo y distingue `remote-fresh`, `remote-stale` y
  `embedded-fallback`. La app **nunca** habla con Linear ni recibe credenciales.
- **UI:** `frontend/src/hub/roadmap/RoadmapProjectTabs.tsx`.

### Publicación automática

`.github/workflows/roadmap-snapshot.yml` regenera el snapshot y lo publica en la
rama de datos `roadmap-data`, que es de donde lo lee la app. Se dispara de tres
formas:

- **En cada push a `nightly`.** Es lo que hace que funcione hoy: un disparador
  por `push` se ejecuta con el fichero tal como está en la rama que recibe el
  push, sin depender de la rama por defecto. Sin filtro de rutas, a propósito.
- **A diario a las 04:00.** El snapshot proyecta Linear, no el código, así que
  se queda obsoleto cuando se mueve una tarea aunque nadie mergee nada. Este
  disparador **solo se activará cuando el workflow llegue a `master`**: GitHub
  únicamente lanza `schedule` desde la rama por defecto.
- **A mano**, por `workflow_dispatch`.

Detalles:

- Se ejecuta sobre `nightly`, porque el exportador y el catálogo viven ahí;
  `master` va por detrás y ni siquiera tiene `.github/scripts`.
- Usa el secreto `LINEAR_API_KEY` que ya existe en el repositorio.
- Antes de publicar, un paso de validación rechaza cualquier snapshot que
  filtre datos privados o que el validador del frontend fuese a rechazar.
- Si solo cambia `generatedAt`, no commitea: la rama no acumula ruido diario.
- Si un día falla, la app enseña el aviso ámbar de "obsoleto" en vez de dar
  datos viejos por actuales.

El snapshot es contenido generado, así que **no** viaja por el camino
issue → nightly → testers → master: un cambio de estado en una tarea de Linear
no debe exigir una promoción de producto. Por eso vive en su propia rama.

Para forzar una regeneración: lanzar el workflow por `workflow_dispatch`.
Para regenerarlo en local con tu propia clave:

```powershell
$env:LINEAR_API_KEY = "..."
python .github/scripts/roadmap_linear_snapshot.py `
  --catalog vantare-v2/docs/roadmap-linear-catalog.json `
  --output vantare-v2/docs/roadmap-public.snapshot.json
```

Sin clave, se puede probar toda la cadena contra el fixture:

```powershell
python .github/scripts/roadmap_linear_snapshot.py --catalog vantare-v2/docs/roadmap-linear-catalog.json --fixture .github/scripts/tests/fixtures/roadmap-linear-input.json --output "$env:TEMP/snap.json"
```

### Qué edita cada quién

- **Catálogo** (`docs/roadmap-linear-catalog.json`): lo editas tú. Decide qué
  proyectos son públicos, en qué pestaña y con qué copy en cuatro idiomas.
- **Snapshot** (`docs/roadmap-public.snapshot.json`): lo genera el exportador.
  La copia del repo es el **fallback empaquetado** que entra en el build; la
  copia viva está en `roadmap-data`. No lo edites a mano.
- **Progreso y estados**: salen de Linear. No hay porcentaje manual aquí, a
  diferencia del roadmap editorial (§3 y §4).

### Invariantes que valida el cliente

`progress.total` = número de tareas, `progress.done` = tareas en `done`,
`percent` = `Math.round(done/total*100)` y `null` si no hay tareas. Los estados
`canceled` se excluyen. Ningún texto público puede contener `ISA-*`, URLs,
dominios, correos ni UUID.

### Código muerto pendiente de retirar

`features-data.ts`, `roadmap-features.ts`, sus tests y `docs/features-source.json`
ya no los importa nadie. ISA-258 los dejó como compatibilidad transitoria.
