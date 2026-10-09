# Corpus conservado · #1533

`manifest.json` registra SHA-256 anterior al borrado y ruta original en
`5e1da3f6`. `python native/retirement/verify.py` comprueba todos sus bytes actuales. La integración #1530 migra las etiquetas
DTO a v9 y actualiza solo sus pins y documentación: `source_sha256` conserva
el hash anterior, `sha256` fija el archivo migrado. Los JSON y los gzip
se compararon contra la base cambiando únicamente la etiqueta de versión;
`acc-all-v8.sha256` y la regresión de telemetría conservan el pin ACC original.
Se conservan corpus LMU/ACC, oráculos Strategy, referencias visuales y assets.
Los catálogos Go de Engineer son texto de referencia inerte; los tests Rust
siguen comparando sus frases/voces. El seed de calendario vive en `hub/data`,
su fuente textual en `scripts/testdata` y el perfil legado en `packaging/fixtures`.
Los archivos Go necesarios para reproducir se archivan en `tools/frozen-go`.
Los oráculos y sus pins existentes no se recalculan desde Rust.
Los tokens CSS de Discord y sondas/editorial Go/React se conservan como evidencia
inactiva en `legacy-evidence` (scripts con extensión `.txt`). No ejecutar sus
comandos históricos: requieren el checkout retirado. Los scripts independientes
de calendario, voz, marca y medición continúan activos. Supabase permanece íntegro.
