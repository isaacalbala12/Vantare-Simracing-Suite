# Banco Astra

Tooling de ISA-978. La auditoría principal mide813b96c4, compara659b2c57 y excluye valoración de Telemetry Core. Estos scripts no son entries de producto. Las salidas deben ir a un directorio externo al worktree y nunca a sources/ o .env. Node22/pnpm9/Go1.25 y dependencias del lockfile existente.

Desde vantare-v2, en un worktree del snapshot exacto y con install --frozen-lockfile:

```sh
node /ruta/al/tooling/measure-bundle.mjs frontend /ruta/salida candidate minified
node /ruta/al/tooling/measure-bundle.mjs frontend /ruta/salida candidate raw
node /ruta/al/tooling/measure-track-map.mjs frontend /ruta/salida base
node /ruta/al/tooling/measure-react.mjs frontend /ruta/salida base
```

Para experimentos, añadir al final `track-cache` (track/React), o `edit-lazy`, `locale-active`, `route-lazy`, `geometry-defer` (bundle). Transforms solo en memoria, before/after en salida; son prototipos, no paridad de producto. Cada build empieza de fuentes intactas. El cache experimental solo aplica a fuentes BASE, no al código ya optimizado de979. Los otros transforms fueron medidos en813b96c4; no asumir que patches por texto aplican a otra revisión. No ejecutarlos sobre trabajo de usuario ni comparar dos benchmarks bajo carga simultánea.

Go storage: `go test ./scripts/performance/storage-bench -run '^$' -bench . -benchmem -count=10`. Solo fixtures del repo/temp; no datos de usuario. Perfiles con `-cpuprofile <externo> -memprofile <externo> -o <externo>`. Benchstat para Go; formato benchstat adaptado para series JS solo para comparación, no lenguaje de implementación.

`summarize.py <directorio-original-de-colección> <salida>` regenera las tablas a partir de JSON/logs de la colección; no descarga PRs ni inventa muestras que falten. Incluye reglas de clasificación específicas del inventario del4septiembre, por lo que no debe usarse para inferir automáticamente futuros PRs. Evidencia primaria comprimida en docs/audit/astra-performance-evidence/raw. Gzip reproducible descomprime a JSON de imports y métricas. No se entregan node_modules/dist ni se añade dependencia.

Windows: [entrada única](windows/README.md). Build/medidas auxiliares nunca certifican FPS, Private Bytes, TTI ni LMU físico. Las sondas ausentes se enumeran en backlog; no se sustituyen por ceros.
