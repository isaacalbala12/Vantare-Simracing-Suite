# Handoff vivo — Overlay Studio, Launcher y Hub

## Autoridad y lectura

- `docs/vantare-program/README.md` y `product-contract.md`.
- Overlay: ADR 0003, `docs/overlays-studio/`, proyecto Linear y sus dos HTML.
- Crystal: `docs/overlay-glassmorphism-pro.html`, solo secciones 01–16.
- Launcher: `docs/launcher-v3-architecture.md`, su plan vigente y Linear.
- Hub: código actual y characterization; los roadmaps históricos no son spec.

## Estado

- ISA-363 corrige en rama aislada el parpadeo de widgets durante el relevo
  `stale -> live`: Desktop y OBS conservan el último snapshot como `stale`
  hasta recibir la proyección de la nueva revisión, sin publicar el frame
  `disconnected` intermedio. Arranque sin datos, estados reales de conexión o
  parada y proyecciones bloqueadas mantienen el cierre seguro. TDD RED/GREEN,
  focal 4/4, frontend 375 archivos/2736 tests, build, ESLint focal y diff-check
  PASS; el lint global conserva 49 errores y 2 warnings heredados fuera del
  cambio. Rama desde `origin/nightly@3eb5dd7b`, sin promoción ni release.
- ISA-364 está promovida a `nightly` y corrige el listado vacío de
  `Mis perfiles`: los documentos guardados como V3 puro se listan mediante el
  migrador canónico, mientras el
  camino V0/V2 conserva su compatibilidad. El servicio no modifica perfiles ni
  incluye JSON de ajustes o inválidos. TDD RED confirmado; focales de listado
  y paquete `internal/app` PASS. Gates finales: `go test ./...`, frontend
  375/2734, build, `go vet ./internal/app`, fragmento y diff-check PASS; los
  `AbortError` de teardown frontend permanecen heredados y el proceso termina
  con exit 0. El CI final del PR #261, run `31894030661`, pasó topología,
  gates bloqueantes, build Wails y pasos informativos sobre `03a0205b`. La
  rama partió de `origin/nightly@3eb5dd7b`; implementación `f753c172` y merge
  squash del PR #261 en `nightly@22946e6f`, autorizada expresamente por Isaac.
  El gate posterior `31894845365` y el roadmap `31894845385` pasaron sobre el
  SHA integrado. ISA-366 registra la promoción; sin paso a `testers`/`master`
  ni release.
- Hub / ISA-358 está promovida a `nightly` mediante PR #245 y squash
  `2909ba73d907eee993fcdec866829973b1bb1474`: la versión/canal del hero procede del runtime, el
  calendario comparte un único estado y no pierde respuestas inmediatas, el
  carrusel usa el snapshot público generado desde Linear con procedencia
  visible y Novedades usa los manifiestos canónicos de release auto-descubiertos.
  Focales 46/46, suite frontend 371/2681, build, lint focal propio y diff-check
  pasan. El preview T3 abrió el servidor correcto pero no pudo producir
  snapshot ni evaluación; queda pendiente la comprobación visual manual. Los
  gates del PR, el gate posterior de Nightly `31817001802` y la regeneración
  del snapshot público `31817001849` pasaron. No hubo promoción a
  `testers`/`master` ni release.
- ISA-357 corrige localmente la batalla animada de Standings Redline: solo
  carrera, una pareja máxima y prioridad por cercanía a la fila del jugador,
  con desempate por intervalo y orden estable. El relevo entre parejas tampoco
  solapa una disolución anterior con la nueva caja. El code review corrigió la
  transición carrera→clasificación, la ausencia de la fila del jugador y la
  frescura de una secuencia rápida A→B→A. TDD focal 21/21, frontend 370
  archivos/2679 tests, build, ESLint focal, design-system 3/3, fragmento y
  diff-check PASS. Persisten dos `AbortError` heredados de teardown con exit 0.
  El Workshop respondió con Vite, pero snapshot y evaluación DOM de T3
  fallaron/agotaron timeout; el servidor temporal quedó cerrado y la inspección
  visual manual continúa pendiente.
  Rama aislada desde `origin/nightly@673283a2`, sincronizada finalmente con
  `nightly@2909ba73` en `a389f8d0`; implementación `71d6b360` y fix de review
  `cf83021a`. La PR #243 se integró por squash en `nightly@fe04a0af`; gates de
  PR y posteriores al merge PASS. Sin promoción a `testers`/`master` ni release.
