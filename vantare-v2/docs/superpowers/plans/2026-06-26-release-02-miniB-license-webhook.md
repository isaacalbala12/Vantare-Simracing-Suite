# Release 02 Mini-Plan B — Go LicenseService + Stripe Webhook Backend

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Go license validation service inside the desktop app and the Stripe webhook backend that updates Supabase entitlements.

**Architecture:** `internal/license` is a pure Go package with typed license states, local cache, device fingerprint and Supabase REST client using the standard library only. The webhook is a Supabase Edge Function (Deno) that verifies Stripe signatures and writes entitlements/subscriptions to Supabase with the service-role key. The two parts communicate only through Supabase data.

**Tech Stack:** Go 1.25 stdlib (`net/http`, `encoding/json`, `crypto`), Wails v3, React/TypeScript (wiring only in Mini-Plan C), Supabase, Stripe, Deno/Supabase Edge Functions, Go tests, Vitest.

---

## File structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `internal/license/types.go` | `Entitlement`, `State`, `Result`, `Config`, `AccountInfo` types. |
| Create | `internal/license/service.go` | `Service` struct and public methods: `Validate`, `HasEntitlement`, `ResetDevice`, `LoadCache`, `SaveCache`. |
| Create | `internal/license/service_test.go` | Table-driven tests for all states and cache paths. |
| Create | `internal/license/cache.go` | Local JSON cache read/write with DPAPI encryption on Windows. |
| Create | `internal/license/fingerprint.go` | Windows machine GUID hash for device fingerprint. |
| Create | `internal/license/fingerprint_test.go` | Tests with registry mocking via build tags/fallback. |
| Create | `internal/license/supabase_client.go` | Supabase REST client interface and stdlib implementation. |
| Create | `internal/license/supabase_client_test.go` | Mock server tests for Supabase REST calls. |
| Create | `internal/license/errors.go` | Typed errors (`ErrNoCache`, `ErrValidationFailed`, `ErrDeviceLimit`). |
| Modify | `cmd/vantare/main.go` | Create and register `license.Service` with Wails; load cache on startup. |
| Create | `supabase/functions/stripe-webhook/index.ts` | Edge Function: verify Stripe signature, upsert entitlements. |
| Create | `supabase/functions/stripe-webhook/_utils/supabase.ts` | Edge Function Supabase admin client helper. |
| Create | `supabase/functions/stripe-webhook/_utils/stripe.ts` | Stripe signature verification helper using `npm:stripe`. |
| Create | `supabase/functions/stripe-webhook/_tests/fixtures.ts` | Sample Stripe webhook payloads for tests. |
| Create | `docs/stripe-webhook-deployment.md` | How to deploy the Edge Function and configure Stripe webhook URL/secret. |
| Modify | `docs/current-plan.md` | Update objective to Mini-Plan B completion. |

**Forbidden files in this mini-plan:**
- `frontend/src/**` UI code (only Wails event wiring in `cmd/vantare/main.go`).
- `pkg/config/profile.go` and `frontend/src/lib/profile.ts`.
- Any telemetry, OBS, LayoutStudio, WidgetStudio runtime changes.
- Build/package config changes.
- No new Go modules (`go get` is forbidden without explicit approval).

---

## Sub-Plan B1: Go LicenseService

### Task 1: Create typed license types

**Files:**
- Create: `internal/license/types.go`
- Create: `internal/license/types_test.go`

- [ ] **Step 1: Write the failing test for string constants.**

Create `internal/license/types_test.go`:

```go
package license

import "testing"

func TestEntitlementConstants(t *testing.T) {
	cases := []Entitlement{EntitlementOverlays, EntitlementEngineer, EntitlementBundle, EntitlementBetaAccess, EntitlementACLuaPack}
	for _, c := range cases {
		if c == "" {
			t.Fatalf("entitlement constant must not be empty")
		}
	}
}

func TestStateConstants(t *testing.T) {
	cases := []State{StateAnonymous, StateAuthenticatedNoEntitlement, StateActive, StateGrace, StateExpired, StateDeviceLimit}
	for _, c := range cases {
		if c == "" {
			t.Fatalf("state constant must not be empty")
		}
	}
}
```

