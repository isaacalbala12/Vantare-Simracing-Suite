# Handoff vivo — Overlay Studio, Launcher y Hub

## Autoridad y lectura

- `docs/vantare-program/README.md` y `product-contract.md`.
- Overlay: ADR 0003, `docs/overlays-studio/`, proyecto Linear y sus dos HTML.
- Crystal: `docs/overlay-glassmorphism-pro.html`, solo secciones 01–16.
- Launcher: `docs/launcher-v3-architecture.md`, su plan vigente y Linear.
- Hub: código actual y characterization; los roadmaps históricos no son spec.

## Estado

- Overlay: ISA-260 fija el contrato Workshop sobre `nightly@4981e6f`; ISA-261
  extrae sus fixtures neutrales en rama aislada, sin promoción. El catálogo actual es 19 tipos/41 diseños/22 Crystal;
  el gate HTML Crystal histórico 21/18 permanece separado. `engineer-radio-crystal`
  es oficial/productivo bajo contrato Engineer, no derivado del HTML clásico.
- Launcher: ISA-9 fue validada históricamente; integración real por auditar.
- Hub: sin issue activa.
- Base/rama/SHA de próximo trabajo: no fijados.
- Promoción nueva: ninguna; las integraciones en `develop` son históricas.

## Overlay Studio

Editor único. Canvas gestiona espacio; inspector/documento configuración;
renderers reciben ViewModels puros.

- multi-select y grupos persistentes sin anidación inicial;
- bloqueo por salida;
- borrador/snapshots de preview; Desktop/OBS cambian al guardar/aplicar;
- diseños oficiales inmutables y duplicables;
- tipo → sistema visual → diseño → configuración;
- Original/Crystal; Crystal gratuito con marca;
- perfiles por simulador con herencia;
- mocks explícitos; stale/missing seguros;
- Desktop puede compartir Studio; OBS puede ser independiente;
- HTML como contrato visual;
- 60 FPS si el hardware lo permite; 10 widgets sin degradación y estrés 20.

Autoridad: `layout-studio-v10.html` para shell/editor y
`docs/overlay-glassmorphism-pro.html` secciones 01–16 para Crystal. Se excluye
V2/reestilizados. El siguiente paso de telemetría es TC-07.

Riesgos:

- **P1:** confundir fondo del showcase con widget en paridad.
- **P1:** divergencia Studio/Desktop/OBS.
- **P2:** baselines obsoletos ocultando regresiones.
- **P2:** cambios locales del checkout `refactor`.

## Overlay Workshop y apertura correcta desde rama/worktree

Workshop tiene un MVP local dev-only en `/workshop`: reutiliza
`WidgetVisualViewport` y `WidgetVisualHost` productivos, con fixtures puros y
query reproducible. Su contrato y microplan están en
`docs/overlays-studio/os-09-overlay-workshop-contract.md`.
ISA-261 establece `frontend/src/overlay/authoring/fixtures/` como única
autoridad para escenarios deterministas; `overlay-harness/harness-fixtures.ts`
solo conserva el re-export temporal. El contrato histórico Crystal (21/18) y
el contrato adicional de Engineer Radio permanecen separados.

### Smoke real de la aplicación que se ha verificado

La ruta que se utilizó correctamente para probar la aplicación completa fue una
build local de producción y **no** `wails3 dev`. Debe ejecutarse desde la raíz
del checkout o worktree que se quiere validar.

1. Confirma primero la fuente que vas a compilar. No continúes desde una rama o
   worktree distinto al que se quiere probar:

   ```powershell
   git branch --show-current
   git rev-parse --short HEAD
   git status --short
   ```

2. Cierra cualquier binario anterior para no confundir la build nueva con una
   instancia antigua:

   ```powershell
   Get-Process vantare -ErrorAction SilentlyContinue | Stop-Process -Force
   ```

3. Indica el `.env.local` autorizado. En el checkout habitual será
   `frontend\.env.local`. Un worktree limpio normalmente no contiene ese archivo
   porque está ignorado por Git; en ese caso apunta `$envFilePath` al archivo
   local autorizado, sin copiarlo al repo, imprimirlo ni mostrar sus valores:

   ```powershell
   $envFilePath = Join-Path $PWD 'frontend\.env.local'
   if (-not (Test-Path -LiteralPath $envFilePath)) {
     throw 'Set $envFilePath to the authorised local frontend/.env.local'
   }

   foreach ($line in Get-Content -LiteralPath $envFilePath) {
     if ($line -notmatch '^\s*(VITE_SUPABASE_URL|VITE_SUPABASE_ANON_KEY)\s*=') {
       continue
     }
     $parts = $line -split '=', 2
     $name = $parts[0].Trim()
     $value = $parts[1].Trim()
     Set-Item -Path "Env:$name" -Value $value
     if ($name -eq 'VITE_SUPABASE_URL') {
       $env:VANTARE_SUPABASE_URL = $value
     }
     if ($name -eq 'VITE_SUPABASE_ANON_KEY') {
       $env:VANTARE_SUPABASE_ANON_KEY = $value
     }
   }

   if (-not $env:VITE_SUPABASE_URL -or
       -not $env:VITE_SUPABASE_ANON_KEY -or
       -not $env:VANTARE_SUPABASE_URL -or
       -not $env:VANTARE_SUPABASE_ANON_KEY) {
     throw 'Missing public Supabase configuration'
   }
   ```

   Es necesario cargar ambos pares: Vite usa `VITE_SUPABASE_*` y el backend Go
   necesita `VANTARE_SUPABASE_*`. Cargar solo uno deja media aplicación sin
   configurar.

