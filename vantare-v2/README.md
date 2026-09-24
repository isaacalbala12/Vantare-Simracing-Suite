# Vantare — aplicación de escritorio

Aplicación principal de Vantare Simracing Suite. El código usa Go + Wails v3 y React/TypeScript. Windows 10/11 y Le Mans Ultimate son el objetivo principal de desarrollo; la disponibilidad de otros simuladores se verifica por driver y por build, no por el README antiguo del monorepo.

## Desarrollo

Lee [operaciones](docs/operations.md) para requisitos, preparación y arranque; [testing](docs/testing-strategy.md) para los checks. Los agentes comienzan por [AGENTS.md](AGENTS.md) y la tarea Notion.

Desde la raíz del repositorio:

```powershell
pnpm install --frozen-lockfile
pnpm --dir vantare-v2/frontend build
cd vantare-v2
go run ./cmd/vantare -live=false -profile configs/example-racing.json
```

Este comando abre la app Wails con los assets compilados. `-live=false` deja la telemetría **desconectada**; no activa un simulador ficticio ni un servidor sin ventana. El arranque con recarga de desarrollo y la configuración local se explican en operaciones.

## Mapa del código

| Ruta | Responsabilidad |
|---|---|
| [cmd/vantare](cmd/vantare/) | Entrada Wails y conexión de servicios |
| [internal/app](internal/app/) | Ciclo de vida, puente, perfiles y coordinación |
| [internal/telemetry](internal/telemetry/) | Fuentes LMU, núcleo y proyecciones |
| [internal/telemetryanalysis](internal/telemetryanalysis/) | Análisis de sesiones |
| [internal/engineer](internal/engineer/) | Engineer/Spotter y audio |
| [internal/strategy](internal/strategy/) | Estrategia, documentos y cálculo |
| [internal/server](internal/server/) | Servidor local y OBS |
| [frontend/src/hub](frontend/src/hub/) | Hub y pantallas de la suite |
| [frontend/src/overlay](frontend/src/overlay/) | Renderizado compartido de widgets |

[Arquitectura](docs/architecture.md) · [Documentación vigente](docs/README.md) · [Roadmap](docs/roadmap-maintenance.md) · [Histórico](docs/documentation-inventory.md).
