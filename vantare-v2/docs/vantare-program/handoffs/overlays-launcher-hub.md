# Handoff vivo — Overlay Studio, Launcher y Hub

## Autoridad y lectura

- `docs/vantare-program/README.md` y `product-contract.md`.
- Overlay: ADR 0003, `docs/overlays-studio/`, proyecto Linear y sus dos HTML.
- Crystal: `docs/overlay-glassmorphism-pro.html`, solo secciones 01–16.
- Launcher: `docs/launcher-v3-architecture.md`, su plan vigente y Linear.
- Hub: código actual y characterization; los roadmaps históricos no son spec.

## Estado

- Overlay: el Workshop y sus barandillas fueron promovidos a Nightly mediante
  PR #162; continúa excluido físicamente de Stable. Los arreglos de Studio de
  PR #187, el gate visual de PR #193 y Standings/Relative/Delta Redline de PR
  #191 están también en Nightly. Pedals Redline se entrega en PR draft #195 y
  completa la cobertura visual de los cuatro widgets insignia. El flaky de CI
  ISA-311 quedó corregido y promovido mediante PR #200 a `nightly@54f267b`.
- Decisión ISA-315: objetivo 2026-08-31 = Overlay Studio V1 estable en
  `testers`. No equivale a `master`, release pública ni suite completa. Existe
  una cohorte aproximada de 10 testers Windows 10/11 con respuesta el mismo
  día. Plan canónico:
  `docs/overlays-studio/overlay-studio-v1-commercial-launch-plan.md`.
- Venta controlada objetivo 2026-09-22..30: Overlay Studio V1 como producto
  principal y módulos no terminados etiquetados Beta/Preview. Depende de gates
  separados de raíz, Billing, artefactos y aprobación; no está autorizada por
  este handoff.
- Launcher: ISA-9 fue validada históricamente; integración real por auditar.
- Hub: sin issue activa.
- Base documental ISA-315 rebasada: `nightly@54f267b`.
- PR #198 está autorizado para promoción a `nightly`; `testers`, `master`,
  venta y release permanecen fuera del alcance. Las integraciones en `develop`
  son históricas.

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

- Overlay: revisar/rebasar PR #195, corregir ISA-311, congelar alcance el 14 de
  agosto y preparar RC0 Nightly para el 19 según el plan ISA-315. La promoción
  a Testers requiere issue y aprobación propias; no abrir otro reader LMU.
- Launcher: crear LAU-AUDIT antes de nuevas features.
- Hub: crear HUB-POLISH después de characterization visual.
- Checks: harness real, Playwright, transparencias, responsive, capturas,
  frontend test/build; no regenerar baselines para esconder fallos.

## Última actualización

2026-08-10, ISA-315 fija el objetivo Stable en Testers para Overlay Studio V1
y la ventana comercial controlada de septiembre. Esta decisión y el estado
superior prevalecen sobre los bloques históricos de OS-09 que siguen debajo.

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

### ISA-291 — autoría directa planificada y aprobada

- Rama: `vantareapp/isa-291-os-09g2-autoria-directa-sobre-codigo-productivo`.
  Worktree: `C:\Users\isaac\.codex\worktrees\isa291-direct-authoring\vantare-v2`.
  Base exacta: ISA-265 `54088b2e5ad25d9a897cb89187ee9684b75c645f`.
- Decisión: editar el TSX/CSS productivo y observarlo por HMR en el mismo
  `WidgetVisualHost`. HTML es referencia visual, no fuente ni compilador. Se
  descartan DSL, scaffolder obligatorio, catálogo paralelo, generated barrel,
  `catalogPosition`, `import.meta.glob` y migración de los 41 diseños.
- Autoridades: spec
  `docs/superpowers/specs/2026-08-05-overlay-workshop-direct-code-authoring-design.md`
  y plan `docs/superpowers/plans/2026-08-05-overlay-workshop-direct-code-authoring.md`.
- Commits documentales: `41a3f02` (spec), `426f7c6` (plan), `2864846`,
  `57cf199` y `2b18e02` (endurecimiento adversarial).
- Revisión adversarial final: GO. El plan protege drift concurrente, cancelación,
  recovery, HMR sin reload, arranque parcial y cierre de procesos/puerto. El
  revisor no editó archivos ni Linear y no delegó.