4. Compila el frontend, genera la configuración temporal del backend, construye
   el ejecutable y elimina siempre el archivo generado:

   ```powershell
   corepack pnpm --dir frontend build

   powershell -NoProfile -ExecutionPolicy Bypass -File `
     .\tools\generate_supabase_config.ps1 `
     -OutFile .\cmd\vantare\supabase_build.go

   try {
     go build -tags production -trimpath -buildvcs=false `
       -ldflags "-w -s -H windowsgui -X main.version=v$(Get-Content VERSION)" `
       -o .\bin\vantare.exe .\cmd\vantare
   } finally {
     Remove-Item .\cmd\vantare\supabase_build.go -ErrorAction SilentlyContinue
   }
   ```

   `cmd/vantare/supabase_build.go` contiene configuración generada: está
   ignorado por Git, no se abre, no se imprime y nunca se commitea.

5. Abre exclusivamente el ejecutable recién construido:

   ```powershell
   Start-Process -FilePath .\bin\vantare.exe -WorkingDirectory .\bin
   ```

   No abras `vantare.exe` desde la raíz, `build\bin`, un portable antiguo ni una
   build de otro worktree.

6. Smoke mínimo: la app abre; la sesión y el acceso se resuelven; Hub carga; y
   Overlay Studio abre. Registra la rama y SHA probados. Si aparece
   «Configuración incompleta», la build/backend no recibió la configuración
   pública de Supabase o se abrió un binario stale: no es un problema de la
   cuenta ni de su licencia.

### Cuándo usar Wails dev

`powershell -NoProfile -ExecutionPolicy Bypass -File
.\tools\start-wails-dev.ps1` queda como alternativa para depuración interactiva
con HMR. No sustituye al smoke anterior y su resultado no demuestra que
`bin\vantare.exe` se haya construido correctamente.

Autoridades complementarias: `docs/release-beta-operations-runbook.md`
(**Opción A2: build rápida de smoke local, no publicable**; no distribuye
installer, zip ni release) y `docs/tester-build-instructions.md`.

## Launcher

MoTeC i2 Standard 1.1; fijados/recientes/no instaladas/catálogo; ejecutables,
shortcuts, apps Windows y Steam; perfiles con apps/módulos/esperas; continuar o
abortar ante fallo; cerrar solo procesos iniciados por Vantare; perfil LMU
externo opt-in; autostart una vez; módulos con estado; estadísticas locales;
catálogo firmado/cacheado.

Debe auditarse qué commits están realmente integrados antes de nuevo trabajo.

## Hub

Conservar estructura. Solo consistencia visual, estados reales, responsive,
accesibilidad y rendimiento. El selector superior abre módulos, apps, perfiles
y recientes.

## Issues y siguiente acción

- Overlay: seguir su proyecto y TC-07; no abrir otro reader.
- Launcher: crear LAU-AUDIT antes de nuevas features.
- Hub: crear HUB-POLISH después de characterization visual.
- Checks: harness real, Playwright, transparencias, responsive, capturas,
  frontend test/build; no regenerar baselines para esconder fallos.

## Última actualización

2026-08-04, ISA-263, controles efímeros y comparación de superficies del Workshop; no promocionado.

### ISA-262 — usar el Workshop local

- Desde este worktree, instalar dependencias desde el lockfile si faltan y abrir
  `corepack pnpm --dir frontend dev`. La URL reproducible es
  `http://localhost:5173/workshop?widget=delta&system=vantare-crystal&design=delta-crystal-simple&state=ready&surface=studio&variant=default`.
- Los parámetros `widget`, `system`, `design`, `state`, `surface` y `variant`
  se validan fail-closed: una combinación inválida muestra un error y no escoge
  otro diseño. Cambiar los selectores reescribe la URL sin persistir nada.
- No usar esta ruta como preview de licencia, Wails, LMU o perfiles. Vite la
  elimina del build productivo: `main.tsx` no importa estáticamente authoring y
  el módulo sólo se carga con `import.meta.env.DEV`.
