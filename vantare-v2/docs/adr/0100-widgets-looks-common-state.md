# ADR 0100 · Widgets: una proyección, un estado, varios Looks

Aceptado por Isaac para #1531. Base: 5e1da3f6. Aplicación incremental: Standings, Relative, Delta, Fuel.

## Decisión

Los Looks son parte central del producto. Eficiencia y Vantare conservan sus tokens,
geometría y animación. El módulo común posee un único Board y Motion por widget.
`domain/src/<widget>.rs` proyecta los hechos y su calidad una vez por ingest, sin Look.
No anida dos proyecciones ni duplica filas o historial de consumo por compatibilidad.
`ui/src/look.rs` define el enum, nombres persistidos y capacidades. `registry.rs`
conserva una entrada por widget; Desktop, Studio y Workshop consumen esa misma API.

Cada módulo UI tiene pintores Eficiencia/Vantare. Reciben Board y presentación;
no reciben Snapshot ni acceden a IPC, persistencia, permisos o posición de pantalla.
Solo existe el pintor activo en un enum. El Motion común selecciona la política
visual activa: no retiene el motor del Look anterior. Al cambiar Look toma sus
CarIds y avisos, recompone la geometría sobre el mismo Board y transfiere los avisos
con el instante original. Cambiar presentación no invoca project ni reinicia un aviso.
Las copias efímeras de un Frame/cache de pintado no son otra fuente de datos.

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
arquitectónico recorre fuentes y limita referencias concretas a look.rs y cada módulo
UI de widget. Si el Look necesita un hecho nuevo, ampliarlo en la proyección común;
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
Gate aprobado: cinco tandas A/B intercaladas en procesos separados con el corpus
real y el Look activo. La mediana de p50 no empeora y la mediana de p99 del nuevo
queda dentro o por debajo de mín–máx de los p99 del baseline; no se afinan umbrales ni máscaras.
Proyección fría como máximo 1,5× Vantare anterior. Cifras y tandas en la evidencia externa.
El Motion Eficiencia reutiliza únicamente su Frame cuando Wake es Idle; una nueva
ingestión o restaurar avisos lo invalida. Vantare presta Motion/Plan/Opciones con Arc
al Frame; estas lecturas efímeras evitan clonar mapas y no son historiales dormidos.

Standings cerrado: 148 tests domain, 224 UI (2 ignorados), arquitectura y Clippy PASS;
48 pares de configuración + 4 reales + golden antes/después con 0 diferencias RGBA.
El golden versionado ya difería del baseline: se conserva y se registra esa deuda previa.
Cinco tandas A/B cumplen el gate. Frío LMU 98→116 µs (1,18×), ACC 44→55 µs (1,24×).
Las cifras por tanda y ambas fases están en evidence-1531/performance/standings-gate-five-rounds.json.
