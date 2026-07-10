# Guía para agentes de IA: cómo editar el Roadmap de Vantare

Este documento es para **agentes worker** que reciben una tarea de edición del
roadmap. Si eres un humano, lee `docs/roadmap-maintenance.md`.

---

## 1. Regla de oro

**El roadmap es manual.** No hay scripts. La fuente de verdad es un JSON que
Isaac edita a mano. La app lo trae por `fetch` en runtime.

---

## 2. Archivos involucrados

| Archivo | Qué es | Quién lo edita |
|---|---|---|
| `docs/features-source.json` | **Fuente de verdad.** JSON manual con categorías, features y subtasks. | Isaac o agente por encargo. |
| `frontend/src/hub/roadmap/features-data.ts` | `FEATURES_FALLBACK` (copia empaquetada del JSON) + `FEATURES_SOURCE_URL` + tipos + `featurePercent()`. | Agente (si cambia el schema). |
| `frontend/src/hub/roadmap/roadmap-features.ts` | `getActiveSections()` + `STATUS_META` + `TIPO_META` + helpers de UI. | Agente (si cambia la lógica). |
| `frontend/src/hub/pages/RoadmapPage.tsx` | `FeatureCard` (checkboxes + barra) + `SectionBlock` + `FeaturesSection`. | Solo si cambia el render. |
| `frontend/src/hub/roadmap/roadmap-features.test.ts` | Tests del módulo. | Agente. |
| `frontend/src/hub/pages/RoadmapPage.test.tsx` | Tests del componente. | Agente. |

**Regla de sincronía:** Si editas `docs/features-source.json`, DEBES actualizar
`FEATURES_FALLBACK` en `features-data.ts` con los mismos datos. Si no lo haces,
el fallback offline queda desincronizado.

---

## 3. Schema del JSON (`docs/features-source.json`)

```json
{
  "version": 2,
  "updatedAt": "YYYY-MM-DD",
  "categories": [
    { "id": "string", "label": LocalizedText, "order": number }
  ],
  "features": [
    {
      "id": "string",
      "category": "string (debe existir en categories[].id)",
      "label": LocalizedText,
      "description": LocalizedText,
      "tipo": "feature | bugfix | improve | component",
      "status": "in-development | research | future",
      "subtasks": [
        { "label": LocalizedText, "done": boolean }
      ]
    }
  ]
}
```

**`LocalizedText`**: `{ "es": string, "en": string, "pt": string, "it": string }`

**Reglas:**
- `id`: kebab-case, único, estable (se usa como key de React).
- `category`: debe existir en `categories[].id`. Si no, la feature se ignora.
- `status`:
  - `in-development` → aparece en "En desarrollo" (rojo)
  - `research` → aparece en "En investigación" (violeta)
  - `future` → aparece en "Próximamente" (gris)
- `tipo`: `feature` ⚡, `bugfix` 🐛, `improve` 🔧, `component` 🧩. NO `research`.
- `subtasks`: array de checkboxes. El % se calcula automáticamente:
  `% = Math.round((done / total) * 100)`.
- **No hay campo `percent`** — es computado de las subtasks.

---

## 4. Qué ves en la UI

Cada card muestra:
```
[⚡ Feature] [EN DESARROLLO]
Título de la feature
Descripción...

☐ Subtask pendiente
☑ Subtask completada

[barra de progreso] 90%
```

- **Checkboxes**: subtasks de la feature. Marcar `done: true` = completada.
- **Barra de progreso**: calculada del ratio done/total. No se edita directamente.
- **% numérico**: mismo cálculo que la barra.

---

## 5. Cómo editar (pasos concretos)

### 5.1. Añadir una feature nueva

1. Añadir la categoría (si no existe) en `categories[]` con `id`, `label` (4 idiomas), `order`.
2. Añadir la feature en `features[]` con todos los campos.
3. Sincronizar `FEATURES_FALLBACK` en `features-data.ts` con la misma data.
4. Ejecutar: `tsc --noEmit` + `pnpm test` + `pnpm build`.
5. Commit.

### 5.2. Cambiar el progreso de una feature

1. Editar `done: true/false` en las subtasks de `docs/features-source.json`.
2. Sincronizar `FEATURES_FALLBACK` en `features-data.ts`.
3. No toques el `percent` — se recalcula solo.
4. Ejecutar checks + commit.