- Estado real: planificación cerrada; implementación no iniciada; ningún cambio
  productivo, push, PR o promoción de canal derivado de ISA-291.
- Para continuar en otro chat: leer AGENTS, `docs/agent-workflow.md`, la spec y
  el plan; verificar rama/worktree limpios; comenzar por Task 0. El root
  orquestador asigna cortes, pero cada worker ejecuta inline sin subagentes.

#### Paquete activo de delegación entre chats

Este bloque es la autoridad operativa mientras ISA-291 esté en ejecución. Un
chat nuevo no necesita el historial de Codex si sigue este orden:

1. Abrir `C:\Users\isaac\.codex\worktrees\isa291-direct-authoring\vantare-v2`.
2. Leer `AGENTS.md`, `docs/agent-workflow.md`, la spec ISA-291 y el plan ISA-291.
3. Verificar rama `vantareapp/isa-291-os-09g2-autoria-directa-sobre-codigo-productivo`,
   `git status --short` vacío y que `HEAD` contiene `366308e`.
4. Consultar el ledger inferior y ejecutar únicamente la primera Task pendiente.
5. Actualizar este ledger después de cada worker/review/commit, antes de lanzar
   el siguiente corte.
6. Reflejar el mismo estado en Linear ISA-291. No promover a `nightly`.

Reglas de delegación:

- Solo el orquestador raíz crea workers.
- Un worker recibe una Task o microcorte acotado y tiene prohibido delegar,
  lanzar subagentes, cambiar arquitectura o ampliar archivos.
- El worker debe parar ante cambios ajenos, dependencia nueva, test no entendido,
  contradicción documental o imposibilidad de verificar.
- El orquestador revisa diff, tests, alcance y commit antes de continuar.
- La revisión adversarial final debe ser read-only y ejecutada por un agente
  distinto del implementador, también sin subagentes.

Formato obligatorio del encargo a un worker:

```text
Ejecuta exclusivamente Task <N> del plan ISA-291 en el worktree y rama canónicos.
Lee AGENTS, agent-workflow, spec y plan completos. No lances ni delegues a otros
agentes. Conserva el write set exacto, aplica TDD y comandos del plan, haz staging
por rutas y crea solo el commit indicado. Si aparece una stop condition, detente.
Entrega: rama/HEAD, archivos, tests/checks, omisiones, riesgos, commit y status.
No push, PR, Linear ni promoción de canal salvo instrucción del orquestador.
```

Ledger de ejecución vivo:

| Task | Contenido | Estado | Commit/evidencia | Próxima condición |
|---|---|---|---|---|
| 0 | Preflight reproducible | Completada | Node 24.14.1; pnpm 9.1.0; lock blob `8ecdce49`; sin commit de producto | Task 1 |
| 1 | Guard complementario del Host | Completada | `f9c6617`; Vitest focal 3/3 PASS; revisión de diff sin hallazgos | Task 2 |
| 2 | Invariantes del catálogo | Completada | `c0fff0d`; catálogo 11/11 y contratos acumulados 14/14 PASS | Task 3 |
| 3 | Mutaciones reversibles | Completada | `d2555a4`; Node 8/8 PASS; revisión raíz sin hallazgos | Task 4 |
| 4 | Smoke HMR real | Completada | `1a7bf80` + `a5ed874`; Node 15/15 PASS; smoke ejecutado sobre HEAD limpio | Task 5 |
| 4b | Correcciones P3 de revisión | Completada | `339e81a`; mensaje de guard, carve-out muerto y fragilidad del ancla documentada | Task 5 |
| 5 | Guía de autoría | Completada | `ca978d0`; guía con 4 recetas y contrato OS-09 corregido | Task 6 |
| 6 | Gates acumulativos | Completada (parcial) | suite 2181/2181, lint focal, `design-system:check`, build y compile-out PASS; smoke y protocolo visual omitidos por decisión de Isaac | Task 7 |
| 7 | Handoff y cierre | Completada | docs cerrados | Revisión manual de Isaac |
| 8 | Promoción a nightly | En revisión | Isaac validó al 100 % el 2026-08-05; rama de integración `os-09-n01` con merge `10be06d`; gates combinados 2217/2217, build y compile-out PASS | Merge del PR por Isaac |

