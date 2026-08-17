# Briefing 10 · Roadmap (`?view=roadmap`)

## Objetivo
Portar `RoadmapPage.tsx` / `hub/roadmap` a Orbit sobre `docs/roadmap-source.json` (phases, areas, milestones; progreso 0/10/25/50/75/100; i18n es/en/pt/it en el propio JSON).

## Estructura
- Cabecera: eyebrow "Dirección del producto", h2 "Roadmap", lead con la fuente; `SubtleStatus ok` "Fuente disponible · vX".
- `StatRow`: Fase actual (nombre · versión · % · frentes) · Áreas (n · en curso/planificadas) · Hitos (n · primeros 3) · Canal (actual).
- **Fases** (`Surface`): 4 columnas con barra de progreso (color por estado done/active/planned/future), eyebrow «Estado · versión · %», h3, `ul` de highlights con viñeta del color; línea de fondo que une las barras.
- Grid 2: **Áreas** (7 tarjetas con acento lateral por estado y etiqueta) · **Hitos** (lista vertical con puntos por estado sobre una línea).
- Columna contextual: eyebrow "Fases" con `ListRow` + % (ok/hot) → al pulsar, scroll a la fase y resaltado 1px carmín.

## Criterios de aceptación
- [ ] Todo el contenido viene del JSON (sin textos fijos salvo rótulos); idioma según i18n.
- [ ] Sin scroll de página a 1080 (a 900 puede desplazarse).
- [ ] Captura ≈ `evidence/roadmap.png`.

## Referencias
`06 § Roadmap`, `14 roadmap.*`, `docs/roadmap-source.json`.