- ISA-334 fue promovida a `nightly` mediante PR #224, merge squash
  `04c3ac3cabcc6cb8cc86617ba88e0676f5f802d7`:
  Broadcast Tower nace como franja horizontal a todo el ancho real del perfil,
  conserva 50 px de altura y expone solo resize este/oeste. Tests focales,
  suite frontend, lint focal, build y CI pasan. Queda pendiente la validación
  visual manual de Isaac; no hubo promoción a `testers` ni `master`.
- Overlay: el Workshop y sus barandillas fueron promovidos a Nightly mediante
  PR #162; continúa excluido físicamente de Stable. Los arreglos de Studio de
  PR #187, el gate visual de PR #193 y Standings/Relative/Delta Redline de PR
  #191 están también en Nightly. Pedals Redline se entrega en PR draft #195 y
  completa la cobertura visual de los cuatro widgets insignia. El flaky de CI
  ISA-311 quedó corregido y promovido mediante PR #200 a `nightly@54f267b`.
- Delta: ISA-347 está implementada y validada en rama aislada sobre
  `origin/nightly`; añade referencias reales personal/sesión/anterior, unicidad
  por layout y hotkey global configurable. El code review corrigió historial
  nativo, selección canónica legacy y concurrencia del hotkey en `46df1b2`. La
  rama incorporó `nightly@638b470` en `f0e40bd`; la PR #233 pasó los gates y se
  integró por squash en `nightly@5499008`, sin promoción a `testers`/`master` ni
  release.
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
- Hub: ISA-358 integrada en Nightly; ISA-360 registra la promoción y su
  evidencia exacta.
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

2026-08-14, ISA-335 corrige en Nightly el rechazo al guardar perfiles con
`vantare-endurance`. La causa era un desfase entre el catálogo frontend ya
promovido y las allowlists Go de persistencia/diseños. La revisión adversarial
eliminó la lista duplicada: ambos consumidores consultan ahora el mismo contrato
tipado. La regresión cubre sistema activo/predeterminado, `systemMemories`,
round-trip en disco y diseños de usuario; los IDs desconocidos siguen fallando
cerrados. Go focal y global, frontend 370/2661 y build pasan. Base inicial
`origin/nightly@8de4f511`; rama
`vantareapp/isa-335-os-bug-guardar-perfiles-rechaza-vantare-endurance-como`.
Fix y regresiones: `074dba6`; centralización revisada: `a4749e9`;
`design-system:check` 3/3 PASS. Isaac autorizó la promoción y el auto-merge
necesario ante integraciones concurrentes; ISA-345 conserva el registro. La PR
#223 se integró por squash en
`nightly@32e9b70907458874d79fd28c5a37ae97cccc436d`. El gate post-integración
`31762153097` pasó ruta, build frontend, Go, frontend, lint de cambios, visuales
y Windows/Wails; el snapshot `31762153118` pasó. El lint global conserva deuda
heredada advisory. Sin promoción a Testers/Master ni release.

2026-08-10, ISA-315 fija el objetivo Stable en Testers para Overlay Studio V1
y la ventana comercial controlada de septiembre. Esta decisión y el estado
superior prevalecen sobre los bloques históricos de OS-09 que siguen debajo.

### ISA-347 — Delta real, único y controlable por hotkey

- Rama/worktree:
  `vantareapp/isa-347-delta-referencias-reales-de-telemetria-instancia-unica-y`
  en `C:\tmp\vantare-isa347\vantare-v2`, desde
  `origin/nightly@7e4eac63fdc3a81278f8815d28e33c8a1293db4a`.
- La telemetría Delta mantiene tres referencias independientes y fail-closed:
  personal observado desde LMU cuando existe, mejor válida de la sesión y
  vuelta anterior válida. Ninguna referencia ausente hereda otra bajo una
  etiqueta falsa.
- Cada layout admite un solo widget `delta`. Catálogo, comandos Studio y
  validadores TS/Go aplican el mismo contrato; los layouts de sesión explícitos
  son alternativos y nunca se renderizan simultáneamente. Los Delta extra de un
  perfil histórico pasan a `preservedWidgets` con su configuración completa,
  de modo que no se renderizan ni se pierden.
