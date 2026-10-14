# Evidencia #1605 · VANTA-12

Consulta y medición 14/10/2026. Investigación oficial conservada y banco CLI de tres repeticiones por carga permitida. **18 tomas descriptivas de TinyPedal y del host QA de Vantare; nueve de RaceLab bloqueadas por Firewall/acceso sin cuenta.** El resumen final y el CSV dan el recuento verificado. La suite Vantare completa no está medida.

| Archivo | Contenido y límites |
| --- | --- |
| `1605-sources.json` | Fuentes oficiales con fecha, HTTP y hashes; respuestas completas fuera de Git. Catálogo, precios y release 2.51.0 reconsultados por CLI. |
| `1605-racelab-browser-facts.json` | Observaciones iniciales de planes en web; no acredita permisos en la app. |
| `1605-catalog-racelab.json`, `1605-catalog-tinypedal.json` | 30 entradas web RaceLab y 78 apartados de guía TinyPedal; unidades distintas, sin ranking. |
| `1605-vantare-evidence.json` | Base de código 69fa2d65, rangos y hashes. La build medida procede de bc89c8b8, Release 0.0.976. |
| `1605-hardware.json` | CPU/GPU/RAM/SO/driver sanitizados; sin identidad ni seriales. |
| `1605-artifacts.json` | Descargas/hashes/versión real y estado actualizado de apps propias. |
| `1605-preflight-t3-initial.json` | Preflight histórico anterior a la corrección 01:05. Sus cero tomas/bloqueo no son el estado final. |
| `1605-preflight.json` | Corrección aplicada, lock propio, ausencia de permiso Firewall y SHA de colectores externos. |
| `1605-measurements.csv` | Una fila por producto/escenario/repetición, con métricas reales o ausencia explícita y enlace a muestras. |
| `1605-summary.json` | Mediana de tres repeticiones y rangos, con carga de fondo. No mezcla productos ni fuentes. |
| `1605-raw/*.json` | Muestras individuales: CPU acumulada por PID, working set, bytes privados, hilos, contadores GPU y carga global/builds; títulos/rectángulos solo de ventanas propias. |
| `1605-tinypedal-four-enabled.png` | Captura PrintWindow de la ventana propia: 4/78 widgets habilitados, API LMU sin datos. No contiene el escritorio ajeno. |
| `1605-vantare-qa-four.png` | Captura PrintWindow del host QA con cuatro widgets y datos sintéticos genéricos; sin Hub ni escritorio ajeno. |
| `1605-validation.json` | Auditoría de consistencia/recalculo y enlaces; no test de producto ni prueba live. |

CPU es porcentaje de los 16 procesadores lógicos del PC: incremento del tiempo CPU de los procesos atribuibles / intervalo real / 16 × 100. En reposo/overlays se omite la primera muestra de baseline y se integra sobre intervalos; RAM/hilos son la mediana temporal. El resumen toma la mediana de esas tres cifras por escenario. Working set suma memoria compartida en varios procesos; bytes privados se incluyen para interpretarlo.

GPU: PDH English `\GPU Engine(*)\Utilization Percentage`, instancias cuyo PID pertenece a los árboles propios. Se suman procesos por adaptador/motor y se toma el máximo entre motores, sin sumar motores entre sí. Instancia ausente/error es null, nunca cero; media temporal por toma y mediana de tres tomas válidas. No es utilización global de la tarjeta ni FPS.

Arranque es desde Popen hasta la primera ventana propia visible por EnumWindows, muestreado aproximadamente a 100 ms. La enumeración añade retraso: es un límite superior con resolución variable, no tiempo hasta datos/interfaz plenamente usable. CPU/RAM/hilos de esa fila se resumen solo sobre la ventana de arranque. Las seis tomas finales usan startup_probe.py sin PDH; GPU de arranque queda ausente para evitar latencia del contador en el endpoint. Se excluyeron los probes iniciales. Reposo/overlays: 30 s de calentamiento y 60 s con cadencia objetivo de 1 Hz. PDH puede alargar intervalos; cada archivo conserva dt_s, duración y recuento efectivo de muestras.

TinyPedal: GUI y API LMU a la espera, sin juego; reposo con 0 widgets, carga con Standings/Relative/Fuel/Flag. Vantare: únicamente el host QA de overlays, sin Hub/supervisor/core/Engineer. Reposo con layout vacío y feed local aún activo; carga/arranque con esos cuatro tipos en una ventana por monitor, fuente sintética local 30 Hz. El Hub probado quedó en acceso sin supervisor y se excluyó. No mide la instalación ni la suite completas. Dimensiones, cantidad de filas, refresco, oclusión y fuente no se igualaron. Son cargas descriptivas diferentes. PC con aplicaciones ajenas y builds/tests activos; cada muestra conserva CPU global, RAM libre y nombres de procesos de build, sin sus argumentos o rutas. No acredita un banco quieto ni un ranking.

No se versionan instaladores, binarios, logs privados, credenciales, SIDs, pilotos reales o capturas del escritorio. Colectores y portables quedan en C:/tmp/1605-research. El informe describe comandos y fórmulas para repetir; los SHA fijan el método concreto de esta campaña. RaceLab necesita una decisión manual de Isaac sobre Firewall y una vía autorizada de acceso gratuito antes de medir; no se cambió la seguridad ni se usó su cuenta.
