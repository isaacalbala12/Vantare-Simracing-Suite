# Fuentes, método y límites clean-room

Fecha de acceso: 2026-07-27. Las páginas de producto cambian; volver a validar precios, planes y compatibilidad antes de una decisión comercial. Se consultaron fuentes primarias: manuales, documentación, FAQ, precios y políticas de cada proveedor. No se toman blogs, vídeos o foros como prueba de funcionalidades técnicas.

## Método

Se partió de la pregunta del producto y de una matriz consistente: problema, flujo, modelo mental, fuentes, comparación, UI, sharing, almacenamiento, privacidad y empaquetado. Se contrastó la evidencia externa contra el código y la documentación del checkout GOV-01. Los hechos externos se citan en línea; los hechos del repo enlazan archivos versionados. La etiqueta de confianza significa: **media** para una fuente primaria directa y **alta** cuando dos fuentes primarias independientes sostienen el criterio. Las propuestas Vantare no se presentan como características existentes.

## Fuentes primarias externas

| Producto / tema | Fuente primaria | Evidencia aprovechada |
|---|---|---|
| MoTeC i2 | [MoTeC i2](https://www.motec.com.au/products/I2) | workbooks, informes de canal, cursor/zoom enlazado, gating, alineación gráfica y matemáticas bajo demanda (media) |
| MoTeC i2 | [i2: importación y vídeo](https://www.motec.com.au/products/i2) | vídeo sincronizado, exportación CSV e importación Pi ASCII (media) |
| Garage 61 | [About](https://garage61.net/about), [uso](https://garage61.net/docs/usage) | agente, análisis, setups/ghosts, leaderboard y equipos (alta) |
| Garage 61 | [novedades de analizador](https://garage61.net/whatsnew), [mapa](https://garage61.net/whatsnew/202302181043) | delta primero, distancia de línea, tabla de vueltas, notas y mapa de trazada (alta) |
| Garage 61 | [privacidad](https://garage61.net/docs/privacy), [controles de sharing](https://garage61.net/docs/usage/privacy) | portabilidad CSV, no es backup de originales y permisos globales/equipo (alta) |
| VRS | [FAQ](https://virtualracingschool.com/faq/), [pricing](https://virtualracingschool.com/pricing/) | logger cloud, Driving Analyzer, Data Packs, equipos y límites de plan (alta) |
| VRS | [guía de telemetría](https://virtualracingschool.com/academy/iracing-career-guide/before-you-get-started/software/) | comparación fiable exige condiciones y setup comparables (media) |
| Coach Dave Delta | [FAQ](https://coachdaveacademy.com/documentation/coach-dave-delta-help-centre-the-complete-faq-guide/), [comparar vueltas](https://coachdaveacademy.com/documentation/how-to-compare-laps-in-delta/), [Delta 5.4](https://coachdaveacademy.com/announcements/introducing-delta-5-4-with-a-new-ui-and-smarter-ai/) | sesión, referencias, mapas, compartir temporal, .delta y nube/local; la actualidad del proveedor se trata como marketing hasta contrastar el comportamiento documentado (alta/media) |
| Coach Dave Delta | [Auto Insights](https://coachdaveacademy.com/documentation/how-to-use-auto-insights-ai-coaching-in-delta/), [vídeo](https://coachdaveacademy.com/documentation/how-to-use-video-analysis-in-delta/) | fases de curva, referencia alcanzable y vídeo + telemetría (alta) |
| Track Titan | [sitio oficial](https://www.tracktitan.io/), [pricing oficial](https://app.tracktitan.io/pricing) | free con análisis/teórica y overlay; pago por tips, referencias y plan (media; verificar el plan en compra) |
| trophi.ai | [producto](https://www.trophi.ai/), [RTSA](https://www.trophi.ai/sim-racing-features/rtsa), [release 1.91](https://www.trophi.ai/updates/1-91-0) | coaching live/post-sesión, planes adaptativos y chat sobre gráficos; claims de rendimiento siguen siendo marketing (alta/media) |
| Z1 Analyzer | [mapas](https://paddock.z1racetech.com/manual/analyzerMaps.cfm), [análisis](https://paddock.z1racetech.com/manual/analyzerAnalysis.cfm), [manual](https://www.z1simwheel.com/dashboard/manual/Z1_User_Manual_English_5_3_2018.pdf) | curvas desde bordes, side-by-side, replay y persistencia de layout (alta/media; parte del manual PDF es antiguo) |
| Sim Racing Telemetry | [help](https://www.simracingtelemetry.com/help.html), [flujo AC](https://www.simracingtelemetry.com/games/AC/) | grabación explícita, estado de conexión, solo vueltas completas y archivo local (alta) |
| Alternativa LMU | [Telemetry Racing](https://telemetry.racing/) | LMU/rF2, comparación y sharing declarados por el proveedor (media) |

## Evidencia local y restricciones

La evidencia de LMU procede del repo: [auditoría raw](../../../telemetry-core/lmu-raw-acquisition-audit.md), [driver Shared Memory](../../../telemetry-core/lmu-shared-memory-driver.md), [driver REST](../../../telemetry-core/lmu-rest-driver.md), [matriz de autoridad](../../../telemetry-core/lmu-authority-matrix.md) y [catálogo](../../../telemetry-core/signal-catalog.md). Además, el root observó en modo read-only el 2026-07-27 ~22:28 LMU v1.3000 y SimHub abiertos: `UserData\\Telemetry` escribía una sesión `.duckdb` con su `.duckdb.wal` y una sesión COTA previa ocupaba aproximadamente 99,6 MB. Esta observación demuestra formato de biblioteca histórico DuckDB/WAL activo, no un archivo MoTeC genérico; no se abrió ni modificó el contenido live. La presente auditoría no leyó `.env*`, secretos, credenciales, tokens ni datos personales, y no abrió, cerró ni controló LMU/SimHub.

No se encontró un parser o integración de importación de archivos MoTeC ni un lector de `UserData\\Telemetry` en el checkout. `cmd/lmu-dump` exporta CSV de una lectura live de depuración, no es un formato histórico de producto. Los `*.bin` LMU versionados son fixtures sanitizadas y no constituyen una biblioteca de sesiones de usuario. Un futuro indexador DuckDB debe exigir ausencia de WAL y una ventana de estabilidad antes de usar una copia o apertura read-only demostrada; nunca puede leer un WAL activo ni solicitar o forzar un checkpoint sobre la biblioteca del usuario.

## Licencia y clean-room

La investigación permite patrones de problema (comparar por distancia, trazar una curva, enlazar cursor y mapa), pero no código, assets, textos, nombres visuales ni configuraciones propietarias. No se adquirió software ni se aceptó trial. Un futuro importador debe verificar la licencia y documentación de cada formato antes de soportarlo; MoTeC puede importar formatos específicos según licencia, pero esto no autoriza ingeniería inversa ni implica compatibilidad de Vantare.

## Gaps comprobables

No se pudo verificar hands-on los flujos autenticados de Garage61, VRS, Track Titan, Delta o trophi.ai sin registro. No se obtuvo un archivo LMU histórico legal de `UserData\\Telemetry` en este worktree. No se afirma que la tabla de precios o los simuladores soportados sigan iguales tras esta fecha. Estos límites se conservan como riesgos en el plan.
