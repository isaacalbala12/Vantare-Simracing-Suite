# Referencia Go congelada · #1533

Estos archivos son fuentes históricas para reproducir oráculos, no otra app.
`manifest.json` fija commit, SHA-256 del archivo y de cada fuente. Solo contienen
paquetes necesarios por los exportadores y sus hashes de procedencia, módulos,
datos `go:embed` y tests del exportador; no contienen archivos `.env*`.
La licencia original se conserva en `LICENSE`. Los exportadores se conservaron
desde `5e1da3f6`; los módulos productivos proceden de los commits del manifiesto.

Desde `vantare-v2`, siempre por la cola:
`pwsh -NoProfile -File C:/tmp/fase2/compilar.ps1 python tools/frozen-go/reproduce.py all`.
Valida todos los hashes, extrae a un temporal y compila los tres módulos sin
Git, Wails, React ni `internal/` del checkout. Requiere Go y módulos ya cacheados;
`GOPROXY=off` evita descargas. Go no es un gate de la aplicación nativa.

Para una salida nueva: `python tools/frozen-go/reproduce.py lmu --out C:/tmp/oraculo-nuevo`
(o `strategy` / `strategy-legacy`). Rechaza directorios existentes. LMU usa el
corpus conservado de `testdata/`; Strategy preserva entradas del exportador.
Solo se cambia en el temporal la consulta Git del exportador Strategy por el
commit archivado; no se modifican funciones de producción ni expectativas Rust.
Los tiempos de solver y la fecha de exportación no son deterministas. Las otras
fixtures de Strategy y sus manifiestos permanecen congelados en el crate;
este exportador no promete regenerar todos los corpus extendidos posteriores.
