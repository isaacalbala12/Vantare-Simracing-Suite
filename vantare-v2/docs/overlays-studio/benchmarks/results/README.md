# Resultados del benchmark de arrastre

Salida del script `pnpm --dir frontend bench:overlay-studio-drag`.

| Archivo | Descripción |
|---------|-------------|
| `baseline-B1.json` | Referencia de la variante B1 (preview imperativa). Actualizar solo cuando el cambio sea intencional. |
| `run-*.json` | Ejecuciones puntuales con métricas por traza y score compuesto. |

## Comandos

```bash
# Ejecutar benchmark y comparar con baseline (si existe)
pnpm --dir frontend bench:overlay-studio-drag

# Fijar o actualizar baseline tras un cambio aceptado
pnpm --dir frontend bench:overlay-studio-drag:baseline
```

## Cuándo ejecutarlo

- PRs que toquen `useCanvasInteraction*`, `canvas-frame-preview*`, `StudioWidgetFrame*` o CSS `--interacting`.
- Antes de cerrar experimentos de fluidez documentados en `arrastre-y-resize.md`.