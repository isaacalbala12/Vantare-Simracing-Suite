# Herramientas de medición conservadas · #1533

`huella-medir.ps1` mide procesos ya arrancados y PresentMon sin Wails/React.
`huella-comun.ps1` contiene sus funciones compartidas. `huella-resumen.mjs`
analiza CSV archivado; `huella-procesos.mjs` y `huella-cdp-metrics.mjs` conservan
los analizadores independientes y sus fixtures. No implican latencia de entrada.

Checks sin arrancar apps: `node --test scripts/bench/all.test.mjs`.
Los runners Wails, builds y harnesses React se retiraron. La documentación y
datos originales están en `native/retirement/legacy-evidence/scripts/bench`;
sus comandos históricos no se ejecutan en este checkout.
