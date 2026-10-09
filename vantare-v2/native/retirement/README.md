# Corpus conservado · #1533

`manifest.json` registra SHA-256 anterior al borrado y ruta original en
`5e1da3f6`. `python native/retirement/verify.py` comprueba todos sus bytes.
Se conservan corpus LMU/ACC, oráculos Strategy, referencias visuales y assets.
Los catálogos Go de Engineer son texto de referencia inerte; los tests Rust
siguen comparando sus frases/voces. El seed de calendario vive en `hub/data`,
su fuente textual en `scripts/testdata` y el perfil legado en `packaging/fixtures`.
Los archivos Go necesarios para reproducir se archivan en `tools/frozen-go`.
Los oráculos y sus pins existentes no se recalculan desde Rust.