- Hotkey `cycleDeltaReference`, configurable en Ajustes y por defecto
  `Ctrl+Shift+D`: Personal → Sesión → Anterior → Personal. Usa el gestor global
  existente, guarda el perfil activo y vuelve a publicar el documento runtime.
  La migración de AppSettings v2→v3 añade el atajo sin sustituir combinaciones
  ya configuradas.
- Evidencia: `go test ./...` PASS; frontend 370 archivos/2673 tests PASS;
  build y ESLint focal PASS. Vitest conserva dos `AbortError` heredados de
  teardown después del resumen con exit 0.
- Estado real: implementación `3a54d34` y fix `46df1b2`, sincronizados con
  `nightly@638b470` mediante `f0e40bd`. Review adversarial: P0=0, P1=3
  corregidos, P2=0 y P3=0. `go test ./... -count=1`, frontend 370/2673, build,
  ESLint focal, vet focal sin deuda nueva y diff-check pasan. La PR #233 pasó
  los gates bloqueantes y se integró por squash en `nightly@5499008` el
  2026-08-14. Sigue pendiente la comprobación manual LMU/Wails; no hubo
  promoción a `testers`, `master` ni release.

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

- **Estado al 2026-08-12:** implementación de Tasks 0–4 completada y revisada;
  gates acumulados de Task 5 ejecutados. Queda la aceptación manual de Isaac en
  hardware Windows multimonitor antes de cualquier promoción.
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
- **Monitor:** Wails ya aporta `Screens.GetAll` y `Screen.GetByIndex`. Studio
  persiste índice y `layoutViewport` de forma atómica usando `Bounds` CSS/DIP;
  Desktop crea y lleva a fullscreen la ventana sobre esa pantalla exacta. No se
  usa el viewport del Hub, `WorkArea` ni una multiplicación por DPI.
- **Autoridades:** `docs/adr/0092-overlay-arbitrary-layout-viewport.md` y
  `docs/superpowers/plans/2026-08-11-overlay-arbitrary-viewport-parity.md`.

Ledger vivo:

| Task | Contenido | Estado | Evidencia | Próxima condición |
|---|---|---|---|---|
| 0 | ADR, microplan y expediente | Completada | Commit documental; diff check limpio | Task 1 |
| 1 | Contrato TS/Go + transformación pura | Completada | `5a98553` + `a9c2fc8`; TS 67/67, Go pkg y completo PASS; doble review PASS | Task 2 |
| 2 | Superficie editable en Studio | Completada | 2A `b873a82`/`7b24f09`; 2B `8249585`/`50e9b9e`/`5fc3809`; 2C `edf3359`/`13fe677`/`1aa1ec7`; dobles reviews PASS | Task 3 |
| 3 | Paridad Desktop/OBS | Completada | 3A `ecda9ee`/`c8f00e5`; 3B `b4a5c94`/`fb5b5ae`; dobles reviews PASS | Task 4 |
| 4 | Hub fluido + frontera monitor nativo | Completada | `0aa50aa`, `3f819d4`, `30c5292`, `0421e55`, `452b4ce` y correcciones hasta `4703a48`; reviews finales Ready/PASS | Aceptación manual física |
| 5 | Gates, evidencia y cierre | Completada técnicamente | Go completo PASS; frontend 2567/2567; build y diff-check PASS; lint con deuda heredada documentada | Isaac prueba Windows multimonitor y decide promoción |

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

Evidencia microcorte 2C:

- `StudioPreviewState` ya no contiene una resolución ficticia. El documento
  gobierna dimensiones, fit, área segura, interacción y todas las rutas visibles
  de centrado; los perfiles legacy conservan el fallback 1920×1080.
- Presets planos y dimensiones custom 32..16384 persisten mediante
  `document/layout-viewport`. La escena muestra límites propios sobre un stage
  neutral; el fondo seleccionado pertenece a la escena y el panel es responsive.
- Dos reviews detectaron estados engañosos del selector ante un preset rechazado
  y ante volver al preset vigente desde un draft custom. Se corrigieron en
  `13fe677` y `1aa1ec7`; selector, drafts, cabecera, escena y documento quedan
  sincronizados sin hacer optimista un cambio que recoverability pueda rechazar.
