# Hub: análisis histórico nativo — ISA-1430 / ISA-1429

Worker Codex; review obligatoria del diff completo por Claude Opus 5.5.
Issues: [#1430](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1430)
y [#1429](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1429).
Worktree `C:/tmp/vw3-hub-analisis/vantare-v2`, rama
`vantareapp/isa-1430-w-hub-analisis`, base entregada `a6cd70ab8c7abdcc700c74105fee5ffa2fd36a69`.
Se conserva esta base de integración de las fases, sin cambiarla por Nightly.
Fetch de `origin/nightly` verificado el 2026-09-30: `f29b5fee04022756f9ae59f19bf153f91eebe4ed`;
se consultaron sus dos AGENTS, sin mover HEAD ni rebasar la rama entregada.
Notion no disponible: excepción explícita del encargo de Isaac; no se afirma
lectura, escritura ni seguimiento operativo completado. GitHub se consultó
en lectura; sin push, PR, merge, promoción ni release.

## Recorrido y contratos

1. Hub descubre archivos `.duckdb` regulares en el directorio explícito,
   sin recursión ni seguimiento de symlinks de archivos. Directorio inexistente
   devuelve «Sin grabaciones», sin crear carpetas ni bases.
2. Al elegir una grabación arranca `vantare-storage.exe` adyacente al Hub,
   siempre con `--read-only`. DuckDB permanece en su proceso propietario;
   Hub no depende de runtime/storage ni añade librerías.
3. Resúmenes calculados por el `SeriesAnalysis` existente, leyendo páginas
   de 16 chunks; la proyección conserva `LapSummary`, calidad, huecos, seal
   y ventana observada. Se muestran IDs/contadores reales; el esquema no
   contiene nombres de circuito/coche ni fecha de sesión. El nombre del
   archivo identifica la grabación, no se inventan esos metadatos.
4. Selección A/B por segmento (`first_chunk`, además de época/sesión/coche/vuelta).
   Comparación solo dentro de la misma época, sesión y coche; el esquema no
   permite demostrar equivalencia de circuitos entre grabaciones.
5. Muestras de las vueltas seleccionadas mediante `plot-page`, sin SQL
   arbitrario. El watermark se verifica de nuevo antes de comparar; si cambia,
   se exige recargar. Reader se libera tras cada consulta/comparación.
   También se comprueba la identidad de cada chunk frente al resumen elegido.
6. Proyección pura en `hub/src/analysis/model.rs`: velocidad km/h, pedales %, y
   delta A−B en segundos por distancia. Interpolación lineal del tiempo fiable
   de B entre vecinos contiguos, sin extrapolación. Delta positivo: A más lento.
   No hay delta si `LapSummary.gap` es true en alguna vuelta. Las muestras
   ausentes/de calidad no fiable y los retrocesos cortan los paths.
7. GPUI dibuja paths/quads sobre un dominio de distancia común a las cuatro
   gráficas. Se submuestrea después de proyectar/calcular delta, a 1024 puntos
   por canal/vuelta, conservando extremos y cortes entre segmentos. El muestreo
   uniforme puede omitir picos breves; no es visualización de cada muestra.

La consulta y proyección ocurren en background, nunca dentro de render.
El cliente limita frames a 2 MiB, espera hasta 30 s por respuesta y revisa
cancelación cada 100 ms. Al salir del Hub se cancela la lectura; Drop del
reader termina y espera al helper propio y une su pump. No se promete
supervisión ante muerte abrupta del Hub por el SO.

`finished` confirma cierre del productor, no integridad de vueltas. Se muestra
pérdida final `attempted-watermark` cuando es conocida, o desconocida tras
EOF/caída. Writer activo se detecta por lock real de DuckDB: no se infiere de
`finished=false`. Versiones ajenas fallan sin migrar/escribir originales.

## Límites deliberados

- Hasta 256 grabaciones por directorio; exceso visible exige acotar directorio.
- Retención de 255 resúmenes cerrados más una activa; total mostrado permite
  ver si faltan segmentos anteriores en esta vista. No catálogo multisesión SQL
  nuevo ni índice de resúmenes persistido.
- Hasta 1.000.000 muestras/entradas de cobertura por vuelta seleccionada;
  exceso falla explícitamente, sin gráficos truncados. Al resumir una grabación
  enorme se puede agotar el plazo de 30 s; se conserva el original.
- Señales actuales: distancia/tiempo/velocidad/acelerador/freno. Sin volante,
  3D, curvas de combustible, importación de DB Go/LMU, live, licencias remotas,
  recomendaciones ficticias ni runtime/núcleo/widgets/kit modificados.
- El producto Orbit actual usa sesiones reales vacías y demo explícita: se porta
  el recorrido funcional pedido sobre storage fase 4; no se afirma paridad
  visual aprobada ni paridad total del servicio Go de importación/staging.
- Captura GPUI física, LMU/OBS, rendimiento y empaquetado de storage adyacente:
  pendientes de reproducción y revisión del orquestador. Fixtures no los prueban.

## Reproducción

Desde `native/`, siempre máximo dos jobs:

```powershell
cargo build --offline -p vantare-storage -p vantare-hub -j 2
target/debug/vantare-hub.exe --analysis --recordings C:/ruta/grabaciones
# Sin --recordings: <data-dir>/recordings; --data-dir conserva contrato previo.
```

En la sección Telemetría / Análisis: comprobar vacío con carpeta inexistente,
recargar, elegir DB propia v1, escoger A/B de una sesión, revisar medias/calidad
y los cuatro gráficos. Repetir con writer activo: mensaje de base bloqueada;
con versión desconocida: incompatible. Comparar hash del original antes/después.
Las vueltas sin seal y las ventanas observadas permanecen etiquetadas.

Smoke automatizado crea DB temporal sintética por el writer real, finaliza,
consulta resúmenes/páginas desde el cliente Hub, compara delta y ceros/ausencias,
comprueba bytes originales intactos y exclusión por un writer real en otro
proceso. Requiere binario storage compilado; falla si falta, nunca pasa en vacío.

```powershell
cargo test --offline -p vantare-hub -j 2 analysis -- --nocapture
cargo fmt --check
cargo clippy --offline --workspace --all-targets -j 2 -- -D warnings
cargo test --offline --workspace -j 2
```

Pruebas puras: alineación/interpolación de distancias sin extrapolar, calidad
ausente distinta de cero, discontinuidades/reinicio de distancia, 60.000 muestras
submuestreadas y dominio común. Storage añade smoke de su protocolo read-only
con `SeriesAnalysis` canónico, calidad y versión incompatible.

## Evidencia de gates y entrega

Ficheros de esta entrega:

- `native/hub/src/analysis/{mod,model,reader,view,tests}.rs`: módulo, proyección,
  cliente read-only, UI GPUI y smoke respectivamente.
- `native/hub/src/{lib,main,shell}.rs`: registro del módulo, CLI y sección.
- `native/storage/src/{lib,inspection,tests}.rs`: comandos públicos de lectura,
  proyección de `SeriesAnalysis`/muestras y smoke del protocolo.
- `native/storage/{Cargo.toml,README.md}`: referencia directa a `vantare-domain`
  ya existente en dev-dependencies (Quality), y contrato stdio. Sin paquete ni
  versión nuevos y sin cambios en Cargo.lock.
- Este documento. Handoff vivo compartido y Notion siguen a cargo del orquestador.

Gates completos del workspace ejecutados el 2026-09-30, con código de salida 0:

- `cargo fmt --check`: correcto.
- `cargo clippy --offline --workspace --all-targets -j 2 -- -D warnings`:
  correcto, sin warnings (24 s con caché).
- `cargo test --offline --workspace -j 2`: 548 tests correctos más 11 casos
  del harness lifecycle propio; 0 fallos, 4 pruebas live ignoradas por requerir
  LMU/ACC activos. Hub: 23 tests; storage: 13. Incluyen cuatro proyecciones
  puras, smoke Hub de lectura/bloqueo y vacío, y smoke del protocolo storage.

La primera ejecución reprodujo un fallo del smoke de lock: DuckDB Windows
devuelve `File is already open in` junto con un mensaje del SO en español.
Se añadió esa variante a la clasificación y una comprobación de regresión;
el smoke real vuelve a abrir un writer y verifica el bloqueo. No se rebajó
el test. Log previo conservado en `native/target/hub-analysis-tests-initial.log`;
gates posteriores en `hub-analysis-clippy.log` y `hub-analysis-tests.log`.
La compilación inicial de tests tardó 43 min 58 s (GPUI/DuckDB, dos jobs);
es coste de compilación, no evidencia de rendimiento de la aplicación.

Primer hito local (API storage):
`96e3ce93003cc92ad232b8463375a641bf0c772b`. El hito Hub/documento se registra
en el reporte de entrega; no se incrusta su SHA en el propio commit.
Antes de ese segundo hito se repitieron los tres gates: todos con código 0,
los mismos 548 tests más 11 lifecycle correctos y 4 live ignorados. Clippy
terminó sin warnings en 25,96 s (incluye espera del lock de caché compartida).
Logs en `native/target/hub-analysis-{clippy,tests}-final.log`.

No se ejecutan Go/frontend porque no se modifican. Sin CI remoto (sin push/PR),
sin prueba física de la ventana GPUI, LMU ni OBS. La revisión de Opus incluye
retención, directorio definitivo, empaquetado del helper adyacente y plazo
de consulta; no hay pregunta que bloquee estos commits locales.