- [ ] **Step 2: Run the tests and confirm they fail.**

Run:
```powershell
go test ./internal/license -v
```

Expected: FAIL — `undefined: EntitlementOverlays`, etc.

- [ ] **Step 3: Implement `types.go`.**

Create `internal/license/types.go`:

```go
package license

import "time"

type Entitlement string

const (
	EntitlementOverlays   Entitlement = "overlays"
	EntitlementEngineer   Entitlement = "engineer"
	EntitlementBundle     Entitlement = "bundle"
	EntitlementBetaAccess Entitlement = "beta_access"
	EntitlementACLuaPack  Entitlement = "ac_lua_pack"
)

type State string

const (
	StateAnonymous                   State = "anonymous"
	StateAuthenticatedNoEntitlement  State = "authenticated-no-entitlement"
	StateActive                      State = "active"
	StateGrace                      State = "grace"
	StateExpired                     State = "expired"
	StateDeviceLimit                 State = "device-limit"
)

type Result struct {
	State         State
	Entitlements  []Entitlement
	UserID        string
	Email         string
	DeviceOK      bool
	GraceEndsAt   *time.Time
	LastValidated time.Time
	Error         error
}

type AccountInfo struct {
	UserID        string        `json:"user_id"`
	Email         string        `json:"email"`
	Entitlements  []Entitlement `json:"entitlements"`
	ActiveDevice  string        `json:"active_device"`
	ExpiresAt     *time.Time    `json:"expires_at"`
}

type Config struct {
	SupabaseURL     string
	SupabaseAnonKey string
	GracePeriod     time.Duration
	CachePath       string
}
```

- [ ] **Step 4: Run tests and confirm they pass.**

Run:
```powershell
go test ./internal/license -v
```

Expected: PASS.

---

### Task 2: Create typed errors

**Files:**
- Create: `internal/license/errors.go`
- Create: `internal/license/errors_test.go`

- [ ] **Step 1: Write failing test.**

Create `internal/license/errors_test.go`:

```go
package license

import (
	"errors"
	"testing"
)

func TestTypedErrors(t *testing.T) {
	if !errors.Is(ErrNoCache, ErrNoCache) {
		t.Fatal("ErrNoCache must be itself")
	}
	if !errors.Is(ErrValidationFailed, ErrValidationFailed) {
		t.Fatal("ErrValidationFailed must be itself")
	}
}
```

- [ ] **Step 2: Run test, expect failure.**

Run:
```powershell
go test ./internal/license -run TestTypedErrors -v
```

Expected: FAIL — `undefined: ErrNoCache`.

- [ ] **Step 3: Implement `errors.go`.**

Create `internal/license/errors.go`:

```go
package license

import "errors"

var (
	ErrNoCache          = errors.New("no license cache available")
	ErrValidationFailed = errors.New("license validation failed")
	ErrDeviceLimit      = errors.New("device limit reached")
	ErrMissingSession   = errors.New("no session token provided")
)
```

- [ ] **Step 4: Run tests, expect pass.**

Run:
```powershell
go test ./internal/license -run TestTypedErrors -v
```

Expected: PASS.

---

### Task 3: Create Supabase client interface and stdlib implementation

**Files:**
- Create: `internal/license/supabase_client.go`
- Create: `internal/license/supabase_client_test.go`

- [ ] **Step 1: Write failing test with mock HTTP server.**

Create `internal/license/supabase_client_test.go`:

