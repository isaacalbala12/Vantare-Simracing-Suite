# Evidencia #1605 · VANTA-12

Consulta 14/10/2026. Investigación documental y preparación del banco. **Cero mediciones ejecutadas.** No confundir inventario de hardware o descarga de binarios con una prueba de rendimiento.

| Archivo | Contenido y límites |
| --- | --- |
| `1605-sources.json` | URLs oficiales, fecha, HTTP, tamaño y SHA256 de respuestas; no se versiona su contenido completo. Webs/wiki pueden cambiar. |
| `1605-racelab-browser-facts.json` | Hechos contrastados en DOM: checks/cruces del plan y ayuda Basic. No es una prueba de entitlement real. |
| `1605-catalog-racelab.json` | 30 entradas del catálogo web; no un inventario de widgets ejecutados. |
| `1605-catalog-tinypedal.json` | 78 encabezados de widgets de la guía vigente; no garantiza cada señal en cada juego. |
| `1605-vantare-evidence.json` | SHA de base, fuentes locales, rangos de líneas y hashes para revisar afirmaciones de código. |
| `1605-hardware.json` | Inventario CIM con modelo CPU/GPU, capacidad RAM, versiones de SO/driver; sin identidad/seriales. |
| `1605-artifacts.json` | Hashes de archivos oficiales/preparados y estado de instalación/ejecución. Binarios quedan fuera de Git. |
| `1605-preflight.json` | Fecha/hash del gate #1565, corte exigido, lock y cero lanzamientos. Sin contenido de otros buzones. |
| `1605-measurements.csv` | Las 27 tomas previstas con `NOT_RUN`; todas las métricas vacías. **No es una captura de muestras.** |

El CSV enumera producto, escenario y repetición (1–3). CPU se reserva en porcentaje del PC completo; RAM working set y bytes privados en MiB; GPU por motor en porcentaje; hilos como recuento y arranque en milisegundos. Sin ejecución no se calcula media, pico, mediana ni ranking.

Rutas/usuarios de Windows, SIDs, nombres de pilotos, telemetría real, credenciales, capturas de escritorio y mensajes de Discord no se incluyeron. Los hashes del gate permiten comprobar el archivo observado sin publicar su contenido. Las fuentes oficiales son para hechos; las opiniones públicas del informe no se usan como benchmark.

Reanudación: señal FIN válida después del 14/10 a las 00:00, lock propio y vía de verificación de escritorio; seguir el protocolo del informe. Sustituir registros pendientes por muestras reales y un resumen de tres repeticiones solo después de completar cada escenario. Si una cuenta/demo/contador bloquea un producto, mantener ausencia explícita.
