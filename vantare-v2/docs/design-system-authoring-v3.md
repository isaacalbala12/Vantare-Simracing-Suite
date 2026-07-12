# Authoring visual systems V3

Este kit convierte un HTML de referencia en un sistema visual V3 sin acoplarlo a telemetría, persistencia o permisos.

1. Copia `frontend/src/overlay/design-systems/_template` a una carpeta kebab-case.
2. Define un ID estable y versión 1; declara migraciones secuenciales para versiones futuras.
3. Completa la worksheet HTML y separa ViewModel, settings visuales y contenido funcional.
4. Sustituye fuentes y assets remotos por archivos locales.
5. Crea un renderer puro que reciba `model`, `settings` y `renderMode`.
6. Scopea todo CSS bajo `[data-widget-system="..."]`.
7. Declara defaults, parser, controles y compatibilidad explícita por widget.
8. Añade estados ready, missing, stale, disconnected y error.
9. Añade snapshots/parity para Studio, Desktop y OBS.
10. Ejecuta `pnpm --dir frontend test -- design-systems` y `pnpm --dir frontend design-system:check`.

Está prohibido que un renderer lea Wails, SSE, perfiles, permisos, posición o referencias mutables de telemetría. El host V3 es el único punto de selección del sistema.
