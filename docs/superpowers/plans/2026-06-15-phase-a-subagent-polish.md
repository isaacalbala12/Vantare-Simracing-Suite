> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`. Implement the tasks in this plan and stop. Do NOT proceed to other subagent plans. Do NOT run the release task.

# Subagent Plan — PolishAgent

**Goal:** Add process CPU measurement to the Ops panel and implement basic widget visibility rules (`inPit`, `sessionType`) in the overlay.

**Context:** This is part of Fase A in `docs/superpowers/plans/2026-06-15-phase-a-lmu-alpha-master.md`. Implement only Tasks 9–10 from the master plan.

**Tech Stack:** Go 1.23 + gopsutil (CPU); React 19 + TypeScript (visibility rules).

**Definition of done for this subagent:**
1. All steps below are checked off.
2. Go tests pass.
3. Frontend tests pass.
4. Visibility rules must be smoke-tested by Main before release.

---

## Task 9: Ops Panel CPU

**Files:**
- Modify: `vantare-v2/internal/ops/sampler.go`
- Create: `vantare-v2/internal/ops/sampler_test.go`
- Modify: `vantare-v2/frontend/src/hub/components/OpsPanel.tsx`
- Modify: `vantare-v2/internal/app/settings_service.go` (already from SettingsHotkeysAgent; if missing, define type only)

- [ ] **Step 1: Add gopsutil dependency**

```bash
cd vantare-v2
go get github.com/shirou/gopsutil/v4/process
```

- [ ] **Step 2: Add CPU sampling to sampler.go**

Assuming `Sampler` has a `sample()` method that emits metrics, add:

```go
import (
	"os"
	"time"

	"github.com/shirou/gopsutil/v4/process"
)

func (s *Sampler) sampleCPU(enabled bool) (float64, error) {
	if !enabled {
		return -1, nil
	}
	p, err := process.NewProcess(int32(os.Getpid()))
	if err != nil {
		return -1, err
	}
	// Percent blocks for the given interval and returns average CPU over it.
	return p.Percent(2 * time.Second)
}
```

Call it in the sampling loop and emit `cpuPercent`. If `-1`, the frontend shows `N/D`.

- [ ] **Step 3: Read CpuSampling setting**

Pass the settings service to the sampler or read a bool from a shared config. The sampler should not depend on `settingsService` directly to avoid circular deps. Use a callback or atomic bool.

Simplest: add a field `cpuEnabled atomic.Bool` to `Sampler` and a setter `SetCPUEnabled(bool)`.

- [ ] **Step 4: Update OpsPanel.tsx**

```typescript
function formatCpu(value: number | null | undefined) {
  if (value == null || value < 0) return "N/D";
  return `${value.toFixed(1)}%`;
}
```

Use it to render CPU row.

- [ ] **Step 5: Write tests**

```go
func TestSamplerCPUEnabled(t *testing.T) {
	s := NewSampler(...)
	s.SetCPUEnabled(true)
	v, err := s.sampleCPU(true)
	if err != nil {
		t.Fatalf("cpu sample failed: %v", err)
	}
	if v < 0 {
		t.Fatalf("expected non-negative cpu, got %v", v)
	}
}

func TestSamplerCPUDisabled(t *testing.T) {
	s := NewSampler(...)
	v, _ := s.sampleCPU(false)
	if v != -1 {
		t.Fatalf("expected -1 when disabled, got %v", v)
	}
}
```

- [ ] **Step 6: Run tests and commit**

```bash
cd vantare-v2
go test ./internal/ops/...
pnpm --dir frontend test
git add vantare-v2/internal/ops/sampler.go \
        vantare-v2/internal/ops/sampler_test.go \
        vantare-v2/frontend/src/hub/components/OpsPanel.tsx
git commit -m "feat(ops): measure process CPU via gopsutil with toggle"
```

---

## Task 10: Visibility Rules in Overlay

**Files:**
- Create: `vantare-v2/frontend/src/lib/visibility.ts`
- Create: `vantare-v2/frontend/src/lib/visibility.test.ts`
- Modify: `vantare-v2/frontend/src/lib/profile.ts`
- Modify: `vantare-v2/frontend/src/overlay/OverlayApp.tsx`
- Modify: `vantare-v2/frontend/src/lib/useDemoMode.ts` (already from DemoDeltaAgent; add inPit override if missing)

- [ ] **Step 1: Add visibleWhen to profile type**

```typescript
export type VisibleWhen = {
  inPit?: boolean;
  sessionType?: ("practice" | "qual" | "race" | "warmup")[];
};

export interface WidgetConfig {
  ...
  visibleWhen?: VisibleWhen;
}
```

- [ ] **Step 2: Implement visibility evaluator**

```typescript
export function isWidgetVisible(
  widget: WidgetConfig,
  state: TelemetryState,
): boolean {
  if (!widget.visibleWhen) return true;
  const { inPit, sessionType } = widget.visibleWhen;
  if (inPit != null) {
    const playerInPit = state.player?.inPit ?? false;
    if (playerInPit !== inPit) return false;
  }
  if (sessionType != null && sessionType.length > 0) {
    if (!sessionType.includes(state.sessionType)) return false;
  }
  return true;
}
```

- [ ] **Step 3: Apply in OverlayApp**

Before rendering widgets, filter:

```typescript
const visibleWidgets = profile.widgets.filter(
  (w) => w.enabled && isWidgetVisible(w, telemetryState),
);
```

Invisible widgets are not rendered (not just opacity 0).

- [ ] **Step 4: Add visibleWhen controls to PreviewInspector**

For the selected widget, add:
- Checkbox "Visible in pit" with tri-state (yes/no/no rule).
- Multi-select for session types.

If both are empty, remove `visibleWhen`.

- [ ] **Step 5: Add inPit override to demo mode**

Ensure `generateAnimatedTelemetry(elapsedMs, inPit)` accepts `inPit` flag and sets `state.player.inPit`. If this was done by DemoDeltaAgent, skip.

- [ ] **Step 6: Write tests**

```typescript
it("shows widget by default", () => { ... });
it("hides widget when inPit mismatch", () => { ... });
it("hides widget when sessionType mismatch", () => { ... });
it("shows widget when all conditions match", () => { ... });
```

- [ ] **Step 7: Run tests and commit**

```bash
pnpm --dir vantare-v2/frontend test
git add vantare-v2/frontend/src/lib/visibility.ts \
        vantare-v2/frontend/src/lib/visibility.test.ts \
        vantare-v2/frontend/src/lib/profile.ts \
        vantare-v2/frontend/src/overlay/OverlayApp.tsx \
        vantare-v2/frontend/src/hub/preview/PreviewInspector.tsx
git commit -m "feat(overlay): visibility rules by inPit and sessionType"
```

---

## Final verification

```bash
cd vantare-v2
go test ./...
pnpm --dir frontend test
pnpm --dir frontend build
```

Report back which tests pass/fail.
