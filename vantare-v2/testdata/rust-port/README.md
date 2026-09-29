# Corpus temporal LMU47 para el port Rust

`lmu47-high-rate-60s.tar.gz` contiene una captura real sanitizada de LMU
1.4.2.0, tomada el 2026-09-29 en pista con 47 vehículos. Sus eventos conservan
la hora UTC de disponibilidad de 3600 lecturas estables de SHM y de 239
respuestas REST completas durante 59,983 s. Para cada REST se guardan también
los instantes de inicio y fin de ambos endpoints; no se interpola su posición
entre lecturas SHM. El reloj de origen avanzó 60 s.

- SHA-256 del archivo comprimido:
  `c5b827ce1cfa558e732da934f11eb0f83f5dfb9e8a3c793f4d3f65ef8ca2a01c`.
- SHA-256 de `manifest.json`:
  `9d86e6c3b865f7b736023dd0eb5c2715d0b6dce6e39c64d9b0544c1549cb6a60`.
- SHA-256 del capturador declarado por el manifiesto:
  `5050623e346bb1f1c630ac84fc8ecbb852b480eb9326f98c7ff15e42bf6fc5ab`.
- Tamaño comprimido: 23.477.704 bytes; sin comprimir: 1.171.868.121 bytes.

El capturador está en `internal/telemetry/drivers/lmu/capture_high_rate_windows_test.go`.
Usa el sanitizador de SHM existente, que reconstruye un frame sin texto fuente,
y guarda solo campos REST admitidos con alias estables. El test obligatorio
`TestBundledLMUHighRateCorpus` verifica el hash del archivo, cada hash de
evento y el parser Go sin extraerlo al disco. Para auditar orden, intervalos,
reloj y directorio tras extraerlo en Windows:

```powershell
tar -xzf testdata/rust-port/lmu47-high-rate-60s.tar.gz -C C:\tmp
$env:LMU_HIGH_RATE_CORPUS='C:\tmp\isa-1403-lmu-high-rate-final-20260929'
go test ./internal/telemetry/drivers/lmu -run '^TestAuditLMUHighRateTemporalOptIn$' -count=1 -v
```

El replay Go/Rust compara estructuralmente cada producto Overlay, Engineer,
Strategy y fact en los 3839 eventos, con los tiempos originales de cada evento
y de las respuestas REST. Para repetirlo después de extraer el archivo:

```powershell
$env:LMU_HIGH_RATE_PARITY_OUT='C:\tmp\isa-1403-high-rate-parity'
go test ./internal/telemetry/drivers/lmu -run '^TestReplayLMUHighRateGoOptIn$' -count=1
cargo +1.95.0 test --manifest-path rust/telemetry/Cargo.toml --release --locked --test high_rate_temporal
python tools/telemetry-port-parity/compare_high_rate.py "$env:LMU_HIGH_RATE_PARITY_OUT/go-products.jsonl" "$env:LMU_HIGH_RATE_PARITY_OUT/rust-products.jsonl" --expected-events 3839
cargo +1.95.0 build --manifest-path rust/telemetry/Cargo.toml --release --locked --features replay-harness --bin vantare-telemetry-replay
$env:VANTARE_TELEMETRY_REPLAY_TEST_HELPER=(Resolve-Path rust/telemetry/target/release/vantare-telemetry-replay.exe).Path
go test ./internal/app/telemetryprocess -run '^TestRustHighRateCorpusPipeOptIn$' -count=1 -v -timeout 6m
```

Use un directorio de salida nuevo para cada ejecución: las pruebas no sobrescriben
resultados anteriores. Los archivos JSONL ocupan cerca de 1,5 GB en total; el
comparador solo informa la ruta del primer campo distinto, sin imprimir valores.
La comparación completa pasó localmente. Otro replay pasó los 3839 productos
de cada consumidor y el fact por el pipe Windows, el receptor y el Publisher Go,
tanto con Engineer JSON como binario. El hash de las 3839 observaciones Engineer
adaptadas en Go fue idéntico con ambos codecs.
Se ejecuta a la velocidad que permite el receptor, no a la cadencia de captura;
ninguno de estos tests mide el coste equivalente de adquisición, IPC ni entrega
en una ventana temporal controlada. Solo cubren pista estable. Siguen abiertos
G0/G1/R, CPU ≤50%, p99, RSS, recuperación y la prueba física Wails/OBS.
