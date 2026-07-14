# ISA-92 - Paridad 1:1 del editor Overlay Studio

Fecha: 2026-07-14
Rama: `vantareapp/isa-92-os-02-paridad-11-del-editor-overlay-studio`
Base: `0a797bf720c098a52e91883ed0ddddda0c9fdd15`

## Estado

La geometría, el responsive, los estados y los materiales del shell Studio se han alineado con el área Studio de `layout-studio-v10.html`, conservando la topbar, los controles y el flujo real de Vantare. No se han tocado renderers, ViewModels, catálogo, primitives Crystal, Telemetry, Engineer, Billing ni server.

La excepción mínima de ownership autorizada por Isaac añade únicamente tres claves de cabecera/toolbar a los cuatro diccionarios `studio-v3`. El boundary i18n y la paridad de claves quedan verdes; no se han añadido otros textos ni módulos.

## Geometría

- Contexto real wide: contenido del shell en `x=84`, cabecera Studio en `y=76`, grid en `y=172.5`.
- Columnas wide: lista `240 px`, gap `16 px`, canvas `1218 px`, gap `16 px`, inspector `320 px`.
- Toolbar `36 px`, footer `44 px`, radios `12 px` y overflow horizontal `0 px`.
- Medium: lista `240 px`, canvas flexible e inspector drawer `320 px`.
- Compact: canvas completo y drawers laterales de `320 px`, sin overflow de página.
- Métricas completas: [geometry-metrics.json](./geometry-metrics.json).
- El bloque `authorityAndGates` registra autoridad, valor real, tolerancia, delta máximo y `pass` para wide/medium/compact.

## Auditoría visual cuantitativa

Captura Chromium headless, DPR 1, threshold máximo por canal `12`. Se esperaron las fuentes reales Inter, Rajdhani y Space Mono. Las máscaras se limitan a topbar y contenido real variable: canvas, filas de widgets, contenido del inspector, nombre de perfil, contador, previews del rail y valores de fuente/session/location. Bordes, paneles y controles permanecen comparados.

| Crop | Delta | Gate | Resultado |
|---|---:|---:|---|
| comparación estable global | 3.864% | <= 5% | PASS |
| chrome principal | 1.000% | <= 3% | PASS |
| cabecera | 2.431% | <= 5% | PASS |
| toolbar canvas | 4.532% | <= 5% | PASS |
| footer canvas | 3.845% | <= 5% | PASS |
| cabecera lista | 3.279% | <= 5% | PASS |
| rail inspector | 2.979% | <= 5% | PASS |

- Métricas y máscaras: [visual-comparison-metrics.json](./visual-comparison-metrics.json) y [chrome-crop-metrics.json](./chrome-crop-metrics.json).
- Comparación: [side-by-side](./artifacts/studio-wide-side-by-side.png), [overlay](./artifacts/studio-wide-overlay.png), [diff](./artifacts/studio-wide-diff.png).
- Viewports: [wide](./artifacts/studio-wide.png), [medium](./artifacts/studio-medium.png), [compact](./artifacts/studio-compact.png).
- Responsive: [drawer lista](./artifacts/studio-compact-list-drawer.png), [drawer inspector](./artifacts/studio-compact-inspector-drawer.png).
- Estados sin máscara de chrome: [state-control-metrics.json](./state-control-metrics.json). La fila selected queda en `0.000%` y el rail active en `1.656%`; solo se ocultan los bounding boxes separados de icono/nombre/badge o preview variable, dejando el gradiente, spacing y bordes comparados. El script reproducible es [measure-states.mjs](./measure-states.mjs).

No se ejecutó `visual:overlay-studio:update` ni se regeneró ningún baseline. La suite oficial conserva el fallo heredado de ISA-91 en `delta-crystal-ready-studio` (`99.963% > 0.500%`).

## Interacción

[interaction-smoke.json](./interaction-smoke.json) registra PASS sin errores de consola para:

- click/selección y move;
- cancelación con Escape;
- ocho handles (`nw`, `n`, `ne`, `e`, `se`, `s`, `sw`, `w`);
- zoom a 150%, teclado y action bar;
- drawer de lista y apertura automática del inspector en compact.

El crop dedicado de estados confirma además `238×37.5 px` para la fila selected, `52×44 px` para el item de rail, preview `32×22 px`, ocho handles y overflow `0`.

`measure-states.mjs` aplica al DOM del harness la clase real `.v52-shell-bg` y el content box medido del `V52Shell` (`x=84`, `y=80`, `1812×976`); después lee los rectángulos resultantes y calcula los deltas, no copia los valores reales desde la autoridad. Requiere Vite en `127.0.0.1:5176`, acceso al HTML autoridad del worktree `25db` y acceso a Google Fonts.

La geometría transitoria continúa en preview DOM imperativa; no se ha añadido estado React por frame durante drag/resize.
El script reproducible es [measure-interactions.mjs](./measure-interactions.mjs).

## Checks

- Tests focalizados + boundary i18n: 35/35 PASS.
- Smoke E2E oficial: PASS (`empty-state`, `create-profile`, `active-profile`).
- Build frontend: PASS.
- Lint focalizado de componentes/tests nuevos: PASS.
- `git diff --check`: PASS.
- Suite frontend: 251 archivos, 1721/1721 PASS.
- Lint de `OverlayStudioV3.tsx`: una infracción preexistente `react-hooks/set-state-in-effect`; reproducida sobre el archivo de la base en la línea 89.

## Checklist manual de Isaac

- [ ] Confirmar jerarquía y alineación de cabecera dentro del shell real.
- [ ] Revisar wide, medium y compact sin scroll horizontal.
- [ ] Seleccionar un widget, moverlo y redimensionarlo con los ocho handles.
- [ ] Cancelar move y resize con Escape.
- [ ] Probar zoom, teclado, action bar y Browser View.
- [ ] Cambiar Mock/Live con telemetría concurrente disponible/no disponible.
- [ ] Abrir/cerrar drawers y validar foco en compact.
- [ ] Validar que ningún baseline Crystal fue reemplazado.
