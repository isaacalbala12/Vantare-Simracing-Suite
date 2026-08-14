# Spec: escala visual proporcional de escritorio (1080p 16:9 a 32:9 4K)

Estado: fase Specify, decisiones cerradas con Isaac el 2026-08-14
Issue: sin Linear (decisión explícita de Isaac); rama
`vantareapp/ui-resp-escala-proporcional-1080-4k`
Base: `origin/nightly@03fce9cd` (ISA-344, TM-01)
Worktree: `C:/Users/isaac/Desktop/Vantare-Overlays/worktrees/ui-resp-escala-proporcional`

## Objetivo

La UI debe ser completamente responsive en todo tipo de resoluciones de
escritorio, desde 16:9 1080p hasta 32:9 4K. Responsive significa aquí que la
interfaz **se agranda** con la resolución: la fuente, los objetos, los
espaciados y los widgets crecen juntos; no es solo que el layout "responda
bien".

- `1920x1080` (16:9) es la referencia de diseño `1x`.
- `2560x1440` (QHD) se aproxima a `1.333x`.
- `3840x2160` (4K 16:9) alcanza `2x`.
- En ultrawide (21:9 y 32:9) la escena crece por altura y aprovecha el ancho
  extra hasta un frame máximo `21:9`; en 32:9 el frame queda centrado y el
  fondo continúa cubriendo toda la pantalla.

## Trabajo previo descartado

Las ramas ISA-337/ISA-343 (`worktrees/isa337-responsive-spec` y
`worktrees/isa343-responsive-foundation`) contienen una spec, un plan y una
implementación parcial (T0-T5) de UI responsive. Isaac las descartó por
incorrectas: este trabajo parte de cero desde `origin/nightly`. No se reutiliza
su código ni sus baselines visuales. Sus documentos se conservan como
referencia histórica en sus ramas, sin tocarlos.

## Decisiones cerradas

1. **Superficies incluidas**: Hub (app de escritorio) y Overlay (Desktop y
   OBS). Ambas usan el mismo principio: crecer con la resolución.
2. **Overlay ultrawide**: escala por altura + ancho extra hasta `21:9` máximo,
   incluso en 32:9. El espacio sobrante en 32:9 queda como fondo libre
   (transparente) centrado; ningún control se desplaza a los extremos.
3. **Widgets en ultrawide**: se reposicionan para repartirse el ancho extra y
   su tamaño escala por altura. Excepción: los widgets de ancho completo
   (p.ej. Broadcast Tower que ocupa todo el layout) se estiran hasta el ancho
   del frame.
4. **Base de diseño**: `1920x1080` fija (el `layoutViewport` del documento de
   Overlay Studio se conserva como lienzo de autoría; el runtime escala desde
   la base fija).
5. **Hub**: zoom global uniforme mediante `CSS zoom` en `html.hub`
   (soportado por WebView2/Chromium), factor calculado por altura de ventana
   CSS: `factor = clamp(innerHeight / 1080, 1, 2.5)`. Escala todo, incluidos
   los valores `px` fijos, sin recorrer componentes ni convertir medidas.
6. **Studio V3**: recibe el zoom global del Hub; sus coordenadas internas
   (canvas, drag/resize, inspector) no cambian, solo su presentación.
7. **OBS**: mismo motor de escalado que el overlay Desktop; el lienzo OBS es
   solo otro viewport de salida.
8. **Widgets**: todos los tipos y las tres familias (original, crystal,
   endurance), incluidos Engineer/radio y subtítulos.
9. **Validación**: matriz de invariantes en todas las resoluciones + capturas
   ampliadas (1080p, QHD, 21:9, 4K, 32:9) para revisión humana.
10. **Flujo**: SDD sin Linear: spec -> rama -> código con TDD por microcortes.

## Alcance

Incluye:

- Hub completo: shell, topbar, navegación, dock, banners, Dashboard, Launcher,
  Calendar, Settings, diagnósticos, Engineer, Strategy Planner, Telemetry,
  Roadmap, Testing Center (si el canal lo habilita), auth, paywall,
  onboarding, diálogos, menús y toasts.
- Overlay runtime Desktop y OBS: transform de escena, distribución de widgets
  en ultrawide, estirado de full-width.
- Overlay Studio V3 (dentro del Hub): chrome escala con el zoom global; la
  geometría del documento y el drag/resize imperativo no cambian.
- Matriz de pruebas y runner visual de invariantes + capturas.

Excluye:

- Cambiar la geometría del documento de Overlay Studio, el `layoutViewport`
  guardado en perfiles, posiciones de widgets o contratos de widget.
- Renderizadores de widgets, DSLs, scaffolds o pipelines paralelos.
- Workshop como superficie de autoría nueva (se beneficia del motor, no se
  rediseña).
