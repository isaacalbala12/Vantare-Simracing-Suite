# Evidencia visual ENG-01

Capturas reproducibles del HTML de referencia. Todos los datos son sintéticos
y la página no prueba conectividad LMU, audio, voz ni escritura de Pit Manager.

- `eng01-overview-wide.png`: estado general, scheduler y capabilities.
- `eng01-pit-wide.png`: contrato de confirmación y verificación fail-closed.
- `eng01-stale-mobile.png`: escenario stale y degradación mobile.

El smoke versionado en
`frontend/scripts/engineer-reference-smoke.mjs` comprueba tabs por
ratón/teclado, escenarios, localización, estados
`aria-selected`/`aria-pressed`, PTT/wake, ausencia de overflow horizontal y
cero errores de consola/página. Regenera las tres capturas con Chrome y el
Playwright ya declarado por frontend, sin red ni acceso a telemetría:

```powershell
pnpm --dir frontend test:eng01-reference
```
