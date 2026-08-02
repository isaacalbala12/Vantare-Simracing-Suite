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
python -m compileall -q tools/engineer-voice-bench
```

The exact research environment, artifact URLs, checksums and commands used for
ISA-180 are recorded in `docs/engineer/tts-stt-benchmark-isa-180.md`. Do not
commit generated WAV, model, voice, executable, venv or raw transcript
artifacts. The canonical JSON may contain only the short, synthetic and
sanitized transcript excerpts required to make its reported WER auditable.

## ISA-181 human corpus gate

`fleurs_corpus.py` streams a small deterministic subset of the original
FLEURS dev archives into an operator-selected directory outside Git. It pins
the repository revision and enforces per-archive, per-file and total storage
limits. `augment_noise.py` creates deterministic 10 dB white-noise variants.
`whisper_corpus_probe.ps1` compares one externally installed Whisper model at a
time, owns and cleans its loopback process, and writes raw transcripts only to
the external result path. `evaluate_corpus.py` produces aggregate WER/CER and
resource metrics suitable for sanitization.

FLEURS is generic human read speech. These tools cannot establish command
intent accuracy, false accept/reject rates or wake-word readiness. Those gates
require the separate `consented_corpus.py` flow and actual people speaking the
approved command catalog. Import or capture requires the exact explicit
consent string, previews only a local sanitized manifest and defaults to
expiry after 24 hours unless `--keep` is supplied. It never runs silently.
The operator must also confirm that `speaker-alias` is a non-identifying
pseudonym. This is an explicit declaration, not automatic proof that the alias
contains no personal information.

The source, license, fixed revision, exact limits and reproducible commands are
recorded in `docs/engineer/human-corpus-voice-host-isa-181.md`. Audio, models,
executables, temporary manifests and raw transcripts must remain outside Git.

Verify the port-contamination guard without starting an engine:

```powershell
tools/engineer-voice-bench/whisper_probe.ps1 -CheckPortOnly -Port 18180
```

The command succeeds only while that loopback port is free. Holding a local
`TcpListener` on the same port must make it fail before any benchmark starts.
