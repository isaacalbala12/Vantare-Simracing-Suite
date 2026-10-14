# Vantare — aplicación de escritorio

La aplicación de este checkout usa Rust + GPUI en `native/`, según ADR 0099.
#1533 retira las fuentes Wails/React; no demuestra promoción ni publicación.
Windows 10/11 y Le Mans Ultimate siguen siendo el objetivo principal de desarrollo.

## Desarrollo

Lee [native/README.md](native/README.md), los README de sus crates y [AGENTS.md](AGENTS.md).
Los gates de la aplicación son formato, check, Clippy, Nextest, lifecycle y telemetría;
Go y pnpm no forman parte de ellos. Respetar la cola de compilación del worktree.
El [empaquetado nativo](native/packaging/README.md) tiene su propio contrato y
requiere autorización separada para publicar. `release.yml` rechaza la publicación retirada.

## Fuentes y referencias

- [Workspace nativo](native/README.md): aplicación, widgets, telemetría y servicios.
- [Corpus conservado](native/retirement/README.md): fixtures, voz, calendario, perfiles y marca.
- [Oráculos históricos Go](tools/frozen-go/README.md): archivos mínimos, hashes y reproducción aislada.
- [Documentación](docs/README.md): contratos actuales y evidencia histórica.

El código y los datos de Supabase siguen conservados fuera de esta carpeta.
`apps/`, `packages/` y `shared/` pertenecen a otros proyectos históricos del monorepo.
No se han modificado instalaciones, cuentas ni datos reales del usuario.
