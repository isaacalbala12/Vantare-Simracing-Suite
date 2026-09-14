# Vantare Simracing Suite

Suite de escritorio para simracing, con desarrollo principal en Windows y Le Mans Ultimate. La aplicación actual está en [`vantare-v2/`](vantare-v2/README.md): Go, Wails v3 y React. Incluye código de Hub, Overlay Studio, Launcher, telemetría, Engineer/Spotter, Strategy Planner, calendario y servicios de cuenta. La existencia de un módulo no certifica que esté listo para lanzamiento.

## Por dónde empezar

- **Usar una build:** [guía de testers](vantare-v2/docs/tester-build-instructions.md), [OBS local](vantare-v2/docs/obs-local-setup.md) e [incidencias por versión](vantare-v2/docs/tester-known-issues.md).
- **Desarrollar:** [preparación y comandos](vantare-v2/docs/operations.md), [arquitectura](vantare-v2/docs/architecture.md) y [pruebas](vantare-v2/docs/testing-strategy.md).
- **Trabajar con agentes:** [AGENTS.md](AGENTS.md), tarea y proyecto en [Notion](https://app.notion.com/p/3fce51695c65834e80b381ec2d632192) y [expediente técnico](vantare-v2/docs/vantare-program/README.md).
- **Consultar documentación:** [índice vigente](vantare-v2/docs/README.md) e [inventario e histórico](vantare-v2/docs/documentation-inventory.md).

## Estado y código

El desarrollo se contrasta con `origin/nightly` actualizado. `master` es la rama pública predeterminada y puede ir por detrás. Una PR, un test o una captura no demuestran publicación ni validación en pista. Consulta los [canales y promociones](vantare-v2/docs/branch-channels.md) y el [roadmap público](vantare-v2/docs/roadmap/plan.md).

`apps/`, `packages/` y `shared/` conservan el monorepo Electron anterior. Sus scripts y la documentación de [`docs/`](docs/README.md) no son la entrada de desarrollo de la app Wails. Los HTML de referencia y las evidencias se conservan; no equivalen a funciones conectadas a datos reales.

La versión del código está en [`vantare-v2/VERSION`](vantare-v2/VERSION); la versión distribuida se comprueba en el tag y los artefactos de la release correspondiente.

Software propietario. Consulta [LICENSE](LICENSE).
