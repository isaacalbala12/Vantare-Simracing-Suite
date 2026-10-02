# Frontend de Vantare

React/TypeScript, Vite y Tailwind; integrado en Wails. Las versiones y scripts exactos viven en [package.json](package.json) y el lockfile del repositorio.

Instala dependencias desde la raíz del repositorio con `pnpm install --frozen-lockfile`. Desde `vantare-v2`:

```powershell
pnpm --dir frontend dev
pnpm --dir frontend typecheck
pnpm --dir frontend test
pnpm --dir frontend build
pnpm --dir frontend lint
```

Vite por sí solo no proporciona el backend Wails ni una sesión real. Para ejecutar la app completa sigue [operaciones](../docs/operations.md). El modo de prueba `VITE_RUNTIME_MOCK` es una opción explícita de los harnesses en [vite.config.ts](vite.config.ts), no evidencia de funcionamiento real.

`typecheck` usa `tsc -b --noEmit`. No usar `tsc --noEmit -p tsconfig.json`: el fichero raíz solo enlaza proyectos y tiene `files: []`.

- [Hub](src/hub/) y [Overlay Studio](src/hub/overlay-studio/).
- [WidgetVisualHost](src/overlay/core/WidgetVisualHost.tsx): frontera compartida de renderizado.
- [Workshop](../docs/overlays-studio/overlay-workshop-authoring-guide.md): autoría del TSX/CSS productivo mediante HMR.
- [Pruebas y visuales](../docs/testing-strategy.md).