```go
package license

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestSupabaseClientFetchAccount(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/rest/v1/rpc/get_account_entitlements" {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		if auth := r.Header.Get("Authorization"); auth == "" {
			t.Fatal("missing Authorization header")
		}
		w.Header().Set("Content-Type", "application/json")
		expires := time.Now().Add(time.Hour).UTC().Format(time.RFC3339)
		_ = json.NewEncoder(w).Encode(AccountInfo{
			UserID:       "u1",
			Email:        "u1@example.com",
			Entitlements: []Entitlement{EntitlementOverlays},
			ActiveDevice: "fp1",
			ExpiresAt:    &expires,
		})
	}))
	defer server.Close()

	client := newStdlibSupabaseClient(server.URL, "anon-key")
	info, err := client.FetchAccount("token-123", "fp1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if info.UserID != "u1" {
		t.Fatalf("expected user u1, got %s", info.UserID)
	}
	if len(info.Entitlements) != 1 || info.Entitlements[0] != EntitlementOverlays {
		t.Fatalf("unexpected entitlements: %v", info.Entitlements)
	}
}
```

- [ ] **Step 2: Run test, expect failure.**

Run:
```powershell
go test ./internal/license -run TestSupabaseClientFetchAccount -v
```

Expected: FAIL — `undefined: newStdlibSupabaseClient`, `undefined: supabaseClient`.

- [ ] **Step 3: Implement `supabase_client.go`.**

Create `internal/license/supabase_client.go`:

```go
package license

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// supabaseClient abstracts Supabase REST calls so tests can mock them.
type supabaseClient interface {
	FetchAccount(ctx context.Context, sessionToken string, fingerprint string) (*AccountInfo, error)
	ResetDevice(ctx context.Context, sessionToken string, fingerprint string) error
}

type stdlibSupabaseClient struct {
	baseURL string
	anonKey string
	httpClient *http.Client
}

func newStdlibSupabaseClient(baseURL, anonKey string) *stdlibSupabaseClient {
	return &stdlibSupabaseClient{
		baseURL: baseURL,
		anonKey: anonKey,
		httpClient: &http.Client{Timeout: 5 * time.Second},
	}
}

func (c *stdlibSupabaseClient) FetchAccount(ctx context.Context, sessionToken string, fingerprint string) (*AccountInfo, error) {
	payload := map[string]string{"device_fingerprint": fingerprint}
	body, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/rest/v1/rpc/get_account_entitlements", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("creating request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+sessionToken)
	req.Header.Set("apikey", c.anonKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetching account: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status %d", resp.StatusCode)
	}

	var info AccountInfo
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return nil, fmt.Errorf("decoding account: %w", err)
	}
	return &info, nil
}

func (c *stdlibSupabaseClient) ResetDevice(ctx context.Context, sessionToken string, fingerprint string) error {
	payload := map[string]string{"device_fingerprint": fingerprint}
	body, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/rest/v1/rpc/reset_active_device", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("creating request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+sessionToken)
	req.Header.Set("apikey", c.anonKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("resetting device: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		msg, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("reset device failed: %d %s", resp.StatusCode, string(msg))
	}
	return nil
}
```

- [ ] **Step 4: Run test, expect pass.**

Run:
```powershell
go test ./internal/license -run TestSupabaseClientFetchAccount -v
```

Expected: PASS.

---

### Task 4: Create device fingerprint helper

**Files:**
- Create: `internal/license/fingerprint.go`
- Create: `internal/license/fingerprint_test.go`

- [ ] **Step 1: Write failing test.**

Create `internal/license/fingerprint_test.go`:

```go
package license

import (
	"runtime"
	"testing"
)

func TestFingerprintNotEmpty(t *testing.T) {
	fp, err := machineFingerprint()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if fp == "" {
		t.Fatal("fingerprint must not be empty")
	}
	if runtime.GOOS == "windows" && len(fp) < 8 {
		t.Fatal("windows fingerprint too short")
	}
}
```

- [ ] **Step 2: Run test, expect failure.**

Run:
```powershell
go test ./internal/license -run TestFingerprintNotEmpty -v
```

Expected: FAIL — `undefined: machineFingerprint`.

- [ ] **Step 3: Implement `fingerprint.go`.**

Create `internal/license/fingerprint.go`:

```go
package license

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"runtime"
)

// machineFingerprint returns a stable, non-invasive device identifier hash.
func machineFingerprint() (string, error) {
	switch runtime.GOOS {
	case "windows":
		return windowsFingerprint()
	default:
		return fallbackFingerprint()
	}
}

func windowsFingerprint() (string, error) {
	// HKLM\SOFTWARE\Microsoft\Cryptography\MachineGuid
	// Use syscall.RegOpenKeyEx + syscall.RegQueryValueEx in a follow-up if needed.
	// For this release, read via os/exec fallback or return fallback if registry fails.
	guid, err := readMachineGUID()
	if err != nil {
		return fallbackFingerprint()
	}
	return hashFingerprint(guid), nil
}

func readMachineGUID() (string, error) {
	// Placeholder for registry read. Implement with golang.org/x/sys/windows/registry
	// if approved; otherwise use exec.Command("reg", "query", ...).
	return "", fmt.Errorf("registry read not implemented")
}

func fallbackFingerprint() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return hashFingerprint(home + runtime.GOOS), nil
}

func hashFingerprint(input string) string {
	h := sha256.Sum256([]byte(input))
	return hex.EncodeToString(h[:])
}
```

- [ ] **Step 4: Run test, expect pass (fallback path).**

Run:
```powershell
go test ./internal/license -run TestFingerprintNotEmpty -v
```

Expected: PASS.

**Note:** registry implementation is intentionally left as follow-up to avoid adding `golang.org/x/sys` dependency without approval.

---

### Task 5: Create local cache

**Files:**
- Create: `internal/license/cache.go`
- Create: `internal/license/cache_test.go`

- [ ] **Step 1: Write failing test.**

Create `internal/license/cache_test.go`:

```go
package license

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestCacheRoundTrip(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "license-cache.json")
	c := newLicenseCache(path)

	expires := time.Now().Add(time.Hour).UTC()
	if err := c.write(StateActive, []Entitlement{EntitlementBundle}, &expires); err != nil {
		t.Fatalf("write failed: %v", err)
	}

	state, ents, exp, err := c.read()
	if err != nil {
		t.Fatalf("read failed: %v", err)
	}
	if state != StateActive {
		t.Fatalf("expected active, got %s", state)
	}
	if len(ents) != 1 || ents[0] != EntitlementBundle {
		t.Fatalf("unexpected entitlements: %v", ents)
	}
	if exp == nil || !exp.Equal(expires.Truncate(time.Second)) {
		t.Fatalf("unexpected expires: %v", exp)
	}
}

func TestCacheMissingReturnsError(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "missing.json")
	c := newLicenseCache(path)
	_, _, _, err := c.read()
	if !os.IsNotExist(err) {
		t.Fatalf("expected not exist, got %v", err)
	}
}
```

- [ ] **Step 2: Run test, expect failure.**

Run:
```powershell
go test ./internal/license -run TestCache -v
```

Expected: FAIL — `undefined: licenseCache`, etc.

- [ ] **Step 3: Implement `cache.go`.**

Create `internal/license/cache.go`:

```go
package license

import (
	"encoding/json"
	"fmt"
	"os"
	"time"
)

type cachedLicense struct {
	State        State         `json:"state"`
	Entitlements []Entitlement `json:"entitlements"`
	ExpiresAt    *time.Time    `json:"expires_at,omitempty"`
	UpdatedAt    time.Time     `json:"updated_at"`
}

type licenseCache struct {
	path string
}

func newLicenseCache(path string) *licenseCache {
	return &licenseCache{path: path}
}

func (c *licenseCache) read() (State, []Entitlement, *time.Time, error) {
	data, err := os.ReadFile(c.path)
	if err != nil {
		return "", nil, nil, err
	}
	var cl cachedLicense
	if err := json.Unmarshal(data, &cl); err != nil {
		return "", nil, nil, fmt.Errorf("parsing cache: %w", err)
	}
	return cl.State, cl.Entitlements, cl.ExpiresAt, nil
}

func (c *licenseCache) write(state State, entitlements []Entitlement, expiresAt *time.Time) error {
	cl := cachedLicense{
		State:        state,
		Entitlements: entitlements,
		ExpiresAt:    expiresAt,
		UpdatedAt:    time.Now().UTC(),
	}
	data, err := json.MarshalIndent(cl, "", "  ")
	if err != nil {
		return fmt.Errorf("encoding cache: %w", err)
	}
	if err := os.WriteFile(c.path, data, 0600); err != nil {
		return fmt.Errorf("writing cache: %w", err)
	}
	return nil
}
```