- Móvil/táctil, backend, persistencia, licencias, nuevas funciones.
- Rediseño general, librería de componentes o sistema de breakpoints propio.

## Modelo de escala del Overlay

### Transform de la escena

Dado un output de salida `(W, H)` y la base fija `1920x1080`:

1. Escala por altura: `s = H / 1080`.
2. Ancho del frame funcional: `frameW = min(W, H * 21/9)` (máximo 21:9).
3. `offsetX = (W - frameW) / 2`, `offsetY = (H - 1080*s) / 2` (centrado;
   en la práctica `offsetY` es 0 porque la escala deriva de la altura).
4. El layout de diseño se ensancha al ancho efectivo
   `layoutWEff = frameW / s` para repartir widgets; la altura efectiva sigue
   siendo `1080`.

Resultados esperados:

| Output | s | frameW | layoutWEff | offsetX |
| --- | --- | --- | --- | --- |
| 1920x1080 | 1 | 1920 | 1920 | 0 |
| 2560x1440 | 1.333 | 3360 | 2520 | 0 |
| 3440x1440 | 1.333 | 3360 | 2520 | 40 |
| 3840x2160 | 2 | 3840 | 1920 | 0 |
| 5120x1440 | 1.333 | 3360 | 2520 | 880 |
| 7680x2160 | 2 | 5040 | 2520 | 1320 |

En 16:9 el comportamiento es idéntico al transform `contain` actual: sin
regresión en 1080p ni 4K.

### Distribución de widgets en ultrawide

Cada widget con frame `(x, y, w, h)` en el layout de diseño se mapea al layout
efectivo ancho:

- `x' = min(x * (layoutWEff / 1920), layoutWEff - w)` (reparto proporcional,
  anclado al borde derecho si excede).
- `y' = y`.
- Si `w >= 1920` (widget full-width): `w' = layoutWEff` (estirar).
- Si no: `w' = w`, `h' = h` (tamaño por altura; la escala `s` lo aplica el
  transform de la escena).

Después el transform de escena `translate(offsetX, offsetY) scale(s)` hace
crecer todo con la altura: tipografía, objetos y espaciados internos.

### Superficies que consumen el modelo

- `RuntimeOverlaySurface` (Desktop y OBS runtime).
- `ObsOverlayStudioPreview` (preview del Studio dentro del Hub).
- `ObsOverlayApp`.
- Los tests de `layout-viewport` y los runners visuales existentes.

## Modelo de escala del Hub

- En `html.hub` se aplica `zoom` con
  `factor = clamp(innerHeight / 1080, 1, 2.5)`, recalculado en `resize` y con
  cleanup simétrico al desmontar el Hub.
- `documentElement` recibe la clase `hub` además de `body` (ya existe el
  patrón en harnesses) para que la regla de zoom no toque overlay runtime ni
  canvas.
- El overlay runtime (`html.desktop-overlay`, ventana transparente sobre el
  juego) no recibe zoom: escala con su propio transform de escena.
- Media queries y layout fluido existentes siguen respondiendo al viewport;
  el zoom agranda la presentación sin cambiar la lógica de breakpoints.
- El Studio V3 dentro del Hub escala visualmente; sus coordenadas y la paridad
  de capturas Studio/Desktop/OBS se comprueban en la matriz.

## Estructura del proyecto

```text
frontend/src/overlay/core/layout-viewport.ts      transform de escena (extiende)
frontend/src/overlay/core/responsive-layout.ts    distribución de widgets (nuevo)
frontend/src/overlay/runtime/RuntimeOverlaySurface.tsx
frontend/src/overlay/runtime/RuntimeWidgetFrame.tsx
frontend/src/overlay/ObsOverlayStudioPreview.tsx
frontend/src/hub/HubApp.tsx                        zoom global del Hub
frontend/src/hub/pages/HubApp.tsx                  zoom global del Hub
frontend/src/index.css                             regla zoom html.hub (si aplica)
frontend/scripts/ui-escala-visual.mjs              runner visual (nuevo)
docs/superpowers/specs/2026-08-14-ui-escala-proporcional-1080-a-32-9-4k.md
```

Los tests permanecen junto a cada módulo. No se convierte `index.css` en un
archivo de excepciones.

## Estrategia de implementación

Cortes verticales pequeños con TDD (RED -> GREEN -> refactor) y evidencia en
cada uno:

1. **C1: modelo puro de escala overlay** — `layout-viewport` + `responsive-layout`
   (funciones puras, tests table-driven de la matriz completa).
2. **C2: runtime Desktop/OBS** — `RuntimeOverlaySurface` y `RuntimeWidgetFrame`
   consumen el modelo; tests de integración y regresión en 16:9.
3. **C3: preview Studio y OBS** — `ObsOverlayStudioPreview`/`ObsOverlayApp`
   usan el mismo transform.