- Evidencia final independiente: focal 9 archivos 55/55, regresiones de geometría
  y preview imperativa 67/67, build y diff-check PASS. Spec review PASS y quality
  review Ready, cero Critical/Important. Lint conserva únicamente 4 errores y 1
  warning heredados en líneas anteriores a ISA-326.
- Observación aceptada: elegir explícitamente 1920×1080 en un perfil legacy puede
  materializar `layoutViewport` y marcar dirty; es coherente con persistir la
  superficie seleccionada según ADR 0092.

Ejecución Task 3:

- **3A — superficie runtime compartida:** medir la salida CSS, aplicar una sola
  transformación `contain` a la escena lógica y demostrar paridad Desktop/OBS,
  offsets centrados, legacy y `layoutOrigin` lógico.
- **3B — preview y app OBS:** hacer que la preview reciba la superficie
  documental y eliminar sus imports de constantes Studio, sin doble escala.
- Los microcortes son secuenciales y cada uno exige spec review y quality review
  antes de avanzar; sus write sets no se solapan.

Evidencia microcorte 3A:

- `RuntimeOverlaySurface` mide la caja CSS no transformada y aplica una única
  transformación `contain` a una escena lógica. Desktop y OBS comparten la misma
  implementación; frames y `layoutOrigin` permanecen en espacio lógico.
- La escena espera una medida positiva, soporta resize fraccional, legacy
  1920×1080, offsets X/Y y limpia observer/listener. Los subtítulos viven dentro
  de la misma escena; ningún renderer ni `RuntimeWidgetFrame` fue modificado.
- Spec review detectó dos Important antes de 3B: `getBoundingClientRect` podía
  medir un ancestro ya escalado y causar doble escala, y `overflow: visible`
  permitía que widgets parciales contaminaran bandas transparentes. Corregidos
  en `c8f00e5` usando `contentBoxSize/contentRect` o fallback `clientWidth/Height`,
  y clipping en el límite documental.
- Evidencia final: focal raíz 5 archivos 39/39, build, ESLint focal y diff-check
  PASS. Spec review PASS y quality review Ready, cero Critical/Important.
- Gate 3B: la API OBS todavía entrega `layoutOrigin` shrink-wrap mientras Desktop
  usa cero. 3B debe normalizar esa diferencia y demostrar paridad end-to-end;
  no basta con la paridad del componente bajo inputs iguales.

Evidencia microcorte 3B:

- La preview OBS recibe el `layoutViewport` documental, elimina toda dependencia
  de constantes Studio y usa el transform `contain` core sobre una caja CSS no
  transformada. Espera la primera medida válida, soporta dimensiones
  fraccionales y limpia `ResizeObserver` o el fallback de `window.resize`.
- En preview, la escena exterior aplica una sola escala y el runtime interior
  mide la superficie lógica con `scale=1`. En streaming, el runtime mide la
  salida real. Un documento 1000x1000 sobre 1600x900 conserva escala 0,9,
  offset X 350 y coordenadas documentales `x=123`, `y=87`.
- `ObsOverlayApp` ignora el `layoutOrigin` shrink-wrap legado del endpoint; OBS
  deja de desplazar widgets respecto a Desktop. El fondo y la cuadrícula quedan
  dentro de la escena y las bandas exteriores permanecen neutrales.
- Spec review detectó que el recordatorio de calendario también se escalaba en
  preview. Se corrigió en `fb5b5ae`: solo el runtime entra en la escena
  documental y el banner permanece como capa de salida, con cierre intacto.
- Evidencia final independiente: focal 8 archivos 64/64, suite frontend
  2543/2543, build, ESLint focal y diff-check PASS. Spec review PASS y quality
  review Ready, cero Critical/Important. Ruido heredado: dos `AbortError` de
  teardown con exit 0 y warnings de `.eslintignore`/chunk. Smoke visual real
  pendiente para Task 5.

Evidencia Task 4 y cierre acumulado:

- El workspace Profiles/Studio usa todo el ancho disponible sin quitar el cap de
  1920 px a las demás secciones. Focal 21/21, suite completa 2545/2545, build y
  review PASS (`0aa50aa`).
- El cliente nativo enumera pantallas en CSS/DIP, tolera nombres vacíos y valida
  índice seguro. El comando `document/monitor` hace monitor+superficie en un solo
  paso de dirty/undo/redo; la UI conserva custom si Wails no está disponible.
  Commits `3f819d4`, `30c5292` y `0421e55`; reviews Ready sin Critical/Important.