- [ ] **Step 4: Run test, expect pass.**

Run:
```powershell
go test ./internal/license -run TestCache -v
```

Expected: PASS.

---

### Task 6: Implement Service.Validate with all states

**Files:**
- Create: `internal/license/service.go`
- Create: `internal/license/service_test.go`

- [ ] **Step 1: Write table-driven failing test for Validate.**

Create `internal/license/service_test.go`:

```go
package license

import (
	"context"
	"errors"
	"testing"
	"time"
)

type mockSupabaseClient struct {
	info *AccountInfo
	err  error
}

func (m *mockSupabaseClient) FetchAccount(ctx context.Context, token, fp string) (*AccountInfo, error) {
	return m.info, m.err
}

func (m *mockSupabaseClient) ResetDevice(ctx context.Context, token, fp string) error {
	return nil
}

func TestValidateStates(t *testing.T) {
	future := time.Now().Add(time.Hour)
	past := time.Now().Add(-time.Hour)

	cases := []struct {
		name        string
		setupCache  func(*licenseCache) error
		sbInfo      *AccountInfo
		sbErr       error
		expectState State
	}{
		{
			name:        "active from supabase",
			sbInfo:      &AccountInfo{UserID: "u1", Email: "u1@example.com", Entitlements: []Entitlement{EntitlementOverlays}, ActiveDevice: "fp", ExpiresAt: &future},
			expectState: StateActive,
		},
		{
			name:        "authenticated no entitlement",
			sbInfo:      &AccountInfo{UserID: "u1", Email: "u1@example.com", Entitlements: nil, ActiveDevice: "fp"},
			expectState: StateAuthenticatedNoEntitlement,
		},
		{
			name:        "device limit",
			sbInfo:      &AccountInfo{UserID: "u1", Email: "u1@example.com", Entitlements: []Entitlement{EntitlementOverlays}, ActiveDevice: "other-fp"},
			expectState: StateDeviceLimit,
		},
		{
			name:        "grace from cache when supabase down",
			setupCache: func(c *licenseCache) error {
				return c.write(StateActive, []Entitlement{EntitlementOverlays}, &future)
			},
			sbErr:       errors.New("supabase down"),
			expectState: StateGrace,
		},
		{
			name:        "expired when cache past and supabase down",
			setupCache: func(c *licenseCache) error {
				return c.write(StateActive, []Entitlement{EntitlementOverlays}, &past)
			},
			sbErr:       errors.New("supabase down"),
			expectState: StateExpired,
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			dir := t.TempDir()
			cache := newLicenseCache(dir + "/cache.json")
			if c.setupCache != nil {
				if err := c.setupCache(cache); err != nil {
					t.Fatalf("setup cache: %v", err)
				}
			}
			svc := NewService(Config{GracePeriod: 24 * time.Hour}, func() (string, error) { return "fp", nil })
			svc.cache = cache
			svc.client = &mockSupabaseClient{info: c.sbInfo, err: c.sbErr}

			res, err := svc.Validate(context.Background(), "token")
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if res.State != c.expectState {
				t.Fatalf("expected state %s, got %s", c.expectState, res.State)
			}
		})
	}
}
```

- [ ] **Step 2: Run test, expect failure.**

Run:
```powershell
go test ./internal/license -run TestValidateStates -v
```

Expected: FAIL — `undefined: NewService`.

- [ ] **Step 3: Implement `service.go`.**

Create `internal/license/service.go`:

