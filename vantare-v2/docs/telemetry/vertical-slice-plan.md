# Plan — Vertical slice de la suite de análisis de telemetría

Estado: draft para revisión (Isaac + Sol).
Referencias: ADR-0090, ADR-0091, `docs/telemetry/contracts.md`, `docs/telemetry/spike-criteria.md`.

## Diagnóstico

Los ADR están aceptados y los contratos definidos, pero ninguna decisión está demostrada end-to-end: CGO/DuckDB en el pipeline real, dockview en WebView2, la cadena binaria servidor→canvas y la sincronización por facetas son teoría. Más documentos no reducen ese riesgo; una slice completa sí.

## Objetivo

Una sola cosa: **desde un DuckDB real de LMU hasta un workspace de 4 paneles dockview comparando 2 vueltas, con cursor sincronizado y layout guardable/restaurable.**

```text
DuckDB real de LMU
→ importación segura (máquina de estados, copia gestionada, fingerprint)
→ normalización al esquema canónico (canales de la slice)
→ selección de dos vueltas
→ velocidad + pedales + delta + mapa
→ cuatro paneles Dockview
→ cursor sincronizado (facetas)
→ guardar/restaurar layout
```

Todo lo demás queda explícitamente fuera: zonas/curvas, informe de vuelta, más canales, coach LLM, 3D, popout multi-monitor (solo veredicto de spike), estética final.

## Alcance

**Esperado (nuevo):**
- `pkg/analysis/model/` — tipos canónicos (contracts.md §1)
- `internal/analysis/importer/` — watcher + máquina de estados + adaptador LMU
- `internal/analysis/store/` — store DuckDB propio (catálogo + series + caches por distancia)
- `internal/analysis/derive/` — delta por distancia, TrackShape 2D
- `internal/server/` — endpoints `/api/analysis/*` (extensión del server existente)
- `frontend/src/analysis/` — workspace, registry, 4 paneles, bus de facetas, DataApi client, layouts
- `frontend/src/hub/pages/TelemetryPage.tsx` — deja de ser placeholder y monta el workspace

**Prohibido:**
- Tocar overlays live, Overlay Studio V3, engineer, licensing, launcher.
- Modificar cualquier archivo de LMU.
- Datos inventados: la slice solo funciona con sesiones reales importadas (política del repo).

## Riesgos

1. **CGO rompe el pipeline de release** → por eso el Spike 1 va primero y tiene plan B definido.
2. **dockview + WebView2 tiene fricción no documentada** → Spike 2 con criterios W1–W9 antes de construir sobre él.
3. **Sobreingeniería**: la slice implementa el contrato mínimo, no la generalidad completa (p. ej. solo axis=distance para el delta, solo los 9 canales canónicos de la slice).
4. **Decodificación GPS imprecisa** (pregunta abierta ADR-0090): se valida contra Lap Dist en G6 y visualmente contra el trazado conocido.
5. **Scope creep de paneles**: exactamente 4 (trace velocidad, trace pedales, delta, mapa). Ni uno más en la slice.

## Fases y gates

Cada microplan sigue la plantilla del repo (`docs/prompts/miniplan-template.md`), lo ejecuta un worker (opencode), lo reviso yo, y el gate humano de Isaac manda (AGENTS.md).

### Fase 0 — Spikes (paralelos, ramas desechables)
- **0a**: Spike DuckDB (driver oficial `duckdb-go/v2`) → criterios D1–D8. Decide integración embebida vs. plan B **y el esquema físico del store** (base única vs. catálogo + archivo por sesión, D8) — bloqueante para 1a.
- **0b**: Spike dockview + uPlot → criterios W1–W9. Decide dockview, modo de render (`always` + suspensión vs. remount, W6) y estrategia de popout (W8: popout dockview requiere URL http(s) same-origin; plan B = segunda ventana Wails).
- **Gate**: tablas de criterios rellenadas y anexadas a los ADR; decisión Isaac+Sol si algo falla.