- Desktop resuelve la pantalla exacta, usa sus `Bounds` para la colocación inicial
  y después fullscreen. Los cierres tardíos de una ventana reemplazada no pueden
  cerrar ni desincronizar la nueva; la identidad no comparable falla sin panic y
  los side effects quedan serializados. Commits desde `452b4ce` hasta
  `4703a48`; spec PASS y quality Ready, cero Critical/Important.
- Gates acumulados sobre `4703a48`: `go test ./...` PASS; frontend 360 archivos,
  2567/2567 PASS; build y `git diff --check origin/nightly...HEAD` PASS. ESLint
  directo sobre los 53 TS/TSX tocados queda rojo con 6 errores y 1 warning en
  líneas heredadas; el global conserva 36 errores y 2 warnings. Las comparaciones
  contra el baseline hechas por microcorte no encontraron violaciones nuevas.
  La suite conserva dos `AbortError` de teardown de happy-dom tras el resumen,
  con exit 0.
- Inspección T3 del harness Studio: superficies 3440×1440 y custom 1000×1000;
  viewports 1440×900, 1024×768 y 800×700 sin scroll horizontal del documento y
  con escala uniforme. El navegador no dispone del runtime Wails ni de un perfil
  servido por el backend, por lo que no sustituye la prueba física Desktop/OBS.
- Riesgos aceptados: `monitorIndex` es posicional y la enumeración solo se
  refresca al abrir Studio; hot-plug durante la sesión requiere reabrirlo. La
  prueba manual Windows con dos monitores/DPI mixto queda pendiente para
  Nightly; Isaac excluyó OBS como gate de este corte.
- Smoke Wails posterior al cierre: build y arranque nativo PASS; Hub 1280×800,
  WebView2 y `/health` operativos. El host solo tiene `DISPLAY1` 1920×1080 y el
  Studio real requiere login/configuración Supabase ausente en este worktree, así
  que multimonitor/DPI mixto continúa siendo gate humano.
- El smoke HTTP con un perfil V3 custom 1000×1000 confirmó que
  `/api/profile-v3` conserva `layoutViewport`, pero `/overlay` quedó vacío: la
  CSP preexistente permite inline y bloquea los módulos/estilos propios de Vite.
  ISA-329 (`OBS · CSP local bloquea los assets propios y deja /overlay vacío`)
  queda como bug High abierto y limitación conocida; por decisión explícita de
  Isaac no bloquea esta Nightly. No se amplió silenciosamente el write set de
  ISA-326 para tocar seguridad/servidor.
- Promoción completada el 2026-08-12: ISA-330 creó una rama de integración desde
  `origin/nightly@5069cbb`, fusionó la rama ISA-326 (`7600206`) mediante
  `--no-ff` en `d0789e5`, incorporó después el PR #207 desde
  `origin/nightly@cc54d36` en `e45bcf9` y preparó `v0.1.0.7-nightly.7`. El PR
  #208 pasó CI y se fusionó por squash en `nightly@234794d`. `testers` y
  `master` quedaron fuera del corte.
- Gates locales combinados finales de ISA-330 sobre `cc54d36`: Go completo PASS;
  frontend 367 archivos/2636 tests PASS; build PASS; diseño 3/3; visual Studio PASS con widgets,
  paridad, interacción y los tres viewports responsive a 0.000 %. Los tres
  baselines de Studio se actualizaron después de inspeccionar que el cambio era
  el `contain` aprobado y no una pérdida de paneles o controles. Lint global
  sigue rojo por deuda previa, pero pasa de 47 errores/2 warnings en
  `cc54d36` a 44/2 en la integración; no añade deuda.
- Release publicada: el workflow oficial `Release build` run `31633854889`
  terminó PASS en el rerun final sin cambios de código y publicó
  `v0.1.0.7-nightly.7` sobre `234794d`. La pre-release no es draft, contiene
  los seis assets oficiales y la descarga independiente confirmó los SHA-256
  del instalador, portable y ejecutable. Los dos intentos anteriores fallaron
  antes de publicar por descarga transitoria de Electron y por el soak Windows
  intermitente ya inventariado. ISA-329 sigue abierta como limitación OBS
  aceptada expresamente para este corte; no se afirma paridad OBS.