```go
package license

import (
	"context"
	"fmt"
	"os"
	"time"
)

type Service struct {
	cfg         Config
	client      supabaseClient
	cache       *licenseCache
	fingerprint func() (string, error)
}

func NewService(cfg Config, fingerprint func() (string, error)) *Service {
	return &Service{
		cfg:         cfg,
		fingerprint: fingerprint,
	}
}

func (s *Service) WithClient(client supabaseClient) *Service {
	s.client = client
	return s
}

func (s *Service) WithCache(cache *licenseCache) *Service {
	s.cache = cache
	return s
}

func (s *Service) Validate(ctx context.Context, sessionToken string) (*Result, error) {
	if sessionToken == "" {
		return &Result{State: StateAnonymous, Error: ErrMissingSession}, nil
	}

	fp, err := s.fingerprint()
	if err != nil {
		return nil, fmt.Errorf("fingerprint: %w", err)
	}

	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	info, err := s.client.FetchAccount(ctx, sessionToken, fp)
	if err == nil {
		state := StateAuthenticatedNoEntitlement
		if len(info.Entitlements) > 0 {
			state = StateActive
		}
		if info.ActiveDevice != "" && info.ActiveDevice != fp {
			state = StateDeviceLimit
		}
		res := &Result{
			State:         state,
			Entitlements:  info.Entitlements,
			UserID:        info.UserID,
			Email:         info.Email,
			DeviceOK:      info.ActiveDevice == "" || info.ActiveDevice == fp,
			LastValidated: time.Now().UTC(),
		}
		if state == StateActive {
			_ = s.cache.write(state, info.Entitlements, info.ExpiresAt)
		}
		return res, nil
	}

	// Online validation failed: try cache.
	state, ents, expires, cacheErr := s.cache.read()
	if cacheErr != nil {
		return &Result{State: StateExpired, Error: fmt.Errorf("%w: %w", ErrValidationFailed, err)}, nil
	}

	now := time.Now().UTC()
	if expires != nil && expires.After(now) {
		return &Result{State: StateGrace, Entitlements: ents, LastValidated: now, Error: err}, nil
	}

	graceEnd := now.Add(-s.cfg.GracePeriod)
	if state == StateActive || state == StateGrace {
		// Cache write time determines grace start. Use UpdatedAt from cache struct? Add it below.
		_ = graceEnd
	}

	return &Result{State: StateExpired, Entitlements: ents, Error: err}, nil
}

func (s *Service) HasEntitlement(ctx context.Context, sessionToken string, e Entitlement) (bool, error) {
	res, err := s.Validate(ctx, sessionToken)
	if err != nil {
		return false, err
	}
	if res.State != StateActive && res.State != StateGrace {
		return false, nil
	}
	for _, have := range res.Entitlements {
		if have == e {
			return true, nil
		}
	}
	return false, nil
}

func (s *Service) ResetDevice(ctx context.Context, sessionToken string) error {
	fp, err := s.fingerprint()
	if err != nil {
		return fmt.Errorf("fingerprint: %w", err)
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	return s.client.ResetDevice(ctx, sessionToken, fp)
}

func (s *Service) LoadCache() error {
	if _, _, _, err := s.cache.read(); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

func (s *Service) SaveCache(state State, entitlements []Entitlement, expiresAt *time.Time) error {
	return s.cache.write(state, entitlements, expiresAt)
}
```

- [ ] **Step 4: Fix cache struct to include `UpdatedAt` for grace calculation.**

Modify `internal/license/cache.go` `cachedLicense` to include `UpdatedAt` (already present). Implement grace window using `UpdatedAt + GracePeriod` when `expires` is past.

- [ ] **Step 5: Run tests, iterate until pass.**

Run:
```powershell
go test ./internal/license -run TestValidateStates -v
```

Expected: PASS after fixing logic.

---

### Task 7: Wire LicenseService in main.go

**Files:**
- Modify: `cmd/vantare/main.go` around line 247

- [ ] **Step 1: Read current `main.go` service registration area.**

