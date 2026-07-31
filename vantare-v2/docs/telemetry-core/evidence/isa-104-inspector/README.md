# Evidencia visual ISA-104 / TC-06D

Capturas producidas por
`frontend/scripts/diagnostics-inspector.playwright.mjs` contra el harness local
`frontend/diagnostics-harness.html`.

## Estados

- `wide-current.png`: sesión v1 actual y disponible después de un único
  `Inspect`.
- `wide-future.png`: manifest de versión futura mostrado solo con metadata de
  `List`; no abre SQLite.
- `wide-corrupt.png`: manifest corrupto mostrado solo con metadata de `List`;
  no abre SQLite.

## Responsive

- `wide.png`: 1440 × 1000.
- `medium.png`: 1024 × 900.
- `compact.png`: 390 × 844.

El runner comprueba antes de guardar:

- cero overflow horizontal;
- cero errores o warnings de consola;
- preview, copia y descarga con exactamente los mismos bytes;
- SHA-256 y tamaño coherentes con el payload;
- una inspección para `current+ready`;
- cero inspecciones para future/corrupt;
- Vite cerrado por su propio PID y puerto 5184 libre.

Las capturas contienen únicamente fixtures sintéticos allowlisted. No contienen
telemetría real, nombres, rutas, IDs, voz, estrategias, tokens, SQLite ni logs.
