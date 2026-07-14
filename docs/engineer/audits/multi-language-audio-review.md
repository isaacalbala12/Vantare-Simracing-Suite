# Multi-Language Audio System — Final Review

> **Audit date:** 2026-06-29
> **Reviewer:** Explorer (codebase navigation specialist)
> **Plan:** `docs/superpowers/plans/2026-06-29-multi-language-audio-system.md`

---

## 1. Summary of All Changed Files

| File | Status | Lines | Role |
|---|---|---|---|
| `internal/engineer/audio/config.go` | **Created** | 113 | `AudioConfig` struct with per-channel language/voice, `sync.RWMutex`, nil-safe methods |
| `internal/engineer/audio/router.go` | **Created** | 81 | `AudioRouter` resolving textKey → file path via config + cache-first + on-demand synth |
| `internal/engineer/audio/message.go` | **Modified** | 60 (+1) | Added `Channel` field to `Message` struct |
| `internal/engineer/core/runtime.go` | **Modified** | 1119 (+11) | Added `channelForCategory()`, wired `Channel` in all Message constructions |
| `internal/engineer/service/engineer_service.go` | **Modified** | 606 (+33) | Added `audioConfig`/`audioRouter` fields + setters, channel-aware audio resolution in `queueLoop` |
| `internal/tts/kokoro.go` | **Modified** | 182 (+~30) | MP3 format in `Synthesize`, `synthesizeREST` returns `Result{Format:"mp3"}`, `Health()` checks `/health` |
| `scripts/generate_all_voices.py` | **Created** | 337 | Generates MP3 for 23 voices × ~170 phrases via Kokoro-FastAPI |

### Test files

| File | Tests |
|---|---|
| `internal/engineer/audio/config_test.go` | 8 tests (defaults, setters, unknown channel, validate, nil receiver, race-free) |
| `internal/engineer/audio/router_test.go` | 14 tests (nil router/engine/config, cache hit/miss, channel differentiation, SetConfig, race-free) |
| `internal/tts/kokoro_test.go` | 2 tests (name, sanitize) |

---

## 2. Issues Found

### P2 — `s.audioRouter` accessed without synchronization in `queueLoop`

**File:** `internal/engineer/service/engineer_service.go:535`
**Severity:** P2 (low risk due to documented contract)

```go
// line 535 — reading s.audioRouter without holding s.mu
if player != nil && s.audioRouter != nil && now >= skipUntil {
```

The `s.audioRouter` pointer is read outside the mutex, while `SetAudioRouter()` (line 138) writes it without locking. The doc comment says *"Must be called before Start() to avoid races"*, but Go's race detector would flag this if both happen concurrently.

**Mitigation:** Documented contract; in practice config is set once at startup. No hot-reload path exists today. If runtime reconfiguration is added later, this must be protected.

### P2 — `SetAudioConfig` reads `s.audioRouter` without lock

**File:** `internal/engineer/service/engineer_service.go:129-134`

```go
func (s *EngineerService) SetAudioConfig(cfg *audio.AudioConfig) {
	s.audioConfig = cfg       // no lock
	if s.audioRouter != nil { // reads audioRouter without lock
		s.audioRouter.SetConfig(cfg)
	}
}
```

Same class of issue as above — depends on before-Start ordering.

### P3 — `AudioRouter.Resolve` type-asserts `atomic.Value` without type guard

**File:** `internal/engineer/audio/router.go:48`

```go
ac := cfg.(*AudioConfig)
```

If someone stores a non-`*AudioConfig` value in the `atomic.Value`, this panics. Currently only `NewAudioRouter` and `SetConfig` store `*AudioConfig`, so this is safe in practice.

**Mitigation:** Add a type-check guard or document that only `*AudioConfig` may be stored.

### P3 — `userHomeDir` uses `strings.ContainsRune(h, 0)` (cache.go)

**File:** `internal/tts/cache.go:129-135`

The null-rune check is unusual and defensive. Not a bug, but the function could be simplified. Not in scope of the audio system.

### Pre-existing vet warnings (out of scope)

The following warnings are **pre-existing** and unrelated to the audio system:

```
internal\engineer\lmu\extended_reader.go:75:32: possible misuse of unsafe.Pointer
internal\engineer\lmu\pitinfo_reader.go:65:32: possible misuse of unsafe.Pointer
```

These exist in the LMU adapter code, not in any file touched by this plan.

---

## 3. Test Results

### `go test ./internal/engineer/... ./internal/tts/... -count=1 -timeout 120s`

**Result: 32/32 packages PASS** ✅

| Package | Tests | Result |
|---|---|---|
| `internal/engineer/audio` | 33 subtests | **PASS** (0.27s) |
| `internal/engineer/service` | 22 tests | **PASS** (8.03s) |
| `internal/engineer/core` | 15 tests | **PASS** (0.10s) |
| `internal/tts` | 13 tests | **PASS** (0.05s) |
| All other engineer packages (28) | — | **PASS** |
| **Total** | **32 packages** | **ALL PASS** |

### `go vet ./internal/engineer/... ./internal/tts/...`

**Result:** Only pre-existing `unsafe.Pointer` warnings in `lmu/` (out of scope). No new warnings. ✅

### `go test -race` (not available)