4. **C4: zoom global del Hub** — `HubApp` aplica `zoom` en `html.hub` con
   factor por altura, cleanup simétrico, tests de factor y de no-afectación
   al overlay runtime.
5. **C5: evidencia visual** — runner Playwright de invariantes en toda la
   matriz + capturas ampliadas para revisión humana.

Cada corte: máximo ~5 archivos productivos, tests antes/junto al cambio,
`pnpm --dir frontend test`, `build`, `lint` focal y `git diff --check`.

## Matriz de validación

| Viewport CSS | Propósito |
| --- | --- |
| 1280x720 | compacta 16:9 |
| 1440x900 | referencia existente |
| 1920x1080 | base 1x (obligatoria) |
| 2560x1440 | QHD (captura) |
| 2560x1080 | 21:9 bajo |
| 3440x1440 | 21:9 (obligatoria) |
| 3840x2160 | 4K (captura) |
| 5120x1440 | 32:9 (captura) |
| 7680x2160 | 32:9 4K |
| 2304x864 | arbitrario no preset |

Invariantes en cada destino:

- `scrollWidth <= clientWidth` en documento, body, root, shell y contenedores
  con overflow-x hidden/clip.
- Widgets del overlay dentro del frame funcional (`frameW x H`) sin recortes
  del contenido en los bordes del frame.
- En 16:9 el overlay produce el mismo transform que hoy (sin regresión).
- Hub: ningún control fuera del viewport ni scroll horizontal global; zoom
  esperado en 1080p=1, QHD≈1.333, 4K=2.
- Overlay runtime sin zoom (factor 1) cuando `html.desktop-overlay`.
- Cero errores de consola relevantes.
- Capturas ampliadas (1080p, QHD, 21:9, 4K, 32:9) revisadas por Isaac.

## Criterios de éxito

1. En 1920x1080 la UI se ve como hoy (sin regresión visual).
2. En 3840x2160 todo crece a 2x: tipografía, objetos, espaciados.
3. En 3440x1440 la escena del overlay llena el frame 21:9 y el texto crece
   1.333x; Broadcast Tower ocupa el ancho del frame.
4. En 5120x1440 el frame 21:9 queda centrado y nada se desplaza a los
   extremos; el fondo cubre la pantalla.
5. El Hub escala por zoom uniforme con factor por altura (tope 2.5).
6. OBS y Desktop producen el mismo resultado para el mismo viewport.
7. Studio conserva coordenadas internas y paridad de capturas.
8. Todos los widget types y familias pasan la matriz sin recortes.
9. Tests, build, lint y runner visual pasan con evidencia registrada.
10. Sin dependencias nuevas, sin renderers paralelos, sin viewport manager.

## Comandos

Desde `frontend`:

```powershell
corepack pnpm test          # vitest
corepack pnpm build         # tsc -b && vite build
corepack pnpm lint          # eslint
corepack pnpm visual:overlay-studio  # gates visuales existentes afectados
git diff --check
```

## Límites operativos

### Siempre hacer

- partir de `origin/nightly` en rama/worktree de issue (hecho);
- TDD por microcorte, tests antes o junto al cambio;
- comprobar la matriz completa con invariantes;
- conservar paridad Studio/Desktop/OBS;
- revisar el diff completo y registrar evidencia en `docs/current-plan.md`.

### Preguntar antes

- cambiar la base 1920x1080, el frame 21:9 o el tope de zoom 2.5;
- tocar el modelo de widgets (Wails/Studio) o la geometría de `layoutViewport`;
- añadir dependencias o configuración de build;
- promocionar a `nightly`/`testers`/`master`.

### Nunca hacer

- enumerar resoluciones en componentes (la escala es matemática, no un
  catálogo);
- crear un viewport manager, store responsive o design system paralelo;
- ocultar funcionalidad para evitar overflow;
- regenerar baselines para encubrir una regresión;
- reutilizar el código de las ramas descartadas ISA-337/ISA-343;
- mezclar con cambios ajenos del checkout principal.

## Riesgos y mitigaciones

- **Zoom CSS en Wails**: WebView2 es Chromium y soporta `zoom`; se verifica en
  el runner y manualmente en Windows.
- **Regresión 16:9**: los tests de `layout-viewport` existentes actúan como
  red; el transform en 16:9 debe ser idéntico al actual.
- **Widgets que se salen del frame en ultrawide**: el anclaje
  `min(x * k, layoutWEff - w)` garantiza que ningún widget cruce el borde.
- **Full-width estirado**: solo se estira cuando `w >= 1920`; cualquier otro
  widget conserva tamaño por altura.
- **Studio**: el zoom no cambia coordenadas; la paridad se comprueba con el
  runner visual existente.
