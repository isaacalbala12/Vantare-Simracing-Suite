# Vantare · Command Orbit v0.3 — paquete de diseño

> Documentación oficial del prototipo de dirección **Command Orbit v0.3** y contrato para portarlo al frontend real.
> Fuente visual: [`vantare-exploration-v03-orbit.html`](../../../vantare-exploration-v03-orbit.html) (autocontenido; ábrelo con `?view=<sección>`).
> Estado: **dirección aprobada** por producto (Isaac) el 2026-08-16. Sustituye la dirección "v5" descrita en [`docs/DESIGN.md`](../../DESIGN.md) para el **hub**; los overlays (widgets sobre el juego) mantienen su propio sistema V3.

## Qué contiene

| # | Documento | Para qué sirve |
|---|---|---|
| 00 | [Decisiones](00-decisiones.md) | Registro de decisiones de diseño (ADR-lite): qué se decidió, por qué y qué se descartó. |
| 01 | [Principios](01-principios.md) | Filosofía visual y de producto que explica todas las demás reglas. |
| 02 | [Tokens](02-tokens.md) · [`tokens.json`](tokens.json) · [`orbit.tokens.css`](orbit.tokens.css) · [`vantare-orbit.theme.json`](vantare-orbit.theme.json) | Color, tipografía, espaciado, radios, sombras, motion, densidades, z-index, iconografía. Valores exactos y exportables. |
| 03 | [Shell y layout](03-shell-y-layout.md) | Rail + columna contextual + topbar + workspace; reglas de plegado, duplicados, alturas y "sin scroll de página". |
| 04 | [Componentes](04-componentes.md) | Catálogo con anatomía, variantes, estados, medidas, tokens y accesibilidad. |
| 05 | [Patrones](05-patrones.md) | Navegación, gating por plan, honestidad de datos, estados operativos, edición in-place, drag & drop, timelines. |
| 06 | [Pantallas](06-pantallas.md) | Especificación sección a sección: estructura, datos, interacciones, medidas, estados. |
| 07 | [Motion](07-motion.md) | Duraciones, easings, qué se anima y qué no, reduced motion. |
| 08 | [Accesibilidad](08-accesibilidad.md) | Contraste, foco, teclado, ARIA, tamaños de objetivo. |
| 09 | [Contenido y voz](09-contenido-y-voz.md) | Copy en español, caja de texto, terminología, i18n. |
| 10 | [Plan de porte](10-plan-de-porte.md) | Mapeo prototipo → `frontend/src`, fases, definición de hecho, riesgos. |
| 11 | [QA checklist](11-qa-checklist.md) | Lista de verificación visual/funcional para cada PR del porte. |
| 12 | [Contratos de componentes](12-contratos-componentes.md) | Interfaces TS del kit `ui/orbit/*` (props, variantes, eventos) y de la shell. |
| 13 | [Modelo y algoritmos](13-modelo-y-algoritmos.md) | Tipos y algoritmos del prototipo en TS puro (`nextStarts`, `buildPlan`, dial, neumáticos, veredicto, disponibilidad, telemetría sintética) con casos de prueba. |
| 14 | [i18n](14-i18n.md) | Catálogo de claves y cadenas en `es` por sección; reglas de nombres, plurales e interpolación. |
| 15 | [Briefings por pestaña](15-briefings/README.md) | 13 briefings autocontenidos (fundamentos, shell, kit y uno por sección) con alcance, comportamiento y criterios de aceptación: son los prompts de ejecución. |
| — | [`evidence/`](evidence/README.md) | 18 capturas de referencia (1920×1080 y 1920×900) generadas con Playwright desde el HTML: `node docs/design/orbit-v03/evidence/capture.mjs`. |

## Cómo usar este paquete

- **Diseño**: el HTML es la referencia de píxeles; estos docs son la referencia de reglas. Si el HTML y el doc discrepan, manda el doc y se corrige el HTML (o se registra una decisión nueva en `00`).
- **Ingeniería**: empieza por `10-plan-de-porte.md`; cada fase enlaza a los componentes (`04`) y pantallas (`06`) que toca. Los tokens se importan desde `orbit.tokens.css` / `vantare-orbit.theme.json`.
- **QA**: `11-qa-checklist.md` en cada PR de UI del porte, con capturas Playwright a 1920×1080 y 1920×900.

## Alcance y no-alcance

Cubre: hub de escritorio (todas las secciones), columna lateral, paleta de comando, ajustes, atajos.
No cubre: renderizado de widgets de overlay (sistema V3, ver `docs/design-system-authoring-v3.md`), OBS Browser Source, marketing/landing (ver `docs/BRAND.md`).

## Harness del prototipo (query params)

`?view=inicio|studio|launcher|carreras|estrategia|ingeniero|telemetria|roadmap|ajustes|testing` · `?settings=account|application|updates|hotkeys|diagnostics` · `?plan=free|overlays|engineer|suite` · `?channel=stable|testers|nightly` · `?sim=connected|searching|disconnected` · `?update=none|available|downloading|ready` · `?save=saved|dirty` · `?overlays=stopped|running` · `?density=compact|balanced|comfortable` · `?sidebar=expanded|collapsed` · `?rightDock=open|closed` · `?stress=1` · `?debug=1` (panel QA).
