# Corpus conservado · #1533

`manifest.json` registra SHA-256 anterior al borrado y ruta original en
`5e1da3f6`. `python native/retirement/verify.py` comprueba todos sus bytes actuales. La integración #1530 migra las etiquetas
DTO a v9 y actualiza solo sus pins y documentación: `source_sha256` conserva
el hash anterior, `sha256` fija el archivo migrado. Los JSON y los gzip
se compararon contra la base cambiando únicamente la etiqueta de versión;
`acc-all-v8.sha256` y la regresión de telemetría conservan el pin ACC original.
Se conservan corpus LMU/ACC, oráculos Strategy, referencias visuales y assets.

La entrega revisada `6094472e` (#1551/#1552), integrada por #1536, corrige
gaps de práctica LMU y posiciones ACC durante adelantamientos. Sus diez
artefactos derivados/documentales actualizan el pin actual: dos gzip LMU,
el pin ACC, cuatro fixtures/documentos UI y tres documentos/lista de
excepciones del oráculo/goldens. `revisions` registra commit, issues y hash
anterior; `source_sha256` y la migración previa #1530 se conservan. No cambia
el corpus fuente, los goldens Go ni el resto de los 456 archivos fijados.
Los tests de telemetría activados exigen la inversión estricta de estos
campos frente a las referencias anteriores y rechazan cualquier otro cambio;
ACC conserva también su pin y recorte de posiciones previos. El verificador
sigue exigiendo SHA-256 exacto para cada entrada, sin ampliar tolerancias.

Los catálogos Go de Engineer son texto de referencia inerte; los tests Rust
siguen comparando sus frases/voces. El seed de calendario (fixture del test de publicación; el Hub ya no lo usa) vive en `scripts/testdata/lmu-weekly-schedule-2026-08.json`,
su fuente textual en `scripts/testdata` y el perfil legado en `packaging/fixtures`.
Los archivos Go necesarios para reproducir se archivan en `tools/frozen-go`.
Los oráculos y sus pins existentes no se recalculan desde Rust.
Los tokens CSS de Discord y sondas/editorial Go/React se conservan como evidencia
inactiva en `legacy-evidence` (scripts con extensión `.txt`). No ejecutar sus
comandos históricos: requieren el checkout retirado. Los scripts independientes
de calendario, voz, marca y medición continúan activos. Supabase permanece íntegro.

#1562 migra 80 fixtures UI fijadas únicamente en su etiqueta DTO 9→10. Cada
revisión conserva el pin previo y la base ca17545f; la inversión byte a byte
reproduce ese pin, incluidos saltos de línea. Corpus crudo, gzip y pins de
goldens siguen intactos. Otras cinco fixtures UI no fijadas migran la misma
etiqueta. El verificador mantiene la exigencia SHA-256 exacta de los 456 archivos.

#1559 regenera `native/assets/icon.ico` con el logo con fondo en todos los tamaños: `source_sha256` conserva el pin anterior y `sha256` fija el ICO nuevo.

#1655 actualiza los cinco scripts activos de captura del Hub por encargo de
Isaac: comparador, alfa, capturador nativo, proceso y ventana. Las versiones
anteriores permanecen byte a byte en `legacy-evidence/hub-capture-before-1655/`
como `.txt` inertes; sus cinco hashes originales siguen fijados y se verifican.
Las entradas activas conservan `source_sha256` y añaden revisión al commit
`c3966a116`, issue y ruta del original. Con esos cinco originales archivados
se pasó de 456 a 461 archivos exactos. No ejecutar los scripts históricos:
activaban ventanas o capturaban
el escritorio. Las referencias PNG y los corpus conservan sus pins.

El README de referencias también conserva su original exacto como
`legacy-evidence/hub-capture-before-1655/README.md.txt`; el documento activo señala el protocolo
visible como histórico y remite al lote seguro. Su revisión es `65e4809d1`.
El verificador comprueba 462 archivos exactos; se conserva el pin original.

#1740 adapta los dos capturadores activos `compare.ps1` y `capture-alpha.ps1`
al helper de procesos GUI. Revisión de código `d18031249f0f8929816d1f2723a934151537ac9a`.
Sus versiones activas anteriores quedan intactas en
`legacy-evidence/hub-capture-before-1740/` como `.txt` inertes, con sus hashes
previos. Se mantienen `source_sha256`, originales anteriores a #1655 y todas
las revisiones; no cambia ningún corpus, PNG ni baseline de analizadores.
El inventario pasa a 464 archivos exactos. No ejecutar las copias históricas.

#1742 conserva el diagnóstico de los capturadores activos cuando vence su plazo.
Revisión de código `f4ee44585a79543901ef9e5e324196624a43edab`; las versiones
anteriores exactas de nightly1b732b67d quedan como `.txt` inertes en
`legacy-evidence/hub-capture-before-1742/`. Se conservan hashes fuente y todas
las revisiones anteriores. El inventario pasa a 466 archivos exactos; ningún
corpus, PNG ni baseline de analizador cambia. No ejecutar las copias históricas.
