# ISA-92 - Paridad 1:1 del editor Overlay Studio

Fecha: 2026-07-14
Rama: `vantareapp/isa-92-os-02-paridad-11-del-editor-overlay-studio`
Base: `0a797bf720c098a52e91883ed0ddddda0c9fdd15`

## Estado

**RECHAZADA por Isaac el 2026-07-15 y reabierta en `In Progress`.** La primera entrega no demostró paridad global: usó un harness desnudo, posicionó el root dentro de un shell teórico y comparó estados no equivalentes. Las métricas y capturas de esa pasada se conservan como histórico, pero no pueden reutilizarse como prueba de aceptación.

La segunda pasada usa el HTML completo como autoridad, monta `V52Shell` + `StudioRoute` reales sin reposicionar el root y compara un perfil poblado con widget seleccionado, rail e inspector activos. La matriz vigente está en [strict-visual-matrix.md](./strict-visual-matrix.md).

## Segunda pasada estricta — evidencia vigente

- Captura principal real: [strict-real-wide.png](./artifacts/strict-real-wide.png).
- Autoridad capturada: [strict-reference.png](./artifacts/strict-reference.png).
- Comparativas: [side-by-side](./artifacts/strict-side-by-side.png), [overlay 50/50](./artifacts/strict-overlay.png) y [diff bruto sin máscaras](./artifacts/strict-diff-unmasked.png).
- Responsive: [medium](./artifacts/strict-real-medium.png), [compact](./artifacts/strict-real-compact.png) y [drawer inspector compact](./artifacts/strict-real-compact-inspector.png).
- Estados: [saved](./artifacts/strict-state-saved.png), [disabled](./artifacts/strict-state-disabled.png), [solid](./artifacts/strict-state-solid.png) y [sin selección](./artifacts/strict-state-no-selection.png).
- Geometría y bounding boxes: [strict-route-geometry.json](./strict-route-geometry.json).
- Métricas sin máscaras amplias: [strict-parity-metrics.json](./strict-parity-metrics.json).
- Interacción Playwright sobre ruta real: [strict-interaction-smoke.json](./strict-interaction-smoke.json), todos los checks PASS y cero errores de consola.

El delta bruto completo es `50.140%` sin máscaras y no se presenta como gate superado: incluye la foto del HTML frente al modo grid real autorizado y el shell ficticio frente al V52 real. Los deltas regionales unmasked quedan entre `2.258%` y `12.072%`; se publican como evidencia adversarial y no se ocultan. Geometría interna wide (X, anchuras, gaps, toolbar y footer) y tokens glass sí coinciden exactamente. El único delta geométrico global es `+2px` vertical / `-2px` de alto, causado por la topbar V52 real de `58px` frente a los `56px` del shell ficticio.

No se ha regenerado ningún baseline. ISA-92 permanece `In Progress` y PR #10 sigue draft hasta validación visual explícita de Isaac.

La revisión independiente detectó inicialmente que la captura medium se tomaba durante los `160ms` de transición del drawer y que el foco compact había desplazado la evidencia. El capturador ahora espera `220ms`, restablece scroll real a origen y verifica el drawer medium completo en `x=936`, `w=320`, dentro del content box `x=84..1256`. Las capturas enlazadas ya son las recapturas corregidas.

La excepción mínima de ownership autorizada por Isaac añade únicamente tres claves de cabecera/toolbar a los cuatro diccionarios `studio-v3`. El boundary i18n y la paridad de claves quedan verdes; no se han añadido otros textos ni módulos.

## Evidencia histórica rechazada

- Contexto real wide: contenido del shell en `x=84`, cabecera Studio en `y=76`, grid en `y=172.5`.
- Columnas wide: lista `240 px`, gap `16 px`, canvas `1218 px`, gap `16 px`, inspector `320 px`.
- Toolbar `36 px`, footer `44 px`, radios `12 px` y overflow horizontal `0 px`.
- Medium: lista `240 px`, canvas flexible e inspector drawer `320 px`.
- Compact: canvas completo y drawers laterales de `320 px`, sin overflow de página.
- Métricas completas: [geometry-metrics.json](./geometry-metrics.json).
- El bloque `authorityAndGates` registra autoridad, valor real, tolerancia, delta máximo y `pass` para wide/medium/compact.

### Auditoría cuantitativa anterior — no válida como gate

Captura Chrome headless, DPR 1, threshold máximo por canal `12`. Se esperaron las fuentes reales Inter, Rajdhani y Space Mono. Las máscaras se limitan a topbar y contenido real variable: canvas, filas de widgets, contenido del inspector, nombre de perfil, contador, previews del rail y valores de fuente/session/location. Bordes, paneles y controles permanecen comparados.

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

- Tests focalizados + boundary i18n: 59/59 PASS.
- Smoke E2E oficial: PASS (`empty-state`, `create-profile`, `active-profile`).
- Build frontend: PASS.
- Lint focalizado de componentes, harness y scripts nuevos: PASS.
- `git diff --check`: PASS.
- Suite frontend completa con `--maxWorkers=4`: 251 archivos, 1721/1721 PASS. Dos intentos con concurrencia por defecto agotaron el `waitFor` de tests distintos; ambos tests pasan aislados, sin cambios en tests ni timeouts.
- Playwright estricto sobre ruta real: 26/26 checks PASS, cero errores de consola.
- Captura wide/medium/compact y estados: PASS, cero errores de consola.
- `visual:overlay-studio`: la ejecución canónica previa conserva los tres casos Original a `0.000%` y el fallo heredado `delta-crystal-ready-studio` (`99.963% > 0.500%`). En la repetición final, el Chromium fijado por Playwright ya no estaba disponible en el entorno; la ejecución de diagnóstico con Chrome instalado se detuvo en `delta-original-ready-studio` (`4.609% > 0.500%`), una diferencia de renderer sobre un fixture fuera del cambio Studio. No se ejecutó `--update` ni se modificó ningún baseline.

## Checklist manual de Isaac

- [ ] Confirmar jerarquía y alineación de cabecera dentro del shell real.
- [ ] Revisar wide, medium y compact sin scroll horizontal.
- [ ] Seleccionar un widget, moverlo y redimensionarlo con los ocho handles.
- [ ] Cancelar move y resize con Escape.
- [ ] Probar zoom, teclado, action bar y Browser View.
- [ ] Cambiar Mock/Live con telemetría concurrente disponible/no disponible.
- [ ] Abrir/cerrar drawers y validar foco en compact.
- [ ] Validar que ningún baseline Crystal fue reemplazado.
