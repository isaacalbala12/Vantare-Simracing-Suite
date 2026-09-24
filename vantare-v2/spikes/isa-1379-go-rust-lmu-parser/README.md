# VAN-764 / GitHub #1379 — Go/Rust telemetry experiment (in progress)

This spike is an isolated future-viability experiment. It does not change the
production LMU reader or select Rust for the application.

The first slice validates all admitted LMU C strings from one sanitized shared
memory frame in a single Rust DLL call. The Go test compares validity and byte
length with the production `reasonableCString` on four sanitized captures.
Both benchmarks then materialize the same Go strings; the Rust timing includes
the DLL call and Go string construction. `GoSingleConversion` is a control that
removes one redundant conversion without changing the production function.

Build and run on Windows:

```powershell
cargo build --release --manifest-path spikes/isa-1379-go-rust-lmu-parser/Cargo.toml
$env:VANTARE_RUST_PROBE_DLL = (Resolve-Path spikes/isa-1379-go-rust-lmu-parser/target/release/vantare_lmu_rust_probe.dll).Path
go test ./internal/telemetry/drivers/lmu -run '^TestRustCStringProbeMatchesGoOnSanitizedLMUCaptures$' -count=1
go test ./internal/telemetry/drivers/lmu -run '^$' -bench '^BenchmarkLMUCStrings' -benchtime=500ms -count=10 -benchmem
```

Evidence from the interleaved Windows run is in
`docs/telemetry-core/evidence/isa-1379-go-rust-cstrings.txt`.

The second slice moves the complete scoring/telemetry ID correspondence into
Rust. The experimental Go caller then constructs the same full `Observation`.
`GoFixed` implements the same fixed-array mapping in Go to separate algorithm
choice from language choice. Build the DLL as above, then run:

```powershell
go test ./internal/telemetry/drivers/lmu -run '^TestRustGridParser' -count=1
go test ./internal/telemetry/drivers/lmu -run '^$' -bench '^BenchmarkLMUParser(Go|GoFixed|RustGrid)$' -benchtime=500ms -count=5 -benchmem
```

See `docs/telemetry-core/evidence/isa-1379-go-rust-parser.md` for the
interleaved A/B, process CPU and memory samples, parity, and limits. Rust does
not replace the whole parser or the telemetry engine, and these benchmark
processes do not measure Vantare/Wails CPU at 60 Hz.
