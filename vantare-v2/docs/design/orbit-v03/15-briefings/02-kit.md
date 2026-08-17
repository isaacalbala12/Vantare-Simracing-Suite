# Briefing 02 · Kit de componentes (`frontend/src/ui/orbit/`)

## Objetivo
Un kit reutilizable con los contratos de `12-contratos-componentes.md`, estilado solo con tokens, con harness visual y tests de estados. Las páginas no escriben CSS propio para estos elementos.

## Alcance (en este orden)
1. Primitivos: `Button`, `IconButton`, `Seg`, `Toggle`, `Field`, `Input`, `Select`, `Textarea`, `Kbd`.
2. Estado: `Pill`, `Chip` (tier), `StateChip`, `SubtleStatus`, `TyreChip`, `StatTile`/`StatRow`, `Note`, `Dot`.
3. Contenedores: `Surface` (+ cabecera), `Featured`, `ListRow`, `Monogram`, `Menu`, `Accordion`, `UnderlineTabs`, `Toast` (provider + `useToast`), `Tooltip`.
4. Visualización: `CountdownDial`, `MiniStage` (host V3 en modo preview), `HorizontalTimeline`, `Donut`, `Trace`, `TrackMap`, `CornerSlot`, `TyreItem`, `AvailabilityBoard`, `KeycapRow`, `Fader` (decorativo).
5. Harness `frontend/src/ui-orbit-harness.tsx` (o Storybook si existe) con todos los componentes en todos los estados; script `visual:orbit-kit` con Playwright.

## Reglas de implementación
- Medidas y estados exactamente como `04-componentes.md`; motion como `07`.
- Sin `title` nativo; `aria-*` según `08`. Foco `outline 2px coral`.
- Los componentes de visualización reciben datos ya calculados (los algoritmos van en dominio, `13`).
- `MiniStage`: contenedor `aspect-ratio 16/9; container-type: inline-size`, sin interacción, widgets reales del sistema V3 (`renderMode: "preview"`).

## Criterios de aceptación
- [ ] Harness muestra: botones (primary/ghost/danger/sm, running/dirty/saved/disabled), seg, toggle (con animación spring), inputs, pills (connected/searching/disconnected/update), chips (bronze/silver/gold), state chips, stat tiles (neutral/hot/ok), surface con cabecera, featured, list rows (normal/selected/next), monogramas 26–60, menú, acordeón abierto/cerrado con resumen, tabs, toasts (3 apilados), tooltip, keycaps físicos/vacío/conflicto, dial (frac 0.5), timeline (2 filas), donut (4 slices), 4 trazas, mapa con tramos, corner slots (vacío/lleno/over/pulse), tyre items (libre/usado/picked), availability board.
- [ ] Tests de estados con Testing Library (aria-pressed, aria-selected, disabled, aria-expanded).
- [ ] Capturas del harness a 1920×1080 archivadas en `evidence/porte/02-kit/`.
- [ ] Ningún color/px hardcodeado que exista como token (grep de `#` y `px` en `ui/orbit` revisado).

## Referencias
`04-componentes.md`, `12-contratos-componentes.md`, `07-motion.md`, `08-accesibilidad.md`; CSS literal en el HTML (buscar la clase).
