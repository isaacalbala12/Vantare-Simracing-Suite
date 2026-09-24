# VAN-764 / GitHub #1379 — Go/Rust telemetry experiment (in progress)

This spike is an isolated future-viability experiment. It does not change the
production LMU reader or select Rust for the application.

Current slice: validate all admitted LMU C strings from one sanitized shared
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

This is only a parser substage. It cannot establish CPU savings for the whole
telemetry engine or the Wails process. The next meaningful gate is a Rust
implementation of a complete existing stage with full semantic parity, followed
by a process-level A/B on the same replay. Do not use the current timing to
claim that Rust saves one CPU percentage point.