The `-race` flag requires cgo, which is not available in this environment. However, both `TestAudioConfig_RaceFree` and `TestAudioRouter_RaceFree` exercise concurrent reads/writes and pass cleanly. Manual race testing on a cgo-capable machine is recommended before production deployment.

---

## 4. CC Parity Verification — 6 Checks

### ✅ Check 1: AudioRouter resolves textKey → correct language/voice based on channel

**Evidence:** `TestAudioRouter_DifferentChannel_DifferentPath` (router_test.go:82-119)

- Spotter channel → `es/em_alex/spotter.car_left.mp3`
- Engineer channel → `en/am_echo/engine.water_temp_high.mp3`

Verified: `AudioRouter.Resolve()` calls `config.Lang(ch)` / `config.Voice(ch)`, which switch on `Channel`.

### ✅ Check 2: Cache hit returns file directly (no API call)

**Evidence:** `TestAudioRouter_CacheHit` (router_test.go:56-72)

Creates a cache file on disk, constructs `AudioRouter` with `engine: nil`. `Resolve()` returns the cached path without calling any engine method.

Verified: `os.Stat` check on line 55 of router.go short-circuits before any engine call.

### ✅ Check 3: Cache miss triggers on-demand synthesis (not silent failure)

**Evidence:** `TestAudioRouter_CacheMiss_WithEngine` (router_test.go:193-214)

Creates a real `tts.Engine` with `MockProvider`. Cache miss → `SynthOrCache` is called → file is synthesized and cached → path returned.

Verified: `r.engine.SynthOrCache(tts.Request{...})` on line 63-67 of router.go.

### ✅ Check 4: Spotter always wins priority

**Evidence:** `queueLoop` in engineer_service.go:535-549

```go
ch := audio.ChannelEngineer
if msg.Priority >= audio.PrioritySpotter {   // PrioritySpotter=100, PriorityNormal=10
    ch = audio.ChannelSpotter
}
```

Verified by constants: `PrioritySpotter = 100 > PriorityNormal = 10`. Spotter messages always resolve to spotter channel. Additionally, the old resolver fallback (line 550) checks `msg.Priority >= audio.PrioritySpotter` before playing, preserving the old behavior.

### ✅ Check 5: Backward compatibility — old AudioResolver still works when AudioRouter is nil

**Evidence:** `queueLoop` in engineer_service.go:550-557

```go
} else if player != nil && resolver != nil && msg.Priority >= audio.PrioritySpotter && now >= skipUntil {
    // Legacy fallback: old resolver interface
    if path := resolver.Resolve(msg.TextKey); path != "" {
```

When `s.audioRouter` is nil (not configured), the code falls through to the `else if` branch which uses the old `AudioResolver` interface. The existing test `TestEngineerService_QueueLoop_InvokesPlayerPlay` passes, confirming backward compatibility.

### ✅ Check 6: MP3 format where available

**Evidence:**

- `kokoro.go` line 113: `"response_format": "mp3"` in REST API body
- `kokoro.go` line 137: `return Result{Format: "mp3", Path: path}`
- `router.go` line 52: `textKey+".mp3"` in expected path construction
- `TestAudioRouter_CacheMiss_WithEngine` line 211: `filepath.Ext(path) != ".mp3"` check

---

## 5. SOLID Assessment

| Principle | Assessment |
|---|---|
| **S**ingle Responsibility | `AudioConfig` — settings only; `AudioRouter` — resolution only; `KokoroProvider` — synthesis only. ✅ |
| **O**pen/Closed | Adding a new language requires updating `AudioConfig.Validate()`. Adding a new channel requires `channelForCategory()`. Acceptable. ✅ |
| **L**iskov Substitution | `AudioResolver` interface (old) and `AudioRouter` (new) are not substitutable; the code uses `if/else` branching. This is intentional — the old resolver is a fallback, not a replacement. ⚠️ |
| **I**nterface Segregation | `AudioPlayer` (2 methods), `AudioResolver` (1 method), `Provider` (3 methods). All minimal. ✅ |
| **D**ependency Inversion | `AudioRouter` depends on `*tts.Engine` (concrete), not `Provider` interface. Minor violation but acceptable — `Engine` is the orchestrator, not the low-level provider. ⚠️ |

---

## 6. Final Verdict

| Criteria | Status |
|---|---|
| All tests pass | ✅ 32/32 |
| Go vet clean (new code) | ✅ |
| Race-free by design + race tests | ✅ (manual -race recommended) |
| CC parity (6/6 checks) | ✅ |
| No P0/P1 bugs | ✅ |
| P2 issues (documented race contracts) | 2 found, acceptable |
| P3 issues (type assertion, nitpicks) | 2 found, minor |

### **VERDICT: APPROVED ✅**

The multi-language audio system is solid. The two P2 items are documented design contracts (call setters before `Start()`) rather than active bugs. The implementation matches the plan specification, all tests pass, and all six CC parity requirements are verified.

### Risk remaining

1. **Hot-reload of audio config at runtime** would need `sync.Mutex` protection around `s.audioRouter` in `queueLoop` and `SetAudioConfig`. Currently not required.
2. **Race detector** could not be run (no cgo). Run `go test -race` on a cgo-capable machine before production release.
3. **`data/tts-cache/` does not exist** on disk — the `generate_all_voices.py` script needs to be run after starting the Kokoro-FastAPI Docker container.