Estado actual: implementación autorizada por Isaac el 2026-08-05. Task 0 pasó:
se instalaron dependencias ignoradas con `--frozen-lockfile`, el lockfile real de
la raíz Git conservó el blob `8ecdce49a78adc664e4796f388889fbd41a67c08` y
Vitest 4.1.9, Vite 8.0.16 y Playwright 1.60.0 están disponibles. Task 1 añadió
Workshop al guard de consumidores de `WidgetVisualHost`; la revisión raíz
repitió la caracterización focal con 3/3 PASS y confirmó un diff de un solo
archivo, sin renderer ni excepción paralelos. Task 2 extendió los invariantes a
todos los diseños y parejas realmente registrados: IDs únicos y exactamente un
default por pareja, sin tocar `official-designs.ts`. El test de catálogo pasó
11/11 y ambos contratos juntos 14/14. Task 3 añadió helpers reversibles con
restauración byte a byte, preservación de drift externo, evidencia de recovery,
guard de worktree y cleanup bajo cancelación; la revisión raíz repitió 8/8
tests y confirmó un commit de exactamente dos scripts. Próxima acción exacta:
Task 4.

## ISA-291 — autoría directa (cierre técnico)

1. **Decisión aprobada.** Overlay Workshop es un bucle de autoría sobre el TSX/CSS
   productivo. No hay conversión Workshop→app, catálogo paralelo, DSL ni
   scaffolder obligatorio. Autoridades:
   `docs/superpowers/specs/2026-08-05-overlay-workshop-direct-code-authoring-design.md`
   (spec), `docs/superpowers/plans/2026-08-05-overlay-workshop-direct-code-authoring.md`
   (plan) y `docs/overlays-studio/overlay-workshop-authoring-guide.md` (guía operativa).
2. **Rama y base.** `vantareapp/isa-291-os-09g2-autoria-directa-sobre-codigo-productivo`,
   base ISA-265 en `54088b2e5ad25d9a897cb89187ee9684b75c645f`, worktree
   `C:\Users\isaac\.codex\worktrees\isa291-direct-authoring\vantare-v2`. Commits de
   implementación: `f9c6617`, `c0fff0d`, `d2555a4`, `1a7bf80`, `a5ed874`, `339e81a`,
   `ca978d0`, más los commits documentales de cada corte.
3. **Arquitectura conservada.** `WidgetVisualHost` → `designSystemRegistry` /
   manifest → renderer productivo. Workshop es el cuarto consumidor del host,
   junto a Studio canvas, runtime y ProfilePreview. Ningún renderer nuevo, host
   alternativo ni segundo catálogo.
4. **Cómo abrir el bucle.** `corepack pnpm --dir frontend dev` y abrir
   `http://localhost:5173/workshop?widget=delta&system=vantare-original&design=delta-original-base&state=ready&surface=studio&variant=default&session=race&location=track&background=grid&scale=1&preset=1080p`.
   El smoke reversible es `corepack pnpm --dir frontend smoke:overlay-workshop-hmr`
   y sus tests unitarios `corepack pnpm --dir frontend test:overlay-workshop-hmr`.
5. **Qué demostró cada gate.** El guard de caracterización bloquea que Workshop
   importe un renderer concreto o esquive el host, nombrando el archivo ofensor.
   Los invariantes de catálogo garantizan IDs únicos y exactamente un default por
   pareja widget/sistema registrada, sin tocar `official-designs.ts`. El smoke
   demuestra que un cambio de TSX y otro de CSS se aplican por HMR sin navegación
   ni reload, y que los bytes se restauran exactamente.
6. **Riesgos restantes.** (a) `TSX_ANCHOR` del smoke depende de dos líneas
   literales de `DeltaOriginal.tsx`; un reformateo lo rompe, aunque falla en seco
   y está documentado en la guía. (b) El smoke exige todo el subárbol `vantare-v2`
   limpio, no solo los dos archivos objetivo. (c) La suite completa emite un
   `AbortError` de teardown de happy-dom que no falla ningún test; es deuda
   heredada, ajena a este corte. (d) Ver el punto 6b: cuestión abierta sobre el
   assert de "sin reload" del smoke.

