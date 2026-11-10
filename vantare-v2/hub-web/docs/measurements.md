# Medición reproducible en Windows

No usar el tiempo del smoke como medida de producto: incluye compilación concurrente, copias nuevas y CDP. El método final compara los dos Hubs Release en el mismo equipo, sin compilación durante toda la serie.

1. Compilar anfitrión y GPUI con `scripts/build-measure.ps1`, siempre dentro de `native/scripts/compilar.ps1`; copiar artefactos antes de liberar el slot. Guardar SHA del código y hashes de los EXE. Actualizar el anfitrión Release si cambió después de esta compilación.
2. Crear el candidato QA con ese anfitrión Release y la interfaz empaquetada. Usar `VANTARE_HUB_BUILD_PROFILE=Release`. Validar sus hashes, fuses y asar. No usar el candidato Debug para comparar tiempos.
3. Definir rutas absolutas `VANTARE_HUB_QA_ROOT`, `VANTARE_HUB_CANDIDATE_ROOT`, `VANTARE_HUB_GPUI_BINARY` y `VANTARE_HUB_EVIDENCE`, todas con datos desechables en D:. Ejecutar `node --experimental-strip-types scripts/measure.ts` en un escritorio interactivo. Exige al menos diez arranques por grupo; diez es el valor por defecto.
4. La herramienta reserva ambos mutex de la cola, o falla sin medir si alguno está ocupado. No mata compilaciones ajenas. Se ejecutan diez arranques fríos y diez calientes de cada Hub. No se descartan valores lentos. Los JSON conservan cada muestra, mediana, mínimo y máximo.

Frío significa vaciar la lista standby del SO mediante `NtSetSystemInformation` con `SeProfileSingleProcessPrivilege`, con todos los procesos medidos ya cerrados. No significa simplemente proceso nuevo ni perfil nuevo; tampoco equivale a reiniciar Windows. Si el privilegio no está disponible o la llamada falla, la tanda falla: no se etiqueta como fría una muestra caliente. Caliente conserva la caché del SO entre arranques.

El inicio es la creación del proceso del anfitrión o GPUI (`Process.StartTime` del SO). El final es la primera ventana superior visible de esa familia con tamaño mayor de 200×100; muestreo externo de 5 ms, idéntico para ambos. La navegación posterior a Ajustes no forma parte de ese tiempo. Electron confirma General mediante su UI real; GPUI abre Ajustes por UI Automation y confirma Apariencia visible. No se usa modo captura en la medición GPUI.

Tras confirmar Ajustes se dejan diez segundos de reposo. Se suman los working sets de anfitrión y todos sus descendientes desde Toolhelp; el GPUI usa el mismo cálculo. CPU es la suma de tiempo de CPU en cinco segundos, expresada como porcentaje de **un núcleo** (no dividida por el número de procesadores). El heap del renderer sale de Runtime.getHeapUsage por CDP QA, sin forzar GC. Ese muestreo se realiza después de la ventana de CPU. Se conserva el coste de instrumentación QA como límite del método.

El anfitrión QA registra `first_walk_us` (lectura del estado, vínculo y primer recorrido) y `verify_walk_and_hash_us` (segundo recorrido y hashes de todos los archivos). Esto permite separar su coste del tiempo completo hasta ventana; no se elimina la verificación para mejorar una cifra.

Objetivos: frío ≤900 ms, caliente ≤600 ms, working set total ≤250 MB, heap renderer ≤60 MB. El dato histórico de GPUI, 343 ms, se muestra como referencia; la comparación válida usa las veinte muestras nuevas del mismo equipo. Tamaños: informar bytes y MiB de la carpeta y ZIP del candidato, con perfil de compilación y contenido; no comparar todo Vantare con solo el Hub.

La salida conserva muestras aunque falle una tanda; no genera estadísticas finales con menos de diez valores por grupo. También exige que no sobreviva ningún proceso de cada familia al cerrar. El cierre por Live se prueba aparte con supervisor/núcleo QA y el mismo anfitrión e interfaz, registrando PID antes y después; el mero cierre de ventana no sustituye esa prueba.

Si no se cumplen objetivos, probar por separado optimizaciones baratas y repetir el mismo método. La base ya usa pantallas diferidas, fuentes locales, caché V8, dos locales, un renderer, sin corrector ni DevTools en distribución. Desactivar GPU requiere verificar apariencia y volver a medir; el proceso GPU puede seguir existiendo como proceso de software. Una caché de integridad por mtime/tamaño o confiar solo en la instalación cambia la garantía de seguridad y se propone a Isaac, sin introducirla silenciosamente.
