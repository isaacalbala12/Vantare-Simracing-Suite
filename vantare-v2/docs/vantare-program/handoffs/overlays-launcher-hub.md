# Handoff vivo — Overlay Studio, Launcher y Hub

## Autoridad y lectura

- `docs/vantare-program/README.md` y `product-contract.md`.
- Overlay: ADR 0003, `docs/overlays-studio/`, proyecto Linear y sus dos HTML.
- Crystal: `docs/overlay-glassmorphism-pro.html`, solo secciones 01–16.
- Launcher: `docs/launcher-v3-architecture.md`, su plan vigente y Linear.
- Hub: código actual y characterization; los roadmaps históricos no son spec.

## Estado

- Overlay: proyecto Linear activo; ramas ISA-92/93 e integraciones históricas.
- Launcher: ISA-9 fue validada históricamente; integración real por auditar.
- Hub: sin issue activa.
- Testing Center: arquitectura propuesta en ISA-205 / TAU-00; no implementada.
  Su estado vive en `testing-automation.md`.
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

Testing Center será una pestaña de aplicación separada en los canales nightly y
testers. Hub puede enlazarla, pero no posee auth, roles, diagnósticos, estado de
issues ni promociones. La visibilidad por canal no sustituye la autorización
server-side.

## Issues y siguiente acción

- Overlay: seguir su proyecto y TC-07; no abrir otro reader.
- Launcher: crear LAU-AUDIT antes de nuevas features.
- Hub: crear HUB-POLISH después de characterization visual.
- Testing Center: no implementar desde este handoff; seguir TAU-01..TAU-13.
- Checks: harness real, Playwright, transparencias, responsive, capturas,
  frontend test/build; no regenerar baselines para esconder fallos.

## Última actualización

2026-08-02, ISA-205 / TAU-00, Codex orquestador.