Read `cmd/vantare/main.go` lines 240-260.

- [ ] **Step 2: Add LicenseService creation and registration after HubService.**

Insert after `wailsApp.RegisterService(application.NewService(hubSvc))`:

```go
	// License service for online entitlement validation.
	licenseCachePath := filepath.Join(cfgDir, "license-cache.json")
	licenseSvc := license.NewService(license.Config{
		SupabaseURL:     "", // filled from settings/env in Mini-Plan C
		SupabaseAnonKey: "",
		GracePeriod:     24 * time.Hour,
		CachePath:       licenseCachePath,
	}, license.MachineFingerprint)
	licenseSvc.WithCache(license.NewLicenseCache(licenseCachePath))
	wailsApp.RegisterService(application.NewService(licenseSvc))
```

Add import:
```go
"github.com/vantare/overlays/v2/internal/license"
```

- [ ] **Step 3: Export cache constructor.**

Rename `newLicenseCache` to `NewLicenseCache` in `cache.go` and `service.go`.

- [ ] **Step 4: Export `MachineFingerprint`.**

Rename `machineFingerprint` to `MachineFingerprint` in `fingerprint.go`.

- [ ] **Step 5: Build and run Go tests.**

Run:
```powershell
go build ./cmd/vantare
go test ./internal/license ./pkg/config ./internal/app
```

Expected: both pass.

---

## Sub-Plan B2: Supabase Edge Function Webhook

### Task 8: Create Edge Function structure

**Files:**
- Create: `supabase/functions/stripe-webhook/index.ts`
- Create: `supabase/functions/stripe-webhook/deno.json`
- Create: `supabase/functions/stripe-webhook/_utils/supabase.ts`
- Create: `supabase/functions/stripe-webhook/_utils/stripe.ts`

- [ ] **Step 1: Create `deno.json`.**

```json
{
  "imports": {
    "stripe": "npm:stripe@^17.0.0"
  }
}
```

- [ ] **Step 2: Create Supabase admin client helper.**

Create `supabase/functions/stripe-webhook/_utils/supabase.ts`:

```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
```

- [ ] **Step 3: Create Stripe signature helper.**

Create `supabase/functions/stripe-webhook/_utils/stripe.ts`:

```typescript
import Stripe from "stripe";

const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

export function verifyStripeSignature(payload: string, signature: string): Stripe.Event {
  const stripe = new Stripe("", { apiVersion: "2024-06-20" });
  return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
}
```

- [ ] **Step 4: Implement main Edge Function.**

Create `supabase/functions/stripe-webhook/index.ts`:

```typescript
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { supabaseAdmin } from "./_utils/supabase.ts";
import { verifyStripeSignature } from "./_utils/stripe.ts";
import type Stripe from "stripe";

serve(async (req) => {
  const signature = req.headers.get("stripe-signature") ?? "";
  const payload = await req.text();

  let event: Stripe.Event;
  try {
    event = verifyStripeSignature(payload, signature);
  } catch (err) {
    return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      default:
        break;
    }
  } catch (err) {
    console.error("Webhook handler error:", err);
    return new Response(JSON.stringify({ error: "Handler failed" }), { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
});

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  // Resolve line items, price IDs and user_id from metadata.
  // Upsert stripe_customers, stripe_subscriptions and user_entitlements.
  console.log("checkout completed", session.id);
}

async function handleSubscriptionUpdated(sub: Stripe.Subscription) {
  console.log("subscription updated", sub.id);
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  console.log("subscription deleted", sub.id);
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  console.log("invoice payment failed", invoice.id);
}
```

**Note:** full entitlement mapping implementation is intentionally left as the next sub-task to keep the Edge Function deployable early.

- [ ] **Step 5: Validate Deno syntax without executing.**

Run:
```powershell
deno check supabase/functions/stripe-webhook/index.ts
```

Expected: no type errors. If `deno` is not installed, document as "not run".

---

### Task 9: Write webhook deployment docs

