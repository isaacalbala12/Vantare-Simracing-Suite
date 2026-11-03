# Fotos guardadas de compatibilidad

`saved-v8.snapshot.json` conserva su nombre histórico, pero el documento literal
es **v7**. Ya existía en nightly@7e92e1a9e y se conserva sin alterar bytes.
`saved-v10.snapshot.json` es la copia exacta de ui/fixtures/pedals.snapshot.json
en esa misma base, antes de la migración del paso 4 de #1868.
Son documentos históricos del repo; no capturas físicas ni DTO actuales con
la versión cambiada. El test verifica sus SHA-256 y valores, usa el lector
guardado y comprueba que el lector live los rechaza.