- El stage (`data-overlay-workshop-stage`) es chrome de autoría. Para alpha,
  bounds, overflow y paridad se inspecciona el root real
  (`data-overlay-workshop-widget-root`), que contiene el mismo Host/Viewport
  que producción. ISA-263 añade controles y comparativas, no debe duplicar el
  renderer.
- Evidencia ISA-262: Vitest focal 4 archivos / 15 pruebas, lint focal, build
  productivo sin sentinels Workshop, `design-system:check` y Playwright para
  Workshop válido/inválido y Hub sin `console`/`page errors`. La prueba de boot
  ejecuta el script real con `body` ausente, espera un solo listener de
  `DOMContentLoaded` y cubre Hub. Input Telemetry se siembra después del render
  en `useLayoutEffect`, con cleanup por widget; StrictMode preserva historias de
  otras instancias y no duplica la fixture. HMR CSS se aplicó y revirtió sin
  reiniciar el Workshop.

### ISA-263 — controles de autoría

- La URL dev admite además `session`, `location`, `background`, `scale`,
  `preset`, `width`, `height` y `compare`; todos se validan fail-closed y se
  serializan de forma reproducible. `background` solo cambia el stage de CSS:
  nunca entra en el Host, renderer, documento ni crop del widget.
- Los presets 720p, 1080p y 1440p declaran dimensiones de prueba; escala,
  dimensiones, fixture y comparación son efímeros. `Reset controls` restaura
  los defaults canónicos, no el deep-link inicial, sin persistir perfiles.
- Studio, Desktop, OBS y Harness usan la misma función de superficie y el mismo
  `WidgetVisualViewport` + `WidgetVisualHost`. OBS no recibe etiqueta ni chrome
  técnico dentro de su superficie. El root capturable sigue siendo
  `data-overlay-workshop-widget-root`; el stage sigue separado.
- Verificación de cierre ISA-263: Chrome/Playwright cubre deep-link válido e
  inválido, todos los fondos, Studio/Desktop/OBS/Harness, comparación,
  teclado/foco, reset, presets, dimensiones y viewports 1280x720, medio y
  compacto. El documento no produce overflow horizontal; el stage puede hacer
  scroll local para alojar una previsualización grande en compacto. Cero errores
  de consola, página o red relevantes.
- El bootstrap de `/workshop` evita ya cargar Wails: `main.tsx` carga el runtime
  normal dinámicamente desde `AppShell.tsx`. Esto evita la antigua petición
  fallida a `wails/custom.js`; no cambia el runtime normal. HMR CSS se aplicó y
  revirtió sin reiniciar la ruta.
- Las dimensiones y escala se editan como borradores locales: una pareja de
  dimensiones solo entra en URL/root cuando ambas son válidas; una escala
  válida entre 0.25 y 2 conserva valores como `0.3`. Ningún input incompleto o
  fuera de rango escribe una URL no reproducible.
- Evidencia focal final: 6 archivos/29 Vitest PASS, ESLint directo de bootstrap
  y authoring PASS, `design-system:check` PASS, build productivo PASS y
  compile-out sin sentinel `overlay-workshop`, `Overlay Workshop` o `DEV ONLY`
  en los assets. El lint global sigue registrando 30 errores/2 warnings
  heredados fuera del write set.

### ISA-265 — protocolo visual aislado

- Ejecutar `corepack pnpm --dir frontend visual:overlay-workshop -- --widget=delta --system=vantare-crystal --design=delta-crystal-simple --surface=all --viewport=1280x720`. Genera evidencia temporal para cuatro superficies y cuatro escenas sin baselines.
- Stage es chrome de autoría. El root validado es el renderer real: `[data-widget-renderer="<type>"]`, excepto Delta Bar Crystal `.vc-delta-bar`; no usar `data-overlay-workshop-widget-root` como crop.
- Se validan cardinalidad, font readiness, console/page errors, bounds, client/scroll, overflow declarado, alpha, guard y provenance. `root.png` es captura transparente del renderer contractual: su SHA-256 debe coincidir entre las cuatro escenas de cada superficie; si difiere, todos los escenarios de esa superficie quedan `sceneContaminated=true` y fallan. El reporte exige SHA Git real y registra `dirty`; los artefactos están bajo `frontend/.tmp/overlay-workshop-visual-protocol/` y no se versionan.
- Única protrusión: `delta-crystal-simple`, Y ≤13px por su badge compacto; todo exceso adicional falla. El runner imprime progreso, escribe checkpoint y cierra navegador/Vite en `finally`.
- El decode PNG canónico por CDP tiene un coste total aproximado de 5–8 min para la suite 4×4; no se alteran timeouts, helper Crystal, baselines ni umbrales para acortarlo.
- Crystal report-only es un gate independiente: la ejecución limitada a 90s llegó a 7 diseños PASS sin terminar el manifiesto. Nunca tratarla como aprobación total ni tocar baselines; resolver duración en otra issue.
