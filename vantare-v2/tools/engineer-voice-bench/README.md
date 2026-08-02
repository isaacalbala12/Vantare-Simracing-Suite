# ENG-09 voice benchmark tools

These probes are research-only. They do not participate in the Vantare build,
do not download anything, and never read a microphone. Engines, models and
voices must be installed outside the worktree by the operator.

`kokoro_probe.py` measures model load, first inference and repeated warm
inference for one short Engineer phrase in `en`, `es`, `it` and `pt-BR`. It
writes PCM WAV fixtures and one JSON result. `whisper_probe.ps1` measures the
first and warm requests of a resident `whisper-server` process against those
fixtures. `score_transcripts.py` computes a transparent word-error rate for
transcripts produced by an external STT engine. `isolation_probe.go` measures
forced cancellation and a concurrent high-frequency heartbeat around an
isolated engine process. The probes are intentionally small and do not claim
perceptual voice quality.

Run the dependency-free checks:

```powershell
python -m unittest discover -s tools/engineer-voice-bench -p "test_*.py"
python -m py_compile tools/engineer-voice-bench/kokoro_probe.py tools/engineer-voice-bench/score_transcripts.py
```

The exact research environment, artifact URLs, checksums and commands used for
ISA-180 are recorded in `docs/engineer/tts-stt-benchmark-isa-180.md`. Do not
commit generated WAV, model, voice, executable, venv or raw transcript
artifacts. The canonical JSON may contain only the short, synthetic and
sanitized transcript excerpts required to make its reported WER auditable.

Verify the port-contamination guard without starting an engine:

```powershell
tools/engineer-voice-bench/whisper_probe.ps1 -CheckPortOnly -Port 18180
```

The command succeeds only while that loopback port is free. Holding a local
`TcpListener` on the same port must make it fail before any benchmark starts.
