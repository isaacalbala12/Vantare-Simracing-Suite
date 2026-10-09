# ISA-101 storage benchmark

Módulo Go aislado y desechable. No forma parte de Vantare ni modifica su
`go.mod`.

## Candidatos

- framing stdlib: sin tag;
- SQLite modernc: `-tags sqlite`;
- MCAP: `-tags mcap`;
- DuckDB: `-tags duckdb` (esperado bloqueado con CGO=0).

Todos escriben los mismos `RecordingPayloadV1` y `RecordingFactV1`
deterministas y allowlisted. El CSV separa `first` de `subsequent` y compara
digest, counts, cursores, tamaño,
escritura/cierre, scan, rango y último cursor. La fixture sintética no estima
retención o footprint productivo.

## Comandos

```powershell
go test ./... -count=1
go test -tags sqlite ./... -count=1
go test -tags mcap ./... -count=1

go run . -candidate framing -scenario all -output raw-framing.csv -workdir "$env:TEMP\isa101-framing"
go run -tags sqlite . -candidate sqlite -scenario all -output raw-sqlite.csv -workdir "$env:TEMP\isa101-sqlite"
go run -tags mcap . -candidate mcap -scenario all -output raw-mcap.csv -workdir "$env:TEMP\isa101-mcap"
```

Fallos requieren un ejecutable: un padre mata al hijo en cuatro límites
deterministas de backend/manifest experimental:

```powershell
go build -tags sqlite -o "$env:TEMP\isa101-sqlite.exe" .
& "$env:TEMP\isa101-sqlite.exe" -candidate sqlite -faults `
  -output raw-faults-sqlite.csv `
  -workdir "$env:TEMP\isa101-faults-sqlite"
```

Usar siempre un workdir nuevo. No introducir raw real, PII o secretos.