6b. **Cuestión abierta — el CSS recarga, no hace hot-update.** Verificación manual
   del 2026-08-05 sobre este worktree, con Vite en `localhost:5173` y Delta
   Original en `/workshop`: editar `vantare-original/tokens.css` **sí** aplica el
   cambio al instante sin reiniciar Vite (fondo `rgb(16,16,20)` → `rgb(120,0,180)`,
   y restauración byte a byte verificada por SHA-256), pero lo hace mediante una
   **recarga completa de documento**, no mediante hot-update de CSS. Evidencia: un
   centinela en `window` se perdió en las tres ediciones (un control sin editar
   nada demostró que el contexto persiste normalmente) y la consola registró
   cuatro ciclos `[vite] connecting… connected` sin ningún `[vite] css hot updated`.
   Causa probable: `tokens.css` entra por `@import` desde `src/index.css` y pasa
   por Tailwind v4, que regenera el grafo CSS completo.

   Esto **no invalida el bucle de autoría**, que es la propiedad que interesa: el
   cambio se ve sin reiniciar el servidor. Pero entra en conflicto aparente con
   `assertNoReload` del smoke, que muta ese mismo archivo y afirma verificar la
   ausencia de recarga. El smoke **no se ejecutó** en esta verificación y sus
   condiciones difieren (Chromium propio de Playwright, y el TSX mutado en vuelo
   durante la fase CSS). Acción pendiente para quien retome ISA-280: ejecutar
   `smoke:overlay-workshop-hmr` y resolver la discrepancia. Si el assert resulta
   ser demasiado estricto para este grafo CSS, relajarlo a "el cambio se aplica sin
   reiniciar el servidor" en lugar de debilitar la evidencia.
7. **Fuera de alcance de ISA-291.** Migración de los 41 diseños, canvas
   drag/resize, perfiles, persistencia, lectores LMU, Billing, Wails/SSE y
   baselines visuales. No se cambió ningún píxel ni ningún archivo de producto.
8. **Próxima acción exacta para un chat nuevo.** Isaac completó la verificación
   manual el 2026-08-05, validó ISA-291 al 100 % y autorizó la promoción. El
   trabajo vive ahora en la rama de integración
   `vantareapp/os-09-n01-promocion-overlay-workshop-a-nightly` (creada desde
   `origin/nightly` `fb2c355`, merge `--no-ff` en `10be06d`, sin conflictos), con
   PR abierto hacia `nightly` y **pendiente de que Isaac dé el merge**. Esa
   promoción mueve el Overlay Workshop completo: ISA-260–265 (la herramienta) más
   ISA-291 (sus barandillas y manual); los commits están apilados y no se pueden
   separar. Impacto para usuarios y testers: ninguno, el Workshop está excluido de
   Stable y el compile-out lo confirma. Tras el merge: ISA-280 (OS-09L, gate
   técnico final) y resolver la cuestión abierta del punto 6b.

## ISA-326 / OS-11 — superficie arbitraria y paridad Studio/Desktop/OBS

- **Estado al 2026-08-11:** issue creada e In Progress. Task 0 contractual
  completada en el commit documental de la rama; código de producto aún no
  modificado.
- **Rama/worktree:**
  `vantareapp/isa-326-os-11-superficie-arbitraria-y-paridad-de-resolucion` en
  `C:\tmp\vantare-isa326\vantare-v2`, desde
  `origin/nightly@8880a8800e07e2af21fe5ff37a714578bf8fcd00`.
- **Hallazgo raíz:** el selector actual solo altera el zoom calculado. Documento,
  validación, drag/resize, Desktop y OBS siguen ligados a 1920×1080 y mantienen
  fórmulas/orígenes distintos.
- **Decisión vigente:** `layoutViewport {width,height}` opcional y
  retrocompatible en V3; ausencia = 1920×1080. Unidades CSS/DIP. Transformación
  pura `contain` compartida, centrada y sin deformación. Cualquier resolución es
  válida; los presets solo son atajos.
- **Política entre proporciones:** sin reflow implícito. Si documento y salida no
  coinciden, se preserva la proporción con bandas transparentes. Un contrato de
  anclajes/reflow requerirá alcance separado.
- **Frontera preservada:** `WidgetVisualHost` y los renderizadores visuales no se
  modifican. El canvas conserva preview imperativa durante drag/resize.
- **Monitor:** `monitorIndex` está reservado en la base. Task 4 verificará si hay
  una API Wails nativa ya disponible; si no, se abrirá dependencia y el perfil
  seguirá aceptando dimensiones manuales arbitrarias.
