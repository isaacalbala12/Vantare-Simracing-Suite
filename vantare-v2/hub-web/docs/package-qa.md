# Candidato QA de Electron

Este candidato contiene solo el anfitrión y `hub-ui/`, en una raíz nueva de QA. No es un instalador, no registra aplicaciones, no cambia el Hub GPUI distribuido y no puede publicarse como paquete completo de Vantare.

Preparar las variables con rutas absolutas locales en D: `VANTARE_HUB_QA_ROOT`, `VANTARE_HUB_HOST_BINARY` (copia del anfitrión compilado dentro de la cola), `VANTARE_HUB_BUILD_PROFILE` (`Debug` o `Release`, debe corresponder al artefacto), `ELECTRON_CACHE`, cachés de Bun y `TEMP`/`TMP`. Desde hub-web:

```powershell
$env:VANTARE_HUB_QA_BUILD='1'
node node_modules/electron-vite/bin/electron-vite.js build
node --experimental-strip-types scripts/package.ts
node --experimental-strip-types scripts/package-qa.ts
```

El último comando devuelve la raíz y generación nuevas. El manifiesto enumera tamaño y SHA-256 de todos los archivos de bin y hub-ui, incluidos sidecars de EXE y app.asar. state.json liga el hash del manifiesto a la generación activa. data/ es mutable y queda fuera del inventario. El anfitrión exige las tres entradas esenciales, verifica la generación activa y llama al verificador del instalador antes de crear Electron; archivos extra, ausentes, alterados o enlaces impiden abrirlo. No hay un bypass de entorno para una generación instalada.

`smoke-host.ts` sella también su generación antes de arrancar. Ejecutarlo con el nuevo anfitrión, manteniendo datos locales desechables. `smoke-core.ts` conserva su fixture independiente de núcleo; el candidato completo del instalador queda fuera de este paso.

## Fuse comprobado en Windows

Con `VANTARE_HUB_UI_PACKAGE` apuntando a la carpeta empaquetada:

```powershell
node --experimental-strip-types scripts/check-asar-integrity.ts
```

Crea tres copias propias bajo la raíz QA: intacta, índice asar manipulado y contenido del main manipulado. La intacta debe mostrar el núcleo simulado; las otras deben terminar con error de integridad. Hay plazo máximo para cada arranque. Se guarda result.json con stderr.

La prueba del 10-nov-2026 con Electron 45.2.3 en Windows pasó las tres condiciones: `Integrity check failed ... <header>` y `ASAR Integrity Violation ... hash mismatch` en las copias alteradas. Evidencia local: `D:/VantareServer/qa/isa-1995-package/asar-dafe4cc1bd1379b8/result.json`. Esto verifica el fuse y el recurso PE embebido por packager en esa plataforma; no sustituye la firma ni la prueba pendiente de Windows 10.

El paquete conserva únicamente es y en-US. RunAsNode, NodeOptions, CLI inspect y privilegios extra de file están cerrados; carga exclusiva desde asar e integridad embebida están activadas. El CDP del candidato solo existe en la compilación QA, no en distribución.

La prueba de Windows 10 está en [windows-10-qa.md](windows-10-qa.md). Las cifras de rendimiento deben salir de mediciones repetidas con la cola vacía; no usar tiempos del smoke como rendimiento de producto.
