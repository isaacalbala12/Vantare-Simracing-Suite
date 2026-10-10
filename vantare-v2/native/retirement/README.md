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
siguen comparando sus frases/voces. El seed de calendario vive en `hub/data`,
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