- **Autoridades:** `docs/adr/0092-overlay-arbitrary-layout-viewport.md` y
  `docs/superpowers/plans/2026-08-11-overlay-arbitrary-viewport-parity.md`.

Ledger vivo:

| Task | Contenido | Estado | Evidencia | Próxima condición |
|---|---|---|---|---|
| 0 | ADR, microplan y expediente | Completada | Commit documental; diff check limpio | Task 1 |
| 1 | Contrato TS/Go + transformación pura | Completada | `5a98553` + `a9c2fc8`; TS 67/67, Go pkg y completo PASS; doble review PASS | Task 2 |
| 2 | Superficie editable en Studio | En ejecución; 2A/2B PASS | 2A `b873a82`/`7b24f09`; 2B `8249585`/`50e9b9e`/`5fc3809`; dobles reviews PASS | Microcorte 2C |
| 3 | Paridad Desktop/OBS | Pendiente | — | Task 2 y reviews PASS |
| 4 | Hub fluido + frontera monitor nativo | Pendiente | — | Task 3 y reviews PASS |
| 5 | Gates, evidencia y cierre | Pendiente | — | Tasks 1–4 PASS |

Evidencia Task 1:

- `layoutViewport` es opcional en storage V3; ausencia conserva 1920×1080 y
  `null` se rechaza igual en TS y Go.
- Límites compartidos: 32..16384 CSS/DIP. Recoverability usa la superficie
  resuelta; no modifica coordenadas legacy.
- Transformación pura `contain` con offsets centrados y mapeo forward/inverse;
  inputs inválidos fallan explícitamente en vez de producir `NaN`/infinito.
- Checks del worker: frontend focal 67/67, frontend completo 2480/2480,
  `go test ./pkg/config`, `go test ./...`, build, lint focal y diff-check PASS.
  El root repitió focal 67/67, Go pkg y diff-check con PASS.
- Review de especificación: PASS. Review de calidad tras correcciones: Ready to
  proceed, cero Critical/Important. Minor aceptado para evidencia acumulada:
  falta test del máximo exacto 16384; la comparación inclusiva fue inspeccionada.
- Ruido heredado: dos `AbortError` de teardown de happy-dom tras la suite, con
  exit 0 y todos los tests PASS.

Evidencia microcorte 2A:

- `document/layout-viewport` persiste el tamaño explícito sin mutar documento,
  comando ni metadata. El parser canónico valida siempre esta edición, también
  en producción.
- Una superficie inválida o que deje widgets irrecuperables falla de forma
  atómica con `StudioCommandError`; Store conserva el historial y publica el
  mensaje. Errores inesperados de permisos o commit se relanzan.
- Dirty, undo, redo y save están cubiertos; acceso lo trata como mutación layout
  documental sobre layouts persistidos.
- Commits: `b873a82` y corrección de spec `7b24f09`. Root repitió focal 66/66.
  Build PASS. Spec review PASS y quality review Ready, cero Critical/Important.
- Minors aceptados: los tests no hacen observable la deduplicación interna de
  permisos (layout hoy es incondicional) ni fuerzan un error inesperado desde
  `commitStudioCommand`; la implementación de ambos caminos fue inspeccionada.
- Task 2 se divide en 2A estado, 2B geometría pura y 2C canvas/controles para
  mantener write sets acotados y review entre cortes.

Evidencia microcorte 2B:

- Fit, clamp, snap, safe area, center, move y resize consumen `LayoutViewport`.
  Los aliases 1920×1080 quedan deprecados y solo como fallback transitorio de
  callers que 2C debe eliminar.
- Matriz TDD: 1280×720, 3440×1440, 5120×1440, 1000×1000 y bordes custom 1006px
  no alineados a la rejilla.
- Review detectó dos regresiones de borde antes de 2C: snap posterior al clamp
  podía perder recoverability en move y las guides de resize podían quedar en
  la posición previa al clamp. Corregidas en `50e9b9e` y `5fc3809` con cobertura
  X/Y y guías perpendiculares.
- `MINIMUM_VISIBLE` deriva ahora de la autoridad core. Preview drag/resize sigue
  imperativa y solo hace commit al terminar.
- Evidencia final: focal 73/73, build, lint focal y diff-check PASS. Spec review
  PASS y quality review Ready, sin Critical/Important/Minor nuevos.
