# Handoff vivo — Overlay Studio, Launcher y Hub

## Autoridad y lectura

- `docs/vantare-program/README.md` y `product-contract.md`.
- Overlay: ADR 0003, `docs/overlays-studio/`, proyecto Linear y sus dos HTML.
- Crystal: `docs/overlay-glassmorphism-pro.html`, solo secciones 01–16.
- Launcher: `docs/launcher-v3-architecture.md`, su plan vigente y Linear.
- Hub: código actual y characterization; los roadmaps históricos no son spec.

## Estado

- Overlay: ISA-260 fija el contrato Workshop sobre `nightly@4981e6f`; queda en
  review, sin promoción. El catálogo actual es 19 tipos/41 diseños/22 Crystal;
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

Workshop no tiene UI aún: reutilizará `WidgetVisualHost` y renderers puros. Su
contrato y microplan están en `docs/overlays-studio/os-09-overlay-workshop-contract.md`.

1. Desde la raíz del **worktree correcto**, verifica `git branch --show-current`,
   `git rev-parse --short HEAD` y `git status --short` antes de abrir la app.
2. Confirma solo que existe `frontend/.env.local` y que declara
   `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`; no imprimas valores ni copies
   el archivo entre worktrees.
3. Ruta dev recomendada:
   `powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\start-wails-dev.ps1`.
   El wrapper detiene stacks Vantare/Wails previos, mapea configuración pública
   al backend, ejecuta `generate_supabase_config.ps1` y arranca
   `wails3 dev -config ./build/config.yml -port 9245`. No uses `wails3 dev`
   directo salvo que el entorno backend ya esté preparado.
4. `cmd/vantare/supabase_build.go` es temporal e ignorado: nunca se commitea ni
   se muestra. El wrapper puede dejarlo localmente; A2 lo limpia en `finally`.
5. Para binario rápido, sigue sin duplicarlo la **Opción A2** de
   `docs/release-beta-operations-runbook.md` y abre solo `bin\vantare.exe`, nunca
   un exe raíz/portable stale.
6. Si aparece «Configuración incompleta», no es un problema de la cuenta ni de
   su licencia: la build/backend no recibió la configuración pública de
   Supabase o se abrió un binario antiguo. Cierra la app, reconstruye/rearranca
   con el wrapper y confirma binario/worktree. Smoke: app abre, la sesión y el
   acceso se resuelven, Hub carga y Overlay Studio abre; anota branch/SHA usados.
7. Al cerrar, detén el stack Vantare/Wails del worktree y no borres
   `frontend/.env.local`.

Autoridades complementarias: `docs/release-beta-operations-runbook.md` y
`docs/tester-build-instructions.md`.

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

2026-08-04, ISA-260, contrato Workshop y runbook de apertura.
