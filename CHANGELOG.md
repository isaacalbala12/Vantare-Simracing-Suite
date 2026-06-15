# Changelog

## v0.1.1-prealpha - 2026-06-15

Pre-alpha de correcciones y refinamientos para Relative y Standings.

### Incluido

- **Relative Widget**:
  - Corrección en el orden visual de los coches de delante: el 3º más lejano va arriba y el 1º más cercano queda justo encima del jugador.
  - Gaps de tiempo basados en distancia física circular en pista (wrap-around) en segundos.
- **Standings Widget**:
  - Filtro dinámico por clase: expone únicamente a los pilotos de la categoría del jugador (p. ej. LMP3).
  - Muestra la posición del piloto dentro de su categoría (`1º` a `Nº`) en lugar de la general.
  - Mapeado el tiempo restante de sesión (`timeRemainingInGamePhase`) y la clase activa en tiempo real al encabezado del panel.
  - Gaps de carrera calculados respecto al líder de la categoría.
  - Colores unificados por estado: texto blanco para coches en pista, gris (`#9CA3AF`) para coches en pit/box.
  - Badge de PIT más pequeño y adaptativo sobre el número del coche sin cortarse.
- **Infraestructura**:
  - Añadidas cabeceras e instrucciones HTML de anti-caché en `index.html` para evitar que los navegadores sirvan JS antiguos al recompilar.
  - Exclusión de vueltas netas en la lógica del backend para obtener gaps físicos estables y coherentes.

## v0.1.0-alpha.1 - 2026-06-15

Primera alpha pública de Vantare Overlays v2.

### Incluido

- App v2 en `vantare-v2/` con Go + Wails v3 + React 19.
- Hub principal con dashboard, perfiles, Preview Workbench y panel Ops.
- Overlay desktop runtime bajo demanda: se abre solo al pulsar `Iniciar`.
- Ventana overlay fullscreen, transparente, always-on-top y click-through.
- Preview Workbench para elegir perfil, editar layout, activar/desactivar widgets, guardar e iniciar/detener overlay.
- Perfiles JSON en `vantare-v2/configs/*.json`.
- Telemetría live de Le Mans Ultimate mediante shared memory `LMU_Data`.
- Widgets visuales iniciales estilo Vantare Racing: standings, relative, delta, telemetry, telemetry vertical y pedals.
- Relative y Standings conectados a datos reales de LMU.
- Pipeline Go con normalizer, deadband, diff y emisión UI limitada.
- OBS/HTTP/SSE técnico:
  - `GET /health`
  - `GET /overlay?profile=...`
  - `GET /api/profile?profile=...`
  - `GET /telemetry/stream`
- Lite mode y tokens de tema runtime.
- Ops panel a baja frecuencia con RAM, goroutines y fuente de telemetría.

### Limitaciones conocidas

- Delta real (`deltaBest`) todavía no está conectado/calculado con datos live fiables de LMU.
- iRacing y Assetto Corsa son foundation/roadmap; no son adapters completos en esta alpha.
- OBS real debe validarse en una instalación de OBS; HTTP/SSE ya está implementado.
- CPU del panel Ops se muestra como `N/D`.
- Auth, cloud sync, marketplace y planes Pro/Ultimate quedan fuera de esta alpha.
- El directorio `apps/desktop/` es v1 legado y no forma parte de la alpha v2.

### Verificación requerida

```powershell
cd C:\Users\isaac\Desktop\Vantare-Overlays\vantare-v2
go test ./...
pnpm --dir frontend test
pnpm --dir frontend build
```