### 5.3. Cambiar el status de una feature

1. Cambiar `status` en `docs/features-source.json`.
2. Sincronizar `FEATURES_FALLBACK`.
3. Checks + commit.

### 5.4. Añadir una categoría

1. Añadir en `categories[]` del JSON: `{ "id": "nueva", "label": {...}, "order": N }`.
2. Sincronizar `FEATURES_FALLBACK` en `features-data.ts`.
3. Añadir features en esa categoría.
4. Checks + commit.

### 5.5. Eliminar una feature o categoría

1. Eliminar del JSON.
2. Eliminar del `FEATURES_FALLBACK`.
3. Si la categoría queda vacía, eliminarla también.
4. Checks + commit.

---

## 6. Qué NO hacer

- **No** crear scripts para regenerar el JSON desde otros documentos.
- **No** meter `percent` manualmente en el JSON — se calcula de subtasks.
- **No** meter `tipo: "research"` — research es un `status`, no un `tipo`.
- **No** meter `status` fuera de `in-development | research | future`.
- **No** olvidar sincronizar `FEATURES_FALLBACK` con el JSON.
- **No** tocar `RoadmapPage.tsx` salvo que el cambio sea de render.
- **No** commitear sin pasar `tsc --noEmit` + `pnpm test` + `pnpm build`.
- **No** debilitar tests para que pasen.

---

## 7. Ejemplo real: lo que Isaac te pasa

Isaac dice:

> Añade esto:
> WIDGET STUDIO (desarrollo)
> - Reformar sección a sección.
> - Code-review extenso.
> - Widgets Crystal restantes.
> - Revisión de personalización extensa.

**Tu interpretación:**
1. Categoría: `widget-studio`, label "Widget Studio".
2. Feature: `widget-studio-reform`.
3. Status: `in-development` (dice "desarrollo").
4. Subtasks: 4 items (cada guion = 1 subtask).
5. Todas `done: false` (nada empezado).

**Resultado en el JSON:**
```json
{
  "id": "widget-studio-reform",
  "category": "widget-studio",
  "label": { "es": "Widget Studio — Reforma y code-review", ... },
  "description": { "es": "Reformar Widget Studio sección a sección con code-review extenso.", ... },
  "tipo": "feature",
  "status": "in-development",
  "subtasks": [
    { "label": { "es": "Reformar sección a sección", ... } },
    { "label": { "es": "Code-review extenso", ... } },
    { "label": { "es": "Widgets Crystal restantes", ... } },
    { "label": { "es": "Revisión de personalización extensa", ... } }
  ]
}
```

**Resultado visual:**
```
[⚡ Feature] [EN DESARROLLO]
Widget Studio — Reforma y code-review
Reformar Widget Studio sección a sección con code-review extenso.

☐ Reformar sección a sección
☐ Code-review extenso
☐ Widgets Crystal restantes
☐ Revisión de personalización extensa

[barra] 0%
```

---

## 8. Traducción de statuses

| Isaac dice | Status JSON | Badge UI |
|---|---|---|
| "desarrollo", "activo", "trabajando" | `in-development` | EN DESARROLLO (rojo) |
| "investigación", "research", "evaluando" | `research` | EN INVESTIGACIÓN (violeta) |
| "standby", "próximamente", "futuro", "pendiente" | `future` | PRÓXIMAMENTE (gris) |

## 9. Checks obligatorios

```bash
corepack pnpm --dir frontend exec tsc --noEmit
corepack pnpm --dir frontend exec vitest run src/hub/roadmap/
corepack pnpm --dir frontend exec vitest run src/hub/pages/RoadmapPage.test.tsx
```

## 10. Referencias

- `docs/roadmap-maintenance.md` — procedimiento del lado humano.
- `docs/features-source.json` — la fuente.
- `frontend/src/hub/roadmap/features-data.ts` — tipos, fallback, `featurePercent()`.
- `frontend/src/hub/roadmap/roadmap-features.ts` — `STATUS_META`, `TIPO_META`, `getActiveSections()`.
- `frontend/src/hub/pages/RoadmapPage.tsx` — UI.
