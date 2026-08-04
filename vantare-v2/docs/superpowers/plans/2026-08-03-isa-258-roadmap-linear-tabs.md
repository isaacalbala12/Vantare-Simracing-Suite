# ISA-258 — Roadmap conectado a Linear

## Resultado buscado

Conservar intacta la vista editorial actual del Roadmap y sustituir la vista manual “Desarrollo por features” por una vista pública agrupada en pestañas. Cada pestaña contiene proyectos seleccionados de Linear y cada proyecto muestra tareas con título sanitizado y estado público. La aplicación nunca consulta Linear ni recibe credenciales.

```text
Linear (privado, read-only)
  -> catálogo allowlist versionado
  -> exporter determinista y sanitizador
  -> snapshot JSON público por canal
  -> loader validado con freshness/fallback explícitos
  -> pestañas -> proyectos -> tareas
```

## Decisiones arquitecturales

- `origin/nightly@0b234ba6e0688f07a4442da8ee37225af0acff69` es la base de este corte.
- Linear es la fuente operativa; el repositorio controla qué proyectos son públicos mediante UUID estable, copy localizado y agrupación.
- No se reutilizan `features-data.ts` ni `roadmap-features.ts`: son compatibilidad transitoria y se retiran en otro corte.
- No se toca el Roadmap editorial (`phases`, `areas`, `milestones`) ni el Dashboard.
- El cliente consume solo un snapshot público, nunca Linear. No hay token, proxy, webhook ni nueva dependencia.
- El MVP publica solo título sanitizado y estado. `summary` queda reservado como campo opcional para copy editorial futuro; no se usa contenido de descripciones/comentarios ni LLM en runtime.
- Estados: `completed -> done`, `started -> in-progress`, `unstarted/backlog -> planned`; `canceled`, `duplicate`, archivadas y estados desconocidos se excluyen/fallan cerrado según el contexto.
- Progreso: `done / total de tareas públicas`. Un proyecto sin tareas tiene porcentaje `null`, no `0`.
- IDs públicos: opacos y deterministas, derivados de SHA-256 con namespace; nunca se exportan UUID, identificadores `ISA-*`, URLs, descripciones, comentarios, labels, personas o workspace.
- El loader diferencia `loading`, `remote-fresh`, `remote-stale`, `embedded-fallback`, `invalid` y `unavailable`. Un fallback nunca se presenta como actual.
- La publicación automática/productiva queda fuera de ISA-258. Este corte entrega contrato, exporter read-only/dry-run, snapshot empaquetado, UI y pruebas.

## Catálogo privado versionado

Archivo: `docs/roadmap-linear-catalog.json`.

Campos mínimos:

```json
{
  "schemaVersion": 1,
  "channel": "nightly",
  "tabs": [{
    "id": "overlays-telemetry",
    "label": {"es":"Overlays y telemetría","en":"Overlays and telemetry","pt":"Overlays e telemetria","it":"Overlay e telemetria"},
    "projects": [{
      "sourceId": "linear-project-uuid",
      "id": "overlay-studio-v3",
      "title": {"es":"Overlay Studio V3","en":"Overlay Studio V3","pt":"Overlay Studio V3","it":"Overlay Studio V3"},
      "summary": {"es":"Editor visual de overlays.","en":"Visual overlay editor.","pt":"Editor visual de overlays.","it":"Editor visuale di overlay."}
    }]
  }]
}
```

Pestañas iniciales:

1. `overlays-telemetry`: Overlay Studio V3, Telemetry Core, Telemetry Analysis.
2. `engineer-strategy`: Engineer & Spotter, Strategy Planner.
3. `platform`: Billing.

El UUID se usa únicamente durante la exportación y no aparece en la salida pública.

## Snapshot público v1

Archivo empaquetado: `docs/roadmap-public.snapshot.json`.

```json
{
  "schemaVersion": 1,
  "channel": "nightly",
  "generatedAt": "2026-08-03T00:00:00Z",
  "staleAfterSeconds": 86400,
  "tabs": [{
    "id": "overlays-telemetry",
    "label": {"es":"...","en":"...","pt":"...","it":"..."},
    "projects": [{
      "id": "overlay-studio-v3",
      "title": {"es":"...","en":"...","pt":"...","it":"..."},
      "summary": {"es":"...","en":"...","pt":"...","it":"..."},
      "progress": {"done": 2, "total": 5, "percent": 40},
      "tasks": [{"id":"task_<opaque>","title":"Título público","status":"in-progress","updatedAt":"2026-08-03T00:00:00Z"}]
    }]
  }]
}
```