### Fase 1 — Backend de datos
- **1a**: `pkg/analysis/model` + store DuckDB (esquema canónico, catálogo). Tests de round-trip.
- **1b**: Adaptador LMU: lectura de copia, mapeo a canales canónicos de la slice, laps desde eventos, metadata/setup. Test contra fixture real pequeño (sesión corta anonimizada como testdata).
- **1c**: Importador: máquina de estados (`detected → … → done|quarantined|garage`), fingerprint, copia gestionada, idempotencia. Tests de: WAL huérfano, garaje, re-import.
- **1d**: Derivados: vista por distancia + delta entre 2 vueltas + TrackShape 2D. Criterio G6.
- **Gate**: importar la sesión real de Algarve (178 MB) entera y consultarla por CLI/test; volumetría y tiempos dentro de criterios D3–D5, M2–M3.

### Fase 2 — API + cadena binaria
- **2a**: Endpoints `/api/analysis/*` (batch `POST /series`) con reducción M4/transitions en servidor, formato binario, `protocolVersion` y token de autenticación por arranque (contracts.md §2).
- **2b**: DataApi client TS: decode, cancelación, dedup, cache LRU, `onDataRevision`. Tests unitarios.
- **Gate**: criterios G1, G4, G5 medidos.

### Fase 3 — Workspace mínimo
- **3a**: Bus de facetas + PersistentContext/RuntimeInteractionState + tests (es el componente que se testea primero, ADR-0091).
- **3b**: Shell dockview + panel registry + ciclo de vida (activate/deactivate/resize/abortPending/dispose) con panel de prueba instrumentado.
- **3c**: Paneles reales: trace-stack (velocidad; pedales), delta, track-map. seriesSlot→tema tokenizado.
- **3d**: Selección de sesión/vueltas (lista mínima dentro de TelemetryPage: sesiones importadas → elegir 2 vueltas).
- **3e**: Guardar/restaurar layout (persistencia atómica, reconciliación, `dockviewVersion`, layout de fábrica "Slice").
- **Gate**: criterios W1–W7, G2, G3, M1 medidos sobre la slice real.

### Fase 4 — Verificación humana
- Sesión de prueba de Isaac con sus propios datos: importar, comparar 2 vueltas de Algarve, mover cursor, hacer zoom, recolocar paneles, guardar layout, cerrar app, reabrir, restaurar.
- **Gate final**: prueba manual 100% de Isaac (regla del repo). Solo entonces la slice puede ir a `develop`.

## Tests y checks (cada fase)

```bash
go test ./...
gofmt -l .
pnpm --dir frontend test
pnpm --dir frontend build
pnpm --dir frontend lint   # sin empeorar los 11 errores preexistentes
```

## Verificación manual (Isaac, fase 4)

1. Conduce (o usa una sesión existente de) Algarve/Laguna Seca.
2. Abre Vantare → Telemetría: la sesión aparece sola tras cerrar LMU (o al pulsar "Importar").
3. Elige 2 vueltas → se abren los 4 paneles con datos reales.
4. Mueve el ratón sobre cualquier gráfica: el cursor se mueve en las 4 vistas a la vez, sin tirones.
5. Zoom en un sector: las gráficas y el mapa acotan; la tabla del delta sigue el rango.
6. Arrastra un panel a otra posición, guarda el layout con nombre, cierra y reabre la app: todo vuelve como estaba.
7. Cualquier tirón, dato raro o fricción → se anota y bloquea el gate.

## Qué revela esta slice (por diseño)

- CGO/DuckDB en pipeline real (riesgo nº1) — fase 0a/1.
- dockview en WebView2 (riesgo nº2) — fase 0b/3.
- Si el contrato de facetas aguanta paneles heterogéneos (trace vs. mapa) — fase 3.
- Si la cadena binaria server→canvas cumple los presupuestos de latencia — fase 2/3.
- Si el modelo canónico sobrevive al contacto con un archivo real completo — fase 1.
