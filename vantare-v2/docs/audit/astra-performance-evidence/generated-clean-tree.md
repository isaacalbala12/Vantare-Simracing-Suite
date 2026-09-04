# Generated-file gates

Sobre NEXT_CANDIDATE antes de editar producto:

| Gate | Resultado |
|---|---|
|telemetry-contract-gen -check|PASS|
|go mod tidy -diff|PASS sin diff|
|roadmap_digest --ref origin/nightly --check|PASS sobre documento original candidato|
|build/sync_version.go|PASS sin cambio versionado|
|wails3 generate bindings -clean=true desde vantare-v2|Exit0, **0 servicios/0 métodos**, warning no Go files; no es validación de bindings|
|iconos|No corresponde: sin cambio de iconos|
|generated telemetry, bindings, go.mod/go.sum tras comandos|sin drift versionado|

El generador Wails canónico apunta a raíz pero main vive en cmd/vantare. No se oculta el éxito vacío ni se crea stub para hacer pasar el gate. La invocación correcta y validación Windows requieren issue propia. La auditoría no edita generated bindings.

La entrega de documentación rebasa su único commit a nightly, preservando el mismo blob de informe ciego y el commit original96539f54 en la referencia remota isa-978-blind-freeze. Roadmap se modifica de forma intencional por requisito de contrato: solo milestone huella-minima-banco en978 y performance-policy en979. Se distingue modificación intencional del digest de drift accidental. Check final en delivery-status.json y final-status.txt.

Suite Go general del candidato: FAIL con launcher macOS, catálogo/diagnóstico, path Windows y recording/SQLite; detalle raw/candidate-go-suite.log. No falso verde. Frontend candidato3426PASS; implementación candidata3430PASS; implementación final sobre nightly3299PASS. Cada cifra tiene snapshot diferente.

El primer promotion job de980 era verde con el subpaso roadmap en audit-mode fallido por dos casillas ausentes. Se corrigió la issue979 y se repitió ese control. No se equipara un job verde al subpaso contractual; resultados finales en delivery-status.json.