Invariantes: canal `nightly`, cuatro locales completos, IDs únicos, pestañas/proyectos no vacíos, orden de catálogo estable, tareas por estado y fecha/título de forma determinista, porcentaje reproducible y ausencia de campos privados.

## Microcortes ejecutables

### A. Contrato y exporter

Write set:

- `.github/scripts/roadmap_linear_snapshot.py`
- `.github/scripts/tests/test_roadmap_linear_snapshot.py`
- `.github/scripts/tests/fixtures/roadmap-linear-*.json`
- `docs/roadmap-linear-catalog.json`
- `docs/roadmap-public.snapshot.json`

Implementar con Python stdlib:

1. Cargar y validar catálogo.
2. Consultar cada proyecto por UUID mediante GraphQL read-only, con `first/after` y `pageInfo`.
3. Tratar `errors` GraphQL como fallo aunque HTTP sea 200.
4. Permitir `--fixture` para pruebas sin red y `--output` explícito.
5. Sanitizar títulos, mapear estados, excluir archivadas/canceladas/duplicadas, crear IDs opacos y calcular progreso.
6. Rechazar salida vacía inesperada o parcial; escribir de forma atómica solo tras validar el snapshot completo.
7. No registrar títulos originales, token ni payloads.

Tests: paginación, errores GraphQL, orden determinista, mapeo de estados, exclusiones, sanitización, IDs estables, progreso, catálogo inválido, salida vacía y ausencia de datos privados.

### B. Contrato y loader frontend

Write set:

- `frontend/src/hub/roadmap/projects-data.ts`
- `frontend/src/hub/roadmap/projects-data.test.ts`

Implementar tipos, fallback empaquetado, normalizador estricto y `fetchRoadmapProjectsDataset`. El resultado incluye procedencia y freshness; valida `schemaVersion` y `channel`, rechaza snapshots vacíos/inválidos y preserva el fallback como tal.

### C. UI de pestañas, proyectos y tareas

Write set:

- `frontend/src/hub/roadmap/RoadmapProjectTabs.tsx`
- `frontend/src/hub/roadmap/RoadmapProjectTabs.test.tsx`
- `frontend/src/hub/pages/RoadmapPage.tsx`
- `frontend/src/hub/pages/RoadmapPage.test.tsx`
- diccionarios i18n `es`, `en`, `pt`, `it` y sus pruebas aplicables

Reemplazar solo la rama `activeKey === "next"`. Las pestañas internas usan `tablist/tab/tabpanel`, `aria-selected`, `aria-controls` y teclado ArrowLeft/ArrowRight/Home/End. Cada proyecto muestra copy, progreso y las primeras 8 tareas; “ver todas/mostrar menos” controla listas largas. Renderizar título + estado, con aviso visible para stale/fallback/error.

### D. Integración y revisión

Checks obligatorios:

```powershell
python .github/scripts/tests/test_roadmap_linear_snapshot.py
corepack pnpm --dir vantare-v2/frontend test -- projects-data RoadmapProjectTabs RoadmapPage
corepack pnpm --dir vantare-v2/frontend build
corepack pnpm --dir vantare-v2/frontend lint
git diff --check
```

Revisión independiente: privacidad, fail-closed, accesibilidad, coherencia del progreso, ausencia de regresión en la vista editorial y alcance sin backend/Go/Supabase/dependencias.

## Verificación manual de Isaac

1. Abrir Roadmap y comprobar que “Roadmap actual” conserva fases, áreas, hitos y feedback.
2. Abrir “Proyectos” y recorrer las tres pestañas con ratón y teclado.
3. Confirmar que cada proyecto agrupa sus tareas y que listas largas se expanden/contraen.
4. Simular red disponible, snapshot antiguo, 404 y JSON inválido; comprobar los mensajes de actual/stale/fallback/no disponible.
5. Inspeccionar el JSON público y buscar `ISA-`, `linear.app`, URLs, emails, `description`, `comment`, `assignee`, `sourceId`.
6. No promover a `nightly`, `testers` o `master` hasta aprobación manual explícita.

## Fuera de alcance y siguientes cortes

- Workflow programado, rama/endpoint de datos y retención del último snapshot válido.
- Opt-in por label si se necesita granularidad por tarea (el MVP publica las tareas de proyectos explícitamente allowlisted).
- Resúmenes editoriales por tarea.
- Migración del Dashboard a una fuente unificada.
- Retirada de los archivos manuales de features.