**Files:**
- Create: `docs/stripe-webhook-deployment.md`

- [ ] **Step 1: Write deployment guide.**

Create `docs/stripe-webhook-deployment.md`:

```markdown
# Stripe Webhook Deployment

## Deploy the Edge Function

```bash
supabase functions deploy stripe-webhook
```

## Environment variables

Set in Supabase Dashboard:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_WEBHOOK_SECRET`

## Stripe dashboard configuration

Webhook URL: `https://<project>.supabase.co/functions/v1/stripe-webhook`

Events to send:
- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`

## Local testing

```bash
supabase functions serve stripe-webhook --env-file .env.local
```

Use `stripe cli` to forward events:
```bash
stripe listen --forward-to localhost:54321/functions/v1/stripe-webhook
```
```

- [ ] **Step 2: Commit docs.**

Run:
```powershell
git add docs/stripe-webhook-deployment.md
```

---

### Task 10: Update current plan

**Files:**
- Modify: `docs/current-plan.md`

- [ ] **Step 1: Update objective block.**

Change `docs/current-plan.md` `## Objetivo actual` to:

```markdown
## Objetivo actual

Release 02 Mini-Plan B completado: Go LicenseService con cache local y Supabase Edge Function webhook estructurado. Pendiente Mini-Plan C (UI auth/license) y el mapeo completo de entitlements en el webhook.
```

- [ ] **Step 2: Commit.**

Run:
```powershell
git add docs/current-plan.md
```

---

### Task 11: Final checks and commit

- [ ] **Step 1: Run Go checks.**

Run:
```powershell
gofmt -l internal/license/*.go cmd/vantare/main.go
go test ./internal/license ./pkg/config ./internal/app
go build ./cmd/vantare
```

Expected: `gofmt` empty, tests pass, build succeeds.

- [ ] **Step 2: Run frontend type check (no UI changes, should pass).**

Run:
```powershell
pnpm --dir frontend exec tsc -b --noEmit
```

Expected: pass.

- [ ] **Step 3: Run git diff check.**

Run:
```powershell
git diff --check
```

Expected: no errors.

- [ ] **Step 4: Stage and commit all Mini-Plan B changes.**

Run:
```powershell
git add internal/license/ cmd/vantare/main.go supabase/functions/stripe-webhook/ docs/stripe-webhook-deployment.md docs/current-plan.md
git commit -m "feat(license): Release 02 Mini-Plan B - LicenseService + webhook skeleton

- Add internal/license package: types, errors, Supabase stdlib client,
  device fingerprint, local cache, and Service with Validate/HasEntitlement/ResetDevice.
- Wire LicenseService into cmd/vantare/main.go.
- Add Supabase Edge Function stripe-webhook skeleton with Stripe signature
  verification and event routing.
- Add docs/stripe-webhook-deployment.md.
- Update docs/current-plan.md.

Webhook entitlement mapping left for follow-up. No new Go dependencies."
```

---

## Acceptance criteria

- [ ] `internal/license` package compiles and all tests pass.
- [ ] `cmd/vantare/main.go` registers `license.Service`.
- [ ] Supabase Edge Function `stripe-webhook` passes `deno check`.
- [ ] `docs/stripe-webhook-deployment.md` has deploy steps and env vars.
- [ ] No new Go dependencies added.
- [ ] No frontend UI code added.
- [ ] `git diff --check` passes.

## Checks

- `gofmt -l internal/license/*.go cmd/vantare/main.go`
- `go test ./internal/license ./pkg/config ./internal/app`
- `go build ./cmd/vantare`
- `pnpm --dir frontend exec tsc -b --noEmit`
- `git diff --check`

## Worker prompt

```markdown
Implement Release 02 Mini-Plan B from docs/superpowers/plans/2026-06-26-release-02-miniB-license-webhook.md.
Start with Sub-Plan B1 (Go LicenseService). Do not add new Go dependencies.
Do not write frontend UI code. Do not modify profile schema.
Run the checks listed in the plan and report results.
```
