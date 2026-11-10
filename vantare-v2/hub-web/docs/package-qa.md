# Candidato QA de Electron

Este candidato contiene solo el anfitrión y `hub-ui/`, en una raíz nueva de QA. No es un instalador, no registra aplicaciones, no cambia el Hub GPUI distribuido y no puede publicarse como paquete completo de Vantare.

Preparar las variables con rutas absolutas locales en D: `VANTARE_HUB_QA_ROOT`, `VANTARE_HUB_HOST_BINARY` (copia del anfitrión compilado dentro de la cola), `VANTARE_HUB_BUILD_PROFILE` (`Debug` o `Release`, debe corresponder al artefacto), `ELECTRON_CACHE`, cachés de Bun y `TEMP`/`TMP`. Desde hub-web:

```powershell
$env:VANTARE_HUB_QA_BUILD='1'
node node_modules/electron-vite/bin/electron-vite.js build
node --experimental-strip-types scripts/package.ts
node --experimental-strip-types scripts/package-qa.ts
```

El último comando devuelve raíz, generación, ZIP y SHA-256 del ZIP; su fichero vecino `.SHA256SUMS` permite comprobar la transferencia. La versión procede de `--version` del anfitrión copiado, el SHA de Git y `source_dirty` del estado real del checkout. No se etiqueta como limpio un árbol con cambios. El manifiesto enumera tamaño y SHA-256 de todos los archivos de bin y hub-ui, incluidos sidecars de EXE y app.asar. state.json liga el hash del manifiesto a la generación activa. data/ es mutable y queda fuera del inventario. Antes de sellar se releen los siete fuses del EXE final y se exige exactamente es/en-US. El anfitrión exige las tres entradas esenciales, verifica la generación activa y llama al verificador del instalador antes de crear Electron; archivos extra, ausentes, alterados o enlaces impiden abrirlo. No hay un bypass de entorno para una generación instalada.

Límite conocido: existe TOCTOU entre la verificación de archivos y CreateProcess; un escritor local con permiso sobre la generación puede modificar un recurso durante ese intervalo. Los hashes detectan cambios previos, no convierten esa carpeta en inmutable. No se presenta como protección frente a un administrador local. En 5b se registran el primer recorrido y el segundo recorrido con hash; una posible caché por mtime/tamaño debilitaría esta garantía y requiere una decisión separada. Otra alternativa sería verificar al instalar y proteger la generación contra escritura; no se introduce aquí.

`smoke-host.ts` sella también su generación antes de arrancar. Ejecutarlo con el nuevo anfitrión, manteniendo datos locales desechables. `smoke-core.ts` conserva su fixture independiente de núcleo; el candidato completo del instalador queda fuera de este paso.

## Fuse comprobado en Windows

Con `VANTARE_HUB_CANDIDATE_ROOT` apuntando a la raíz devuelta por package-qa:

```powershell
node --experimental-strip-types scripts/check-asar-integrity.ts
```

Crea una copia temporal por vez del hub-ui de la generación sellada: intacta, índice asar manipulado y contenido del main manipulado. La intacta debe mostrar el núcleo simulado; las otras deben terminar con error de integridad. Hay plazo máximo para cada arranque. Se guarda result.json con raíz, generación, hash del manifiesto, SHA-256 del asar original y stderr. Cada copia se elimina al acabar su prueba; el candidato se conserva para medición y revisión.

La prueba del 10-nov-2026 con Electron 45.2.3 en Windows pasó las tres condiciones: `Integrity check failed ... <header>` y `ASAR Integrity Violation ... hash mismatch` en las copias alteradas. Evidencia local: `D:/VantareServer/qa/isa-1995-package/asar-dafe4cc1bd1379b8/result.json`. Esto verifica el fuse y el recurso PE embebido por packager en esa plataforma; no sustituye la firma ni la prueba pendiente de Windows 10.

Esa primera prueba precedía al sellado del candidato; el cierre de la review exige la repetición desde la generación sellada y su result.json con hash. No confundir ambas tandas. El smoke de una generación sellada queda en `package-host/host-smoke.json`; los tiempos de esa tanda con compilación activa no son una medida de rendimiento.

Para lanzar el candidato aislado se necesitan `VANTARE_NATIVE_DATA_ROOT=<generación>/data`, `VANTARE_BOOT_TOKEN=<32 hex aleatorios>` y `--control-stdin --data-dir <generación>/data/hub --layout <generación>/data/layout.json --pipe <nombre de pipe QA inexistente>`. Mantener stdin abierto hasta querer cerrar; cerrarlo finaliza el anfitrión y su Job Object. El token debe coincidir con hub-ready. No lanzar el EXE suelto sin ese contexto: intentaría redirigir al supervisor Vantare.exe, que este candidato mínimo no contiene. El script de lanzamiento de QA automatiza este contexto, sin tocar instalación ni servicios reales.

Al terminar la revisión y medición, Isaac puede eliminar exclusivamente las raíces `candidate-*` devueltas por el script y sus ZIP/SHA256SUMS vecinos bajo su namespace QA; no son targets ni datos instalados. La eliminación de las tres copias iniciales antiguas fue rechazada por aprobación automática de la herramienta y queda pendiente de limpieza por Isaac. Las tandas nuevas limpian solo sus copias temporales verificadas.

El paquete conserva únicamente es y en-US. RunAsNode, NodeOptions, CLI inspect y privilegios extra de file están cerrados; carga exclusiva desde asar e integridad embebida están activadas. El CDP del candidato solo existe en la compilación QA, no en distribución.

La prueba de Windows 10 está en [windows-10-qa.md](windows-10-qa.md). Las cifras de rendimiento deben salir de mediciones repetidas con la cola vacía; no usar tiempos del smoke como rendimiento de producto.
