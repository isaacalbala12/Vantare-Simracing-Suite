# ADR 0101 · Widgets: una proyección, un estado, varios Looks

Aceptado por Isaac para #1531; integrado en la base `ca17545f`. Aplicado a
Standings, Relative, Delta y Fuel. La extensión a otros widgets es trabajo de
producto para una versión siguiente; #1566 exige Pedales antes de vender.
[Histórico completo y evidencia por SHA](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/ca17545f607b85f5d47dc9d060721b69e6a6a158/vantare-v2/docs/adr/0101-widgets-looks-common-state.md): conserva rondas, perfiles, capturas, fallos, excepciones y procedencia. El diario vive en [#1531](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1531); compactación documental [#1561](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1561).

## Decisión

Los Looks son parte central del producto. Eficiencia y Vantare conservan sus tokens,
geometría y animación. El módulo común posee un único Board y Motion por widget.
`domain/src/<widget>.rs` proyecta los hechos y su calidad una vez por ingest, sin Look.
No anida dos proyecciones ni duplica filas o historial de consumo por compatibilidad.
`ui/src/look.rs` define el enum, nombres persistidos y capacidades. `registry.rs`
conserva una entrada por widget; Desktop, Studio y Workshop consumen esa misma API.

Cada módulo UI tiene pintores Eficiencia/Vantare. Reciben Board y presentación;
no reciben Snapshot ni acceden a IPC, persistencia, permisos o posición de pantalla.
Solo existe el pintor activo en `Presentation::{Eficiencia { visual, motion },
Vantare { visual, motion }}`. Ambos brazos poseen el mismo tipo de Motion común,
con una política de interpolación por Look. Al cambiar Look se conserva el Arc
completo: historial por CarId, avisos, interpolaciones, fades, tira y sus relojes.
La geometría se recompone sobre el mismo Board sin reiniciar los tiempos ni
invocar project. No hay un segundo motor dormido ni enums visual/Motion emparejados.
Las copias efímeras de un Frame/cache de pintado no son otra fuente de datos.
Standings Eficiencia lee el Plan común del dominio, con filas Arc del Board y CarId:
ventana del jugador, truncado, bandas multiclase, posiciones y vueltas son contenido
común. El pintor no construye otra VM ni vuelve a ordenar las filas.

## Layouts guardados

Sigue el documento v1: `designSystem`, `style`, `accent`, `templateId`, columnas,
posición, tamaño, opacidad y marca conservan sus nombres. Look desconocido conserva
el fallback Vantare. La migración es en memoria, sin reescribir el archivo al abrirlo.
`contentVersion` distingue contenido normalizado del layout histórico: aplica una
vez el filtro que antes imponía Vantare; después el filtro es independiente del Look.
Guardar y recargar conserva el Look y ese contenido, también después de alternarlos.

## Cómo añadir un Look

1. Añadir variante y metadatos en `ui/src/look.rs` (incluido `ALL`).
2. Añadir un archivo de pintor por widget en `ui/src/<widget>/`; conectar el enum
   local de presentación y su política visual. Reutilizar Board y Motion comunes.
3. Añadir un test/caso de estilo con geometría, animación y captura de referencia.
   Las pruebas por `Look::ALL` exigen una proyección por ingest y cambio sin reset.

No añadir ramas sobre estilos concretos a Hub, Studio, registry ni domain. El test
arquitectónico recorre UI/Hub/domain, prohíbe has_variants()/legacy() y limita
referencias concretas a look.rs y cada módulo UI de widget. Si el Look necesita un hecho nuevo, ampliarlo en la proyección común;
no crear otra proyección ni historia. No se introduce un registro genérico o un trait.

## Verificación y riesgos

Baseline compilado antes del primer widget; misma fuente, fuentes/DPI y configuración
para capturas RGBA antes/después sin máscaras, umbral 0 y porcentaje máximo 0.
Goldens existentes permanecen intactos. Escenas secuenciales y tests con reloj inyectado
protegen reordenaciones, cruces, récord y repostaje de cada política visual.
Medir project/ingest/frame con el mismo corpus, invalidaciones y asignaciones; las
mediciones locales no demuestran CPU del juego ni latencia real de LMU/OBS.
Los riesgos principales son semántica de gaps/calidad, migración de filtros y pérdida
de avisos. Se valida y entrega un widget antes de pasar al siguiente.

La proyección incremental de Standings compara hechos exactos en el propio Board:
contenido, preferencias, sesión/fuente, clima/banderas y hechos por CarId. No guarda
Snapshot ni clave de Look; secuencia/inputs ajenos a la clasificación no invalidan.
Un cambio de hechos o de referencia global invalida y produce el mismo Board que
una proyección en frío. Hay tests de ambas invalidaciones y de una llamada por ingest.

### Contratos de calidad e historial

El Board conserva los hechos de ambos Looks con calidad explícita. Fuel tiene
un solo historial canónico `HistoryEntry { lap, consumed: Option<f64> }`;
las entradas inválidas conservan posición y ambos pintores derivan del mismo
historial. Un overflow devuelve ausencia/Plan::Unknown, nunca envuelve contadores.
Los formatos opcionales y la demanda no crean contenido dependiente del Look.
La API actual conserva `standings::Look` (Neo/Neutro) y el alias `DesignSystem`;
su renombrado pertenece a PR-3 de #1561, sin cambiar nombres serde.

### Gate y límites aceptados

Cinco A/B intercaladas, procesos separados y corpus real: mediana p50 de
ingest/frame ≤1,03× máximo baseline, p99 ≤1,05×; frío ≤1,5× Vantare anterior.
No recalibrar umbrales, goldens ni máscaras para obtener aceptación.
Delta Eficiencia ACC conserva FAIL p99 (ingest +13,04%, frame +11,97% en la
ronda aprobada), aceptado por magnitud con asignaciones/bytes/trabajo iguales,
sin causa de ruido demostrada. La excepción no se generaliza a otros cambios.
Standings/Relative con slots muestran vueltas disponibles en ambos Looks;
el cambio de footer fue aceptado explícitamente y conserva ausencia/Stale.
La integración no repite la matriz A/B ya aprobada por decisión de Isaac:
compara Standings ACC contra entrega `8da5394e`/árbol equivalente `569fa5ef`,
con asignaciones, bytes y trabajo iguales muestra a muestra. La repetición
temporal parcial conserva su FAIL p50 (3,0 frente a 2,8 µs); no se convierte
en un gate nuevo ni se declara ruido. Detalles y logs en el permalink anterior.

Evidencia registrada de integración: 366 pares RGBA exactos, 32 capturas v9,
ocho slots ES/EN aceptados; fmt/check/Clippy PASS, Nextest 1574/1574 (7 skips),
lifecycle 18/18 y telemetría 25/25. No reejecutada al recortar este ADR.
Las deudas de goldens previos se conservan: Standings 85,37%, Relative con
tamaño distinto, Delta 81,71% y Fuel 680×204 frente al par histórico 523×272.
No renovar referencias para ocultarlas. Los pares de refactor no certifican
paridad contra toda referencia histórica, CPU del juego ni latencia LMU/OBS.
