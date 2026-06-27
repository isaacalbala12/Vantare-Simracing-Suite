# Release 02 Mini-Plan C — Auth And License UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the frontend login, paywall, license banners, account settings and onboarding integration that consumes the Go `LicenseService` from Mini-Plan B.

**Architecture:** The frontend uses `@supabase/supabase-js` only for authentication (sign-in, sign-up, OAuth, sign-out, session refresh). The Go `LicenseService` owns entitlement validation and emits `license:changed` Wails events. A React `LicenseProvider` exposes `useLicense()` to the rest of the app. Route gating happens at the Hub root: anonymous users see login, users without entitlements see paywall, active/grace users see the app, expired/device-limit users see a blocker.

**Tech Stack:** React/TypeScript, Wails v3 Events, `@supabase/supabase-js`, Tailwind CSS (existing), Vitest, Go/Wails.

---

## New dependency justification

We need `@supabase/supabase-js` in the frontend because Supabase is the chosen auth provider (Release 02 decision) and there is no way to perform email/password login, OAuth redirects or session refresh without a Supabase client in the browser. This dependency is scoped exclusively to authentication; no other UI module will import it. It adds no Go dependencies.

---

## File structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `frontend/src/lib/supabase-auth.ts` | Supabase client singleton, auth methods, session retrieval. |
| Create | `frontend/src/lib/supabase-auth.test.ts` | Tests for auth helpers with mocked `createClient`. |
| Create | `frontend/src/lib/license.ts` | License state types, `LicenseProvider`, `useLicense()` hook, Wails event bridge. |
| Create | `frontend/src/lib/license.test.tsx` | Tests for `useLicense` with mocked Wails Events. |
| Create | `frontend/src/hub/auth/LoginScreen.tsx` | Email/password + Google/Discord OAuth login screen. |
| Create | `frontend/src/hub/auth/LoginScreen.test.tsx` | Tests for login screen. |
| Create | `frontend/src/hub/auth/PaywallScreen.tsx` | Plan selection and Stripe Checkout CTA. |
| Create | `frontend/src/hub/auth/PaywallScreen.test.tsx` | Tests for paywall. |
| Create | `frontend/src/hub/auth/LicenseBanner.tsx` | Sticky banner for grace/expired/device-limit states. |
| Create | `frontend/src/hub/auth/LicenseBanner.test.tsx` | Tests for banner rendering. |
| Create | `frontend/src/hub/settings/AccountSettings.tsx` | Account email, plan, reset device, logout. |
| Create | `frontend/src/hub/settings/AccountSettings.test.tsx` | Tests for account settings. |
| Modify | `frontend/src/hub/pages/HubPage.tsx` (or root routing file) | Gate routes by license state; render login/paywall/banner. |
| Modify | `frontend/src/hub/pages/HubPage.test.tsx` | Add tests for route gating. |
| Modify | `frontend/src/hub/overlays/OverlaysStudioPage.tsx` (or onboarding flow) | Insert login/plan steps into onboarding if not done. |
| Modify | `internal/license/service.go` | Emit `license:changed` after `Validate` and after `ResetDevice`. |
| Modify | `cmd/vantare/main.go` | Read Supabase URL/anon key from settings/env, inject `stdlibSupabaseClient` into `license.Service`, listen for `license:changed` and re-emit to UI. |
| Modify | `frontend/package.json` | Add `@supabase/supabase-js` dependency. |
| Modify | `frontend/pnpm-lock.yaml` | Will update automatically after `pnpm install`. |
| Modify | `docs/current-plan.md` | Update objective to Mini-Plan C completion. |

**Forbidden files in this mini-plan:**
- `pkg/config/profile.go` and `frontend/src/lib/profile.ts` (no profile schema changes).
- Any telemetry, OBS, LayoutStudio, WidgetStudio runtime logic.
- Any backend webhook code (already done in Mini-Plan B).
- Any build/package config beyond the single Supabase dependency.

---

### Task 1: Add Supabase JS dependency

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/pnpm-lock.yaml` (via install)

- [ ] **Step 1: Check current frontend package.json.**

Read `frontend/package.json`.

- [ ] **Step 2: Add dependency.**

Add to `dependencies` in `frontend/package.json`:

```json
"@supabase/supabase-js": "^2.45.0"
```

- [ ] **Step 3: Install and update lockfile.**

Run:
```powershell
pnpm --dir frontend install
```

Expected: `pnpm-lock.yaml` updates with `@supabase/supabase-js` and its transitive deps.

- [ ] **Step 4: Verify TypeScript still compiles.**

Run:
```powershell
pnpm --dir frontend exec tsc -b --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit.**

Run:
```powershell
git add frontend/package.json frontend/pnpm-lock.yaml
git commit -m "deps(frontend): add @supabase/supabase-js for auth"
```

---

### Task 2: Create Supabase auth module

**Files:**
- Create: `frontend/src/lib/supabase-auth.ts`
- Create: `frontend/src/lib/supabase-auth.test.ts`

- [ ] **Step 1: Write failing test.**

Create `frontend/src/lib/supabase-auth.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { getSupabaseClient, signInWithEmail } from "./supabase-auth";

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({ data: { session: { access_token: "tok" } }, error: null }),
    },
  })),
}));

describe("signInWithEmail", () => {
  it("returns session on success", async () => {
    const result = await signInWithEmail("u@example.com", "pass");
    expect(result.session?.access_token).toBe("tok");
  });
});
```

- [ ] **Step 2: Run test and confirm failure.**

Run:
```powershell
pnpm --dir frontend test -- supabase-auth
```

Expected: FAIL — `undefined: signInWithEmail`.

- [ ] **Step 3: Implement `supabase-auth.ts`.**

Create `frontend/src/lib/supabase-auth.ts`:

```typescript
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!client) {
    client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
      },
    });
  }
  return client;
}

export async function signInWithEmail(email: string, password: string): Promise<{ session: Session | null; error?: string }> {
  const { data, error } = await getSupabaseClient().auth.signInWithPassword({ email, password });
  if (error) {
    return { session: null, error: error.message };
  }
  return { session: data.session };
}

export async function signOut(): Promise<{ error?: string }> {
  const { error } = await getSupabaseClient().auth.signOut();
  return { error: error?.message };
}

export async function getSession(): Promise<Session | null> {
  const { data } = await getSupabaseClient().auth.getSession();
  return data.session;
}

export async function signInWithOAuth(provider: "google" | "discord"): Promise<{ error?: string }> {
  const { error } = await getSupabaseClient().auth.signInWithOAuth({
    provider,
    options: { redirectTo: "http://localhost:34115/#/auth/callback" },
  });
  return { error: error?.message };
}
```

- [ ] **Step 4: Run test and confirm pass.**

Run:
```powershell
pnpm --dir frontend test -- supabase-auth
```

Expected: PASS.

---

### Task 3: Create license frontend module and hook

**Files:**
- Create: `frontend/src/lib/license.ts`
- Create: `frontend/src/lib/license.test.tsx`

- [ ] **Step 1: Write failing test for `useLicense()`.**

Create `frontend/src/lib/license.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { LicenseProvider, useLicense } from "./license";

vi.mock("@wailsio/runtime", () => ({
  Events: {
    On: vi.fn().mockReturnValue(() => {}),
    Emit: vi.fn(),
  },
}));

describe("useLicense", () => {
  it("starts in loading state", () => {
    const { result } = renderHook(() => useLicense(), { wrapper: LicenseProvider });
    expect(result.current.loading).toBe(true);
  });
});
```

- [ ] **Step 2: Run test, expect failure.**

Run:
```powershell
pnpm --dir frontend test -- license
```

Expected: FAIL — `undefined: useLicense`.

- [ ] **Step 3: Implement `license.ts`.**

Create `frontend/src/lib/license.ts`:

```typescript
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Events } from "@wailsio/runtime";

export type LicenseState =
  | "anonymous"
  | "authenticated-no-entitlement"
  | "active"
  | "grace"
  | "expired"
  | "device-limit";

export type Entitlement = "overlays" | "engineer" | "bundle" | "beta_access" | "ac_lua_pack";

export type LicenseResult = {
  state: LicenseState;
  entitlements: Entitlement[];
  userId: string;
  email: string;
  deviceOK: boolean;
  graceEndsAt?: string;
  error?: string;
};

type LicenseContextValue = {
  result: LicenseResult | null;
  loading: boolean;
  refresh: () => void;
};

const LicenseContext = createContext<LicenseContextValue | null>(null);

export function LicenseProvider({ children }: { children: React.ReactNode }) {
  const [result, setResult] = useState<LicenseResult | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    Events.Emit("license:validate", {});
  }, []);

  useEffect(() => {
    const unsub = Events.On("license:changed", (event: unknown) => {
      const data = (event as { data?: LicenseResult })?.data;
      setResult(data ?? null);
      setLoading(false);
    });
    refresh();
    return () => unsub();
  }, [refresh]);

  return (
    <LicenseContext.Provider value={{ result, loading, refresh }}>
      {children}
    </LicenseContext.Provider>
  );
}

export function useLicense(): LicenseContextValue {
  const ctx = useContext(LicenseContext);
  if (!ctx) {
    throw new Error("useLicense must be used inside LicenseProvider");
  }
  return ctx;
}
```

- [ ] **Step 4: Run test, expect pass.**

Run:
```powershell
pnpm --dir frontend test -- license
```

Expected: PASS.

---

### Task 4: Emit license events from Go service

**Files:**
- Modify: `internal/license/service.go`
- Modify: `internal/license/types.go` (add `ToWire()` helper)
- Create: `internal/license/wire_test.go`

- [ ] **Step 1: Add wire serialization helper to types.**

Append to `internal/license/types.go`:

```go
import "time"

// LicenseWire is the JSON shape sent to the UI via Wails events.
type LicenseWire struct {
	State         string        `json:"state"`
	Entitlements  []Entitlement `json:"entitlements"`
	UserID        string        `json:"userId"`
	Email         string        `json:"email"`
	DeviceOK      bool          `json:"deviceOK"`
	GraceEndsAt   *time.Time    `json:"graceEndsAt,omitempty"`
	LastValidated time.Time     `json:"lastValidated"`
	Error         string        `json:"error,omitempty"`
}

func (r *Result) ToWire() LicenseWire {
	var errMsg string
	if r.Error != nil {
		errMsg = r.Error.Error()
	}
	return LicenseWire{
		State:         string(r.State),
		Entitlements:  r.Entitlements,
		UserID:        r.UserID,
		Email:         r.Email,
		DeviceOK:      r.DeviceOK,
		GraceEndsAt:   r.GraceEndsAt,
		LastValidated: r.LastValidated,
		Error:         errMsg,
	}
}
```

- [ ] **Step 2: Modify Service to emit `license:changed`.**

Add to `internal/license/service.go`:

```go
func (s *Service) emitChanged(res *Result) {
	if s.emitter == nil {
		return
	}
	s.emitter.Emit("license:changed", res.ToWire())
}
```

Call `s.emitChanged(res)` at the end of `Validate` before returning. Also call it after successful `ResetDevice` with a fresh `Validate` result.

- [ ] **Step 3: Add emitter setter and constructor injection.**

Change `NewService` to accept `emitter EventEmitter` (or add `WithEmitter`). Update `cmd/vantare/main.go` accordingly.

- [ ] **Step 4: Run Go tests.**

Run:
```powershell
go test ./internal/license -v
```

Expected: PASS.

---

### Task 5: Wire Supabase config and license events in main.go

**Files:**
- Modify: `cmd/vantare/main.go`

- [ ] **Step 1: Update LicenseService creation.**

Find the existing block added in Mini-Plan B and replace with:

```go
	// License service for online entitlement validation.
	licenseCachePath := filepath.Join(cfgDir, "license-cache.json")
	supabaseURL := appSettings.SupabaseURL      // or env var
	supabaseAnonKey := appSettings.SupabaseAnonKey // or env var
	licenseSvc := license.NewService(license.Config{
		SupabaseURL:     supabaseURL,
		SupabaseAnonKey: supabaseAnonKey,
		GracePeriod:     24 * time.Hour,
		CachePath:       licenseCachePath,
	}, emitter, license.MachineFingerprint)
	licenseSvc.WithCache(license.NewLicenseCache(licenseCachePath))
	if supabaseURL != "" && supabaseAnonKey != "" {
		licenseSvc.WithClient(license.NewStdlibSupabaseClient(supabaseURL, supabaseAnonKey))
	}
	wailsApp.RegisterService(application.NewService(licenseSvc))

	// Forward UI license validation requests to the service.
	app.Event.On("license:validate", func(_ *application.CustomEvent) {
		session, _ := settingsSvc.SessionToken() // or from frontend via event payload
		res, _ := licenseSvc.Validate(context.Background(), session)
		licenseSvc.EmitChanged(res)
	})
```

- [ ] **Step 2: Export required constructors in license package.**

Ensure these are exported:
- `NewStdlibSupabaseClient` (rename `newStdlibSupabaseClient`).
- `NewLicenseCache` (already exported).
- `MachineFingerprint` (already exported).
- `NewService` signature accepts `emitter EventEmitter`.

- [ ] **Step 3: Build and test.**

Run:
```powershell
go build ./cmd/vantare
go test ./internal/license ./pkg/config ./internal/app
```

Expected: both pass.

---

### Task 6: Create login screen

**Files:**
- Create: `frontend/src/hub/auth/LoginScreen.tsx`
- Create: `frontend/src/hub/auth/LoginScreen.test.tsx`

- [ ] **Step 1: Write failing test.**

Create `frontend/src/hub/auth/LoginScreen.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LoginScreen } from "./LoginScreen";

vi.mock("../../lib/supabase-auth", () => ({
  signInWithEmail: vi.fn().mockResolvedValue({ session: { access_token: "tok" } }),
}));

describe("LoginScreen", () => {
  it("renders email and password inputs", () => {
    render(<LoginScreen onLoggedIn={vi.fn()} />);
    expect(screen.getByLabelText(/email/i)).toBeTruthy();
    expect(screen.getByLabelText(/contraseña/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test, expect failure.**

Run:
```powershell
pnpm --dir frontend test -- LoginScreen
```

Expected: FAIL — `undefined: LoginScreen`.

- [ ] **Step 3: Implement `LoginScreen.tsx`.**

Create `frontend/src/hub/auth/LoginScreen.tsx`:

```tsx
import { useCallback, useState } from "react";
import { signInWithEmail } from "../../lib/supabase-auth";

type LoginScreenProps = {
  onLoggedIn: () => void;
};

export function LoginScreen({ onLoggedIn }: LoginScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      const { session, error: msg } = await signInWithEmail(email, password);
      if (msg) {
        setError(msg);
        return;
      }
      if (session) {
        onLoggedIn();
      }
    },
    [email, password, onLoggedIn],
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a] text-white">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 rounded-lg border border-white/10 bg-[#111] p-6">
        <h1 className="text-center font-mono text-sm uppercase tracking-widest">Iniciar sesión</h1>
        {error && <p className="text-center font-mono text-[10px] text-red-400">{error}</p>}
        <label className="block space-y-1">
          <span className="font-mono text-[10px] uppercase text-vantare-textDim">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded border border-white/10 bg-black px-2 py-1 font-mono text-xs outline-none focus:border-vantare-accent"
          />
        </label>
        <label className="block space-y-1">
          <span className="font-mono text-[10px] uppercase text-vantare-textDim">Contraseña</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded border border-white/10 bg-black px-2 py-1 font-mono text-xs outline-none focus:border-vantare-accent"
          />
        </label>
        <button
          type="submit"
          className="w-full rounded bg-vantare-accent py-2 font-mono text-xs font-bold uppercase tracking-widest text-black hover:opacity-90"
        >
          Entrar
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Run test, expect pass.**

Run:
```powershell
pnpm --dir frontend test -- LoginScreen
```

Expected: PASS.

---

### Task 7: Create paywall screen

**Files:**
- Create: `frontend/src/hub/auth/PaywallScreen.tsx`
- Create: `frontend/src/hub/auth/PaywallScreen.test.tsx`

- [ ] **Step 1: Write failing test.**

Create `frontend/src/hub/auth/PaywallScreen.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PaywallScreen } from "./PaywallScreen";

describe("PaywallScreen", () => {
  it("renders plan cards", () => {
    render(<PaywallScreen email="u@example.com" />);
    expect(screen.getByText(/overlays/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Implement `PaywallScreen.tsx`.**

Create `frontend/src/hub/auth/PaywallScreen.tsx`:

```tsx
import { useCallback } from "react";

const PLANS = [
  { key: "beta_access", name: "Beta Access", price: "5 EUR/mes", features: ["Overlays", "Engineer"] },
  { key: "founder", name: "Founder", price: "20 EUR/mes", features: ["Todo Beta Access", "AC Lua Pack"] },
];

type PaywallScreenProps = {
  email: string;
};

export function PaywallScreen({ email }: PaywallScreenProps) {
  const handleSubscribe = useCallback((planKey: string) => {
    // Mini-Plan C v1 opens Stripe Checkout in external browser.
    // URL construction will be provided by backend/settings in follow-up.
    console.log("subscribe", planKey, email);
  }, [email]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a0a] p-4 text-white">
      <h1 className="mb-6 font-mono text-sm uppercase tracking-widest">Elige tu plan</h1>
      &lt;div className="grid gap-4 md:grid-cols-2"&gt;
        {PLANS.map((plan) => (
          &lt;div key={plan.key} className="w-64 rounded-lg border border-white/10 bg-[#111] p-4"&gt;
            &lt;h2 className="font-mono text-xs uppercase"&gt;{plan.name}&lt;/h2&gt;
            &lt;p className="font-mono text-[10px] text-vantare-textDim"&gt;{plan.price}&lt;/p&gt;
            &lt;ul className="my-3 space-y-1"&gt;
              {plan.features.map((f) => (
                &lt;li key={f} className="font-mono text-[10px] text-vantare-textMuted"&gt;{f}&lt;/li&gt;
              ))}
            &lt;/ul&gt;
            &lt;button
              onClick={() => handleSubscribe(plan.key)}
              className="w-full rounded border border-white/20 py-1.5 font-mono text-[10px] uppercase hover:bg-white/5"
            &gt;
              Suscribirse
            &lt;/button&gt;
          &lt;/div&gt;
        ))}
      &lt;/div&gt;
    &lt;/div&gt;
  );
}
```

- [ ] **Step 3: Run test, expect pass.**

Run:
```powershell
pnpm --dir frontend test -- PaywallScreen
```

Expected: PASS.

---

### Task 8: Create license banner

**Files:**
- Create: `frontend/src/hub/auth/LicenseBanner.tsx`
- Create: `frontend/src/hub/auth/LicenseBanner.test.tsx`

- [ ] **Step 1: Implement `LicenseBanner.tsx`.**

Create `frontend/src/hub/auth/LicenseBanner.tsx`:

```tsx
import { useLicense } from "../../lib/license";

export function LicenseBanner() {
  const { result, loading } = useLicense();
  if (loading || !result) return null;
  if (result.state === "active") return null;

  const messages: Record<string, string> = {
    grace: `Licencia en periodo de gracia${result.graceEndsAt ? ` hasta ${new Date(result.graceEndsAt).toLocaleString()}` : ""}`,
    expired: "Licencia expirada. Renueva para continuar.",
    "device-limit": "Límite de dispositivo alcanzado. Restablece tu PC activo.",
  };

  return (
    <div className="bg-red-500/10 border-b border-red-500/20 px-4 py-2 text-center">
      &lt;p className="font-mono text-[10px] uppercase text-red-400"&gt;
        {messages[result.state] ?? "Estado de licencia desconocido"}
      &lt;/p&gt;
    &lt;/div&gt;
  );
}
```

- [ ] **Step 2: Write test.**

Create `frontend/src/hub/auth/LicenseBanner.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LicenseBanner } from "./LicenseBanner";
import { LicenseProvider } from "../../lib/license";

vi.mock("@wailsio/runtime", () => ({
  Events: { On: vi.fn().mockReturnValue(() => {}), Emit: vi.fn() },
}));

describe("LicenseBanner", () => {
  it("renders nothing when active", () => {
    render(
      &lt;LicenseProvider&gt;
        &lt;LicenseBanner /&gt;
      &lt;/LicenseProvider&gt;
    );
    expect(screen.queryByText(/gracia/i)).toBeNull();
  });
});
```

- [ ] **Step 3: Run test, expect pass.**

Run:
```powershell
pnpm --dir frontend test -- LicenseBanner
```

Expected: PASS.

---

### Task 9: Create account settings panel

**Files:**
- Create: `frontend/src/hub/settings/AccountSettings.tsx`
- Create: `frontend/src/hub/settings/AccountSettings.test.tsx`

- [ ] **Step 1: Implement `AccountSettings.tsx`.**

Create `frontend/src/hub/settings/AccountSettings.tsx`:

```tsx
import { useCallback } from "react";
import { useLicense } from "../../lib/license";
import { signOut } from "../../lib/supabase-auth";

export function AccountSettings() {
  const { result, refresh } = useLicense();

  const handleLogout = useCallback(async () => {
    await signOut();
    refresh();
  }, [refresh]);

  return (
    <div className="space-y-4 text-white">
      &lt;h2 className="font-mono text-xs uppercase tracking-widest"&gt;Cuenta&lt;/h2&gt;
      &lt;div className="rounded border border-white/10 bg-[#111] p-3"&gt;
        &lt;p className="font-mono text-[10px] text-vantare-textDim"&gt;Email&lt;/p&gt;
        &lt;p className="font-mono text-xs"&gt;{result?.email ?? "—"}&lt;/p&gt;
      &lt;/div&gt;
      &lt;div className="rounded border border-white/10 bg-[#111] p-3"&gt;
        &lt;p className="font-mono text-[10px] text-vantare-textDim"&gt;Plan&lt;/p&gt;
        &lt;p className="font-mono text-xs uppercase"&gt;{result?.state ?? "loading"}&lt;/p&gt;
      &lt;/div&gt;
      &lt;button
        onClick={handleLogout}
        className="rounded border border-white/20 px-3 py-1.5 font-mono text-[10px] uppercase hover:bg-white/5"
      &gt;
        Cerrar sesión
      &lt;/button&gt;
    &lt;/div&gt;
  );
}
```

- [ ] **Step 2: Write test.**

Create `frontend/src/hub/settings/AccountSettings.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AccountSettings } from "./AccountSettings";
import { LicenseProvider } from "../../lib/license";

vi.mock("@wailsio/runtime", () => ({
  Events: { On: vi.fn().mockReturnValue(() => {}), Emit: vi.fn() },
}));

describe("AccountSettings", () => {
  it("renders account section", () => {
    render(
      &lt;LicenseProvider&gt;
        &lt;AccountSettings /&gt;
      &lt;/LicenseProvider&gt;
    );
    expect(screen.getByText(/cuenta/i)).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run test, expect pass.**

Run:
```powershell
pnpm --dir frontend test -- AccountSettings
```

Expected: PASS.

---

### Task 10: Gate Hub routes by license state

**Files:**
- Modify: `frontend/src/hub/pages/HubPage.tsx`
- Modify: `frontend/src/hub/pages/HubPage.test.tsx`

- [ ] **Step 1: Read current `HubPage.tsx`.**

Read the file and identify where routes are rendered.

- [ ] **Step 2: Wrap routes with `LicenseProvider`, `LoginScreen`, `PaywallScreen`, `LicenseBanner`.**

Insert near the top level:

```tsx
import { LicenseProvider, useLicense } from "../../lib/license";
import { LoginScreen } from "../auth/LoginScreen";
import { PaywallScreen } from "../auth/PaywallScreen";
import { LicenseBanner } from "../auth/LicenseBanner";

function LicenseGate({ children }: { children: React.ReactNode }) {
  const { result, loading } = useLicense();
  if (loading) return <div className="text-white">Cargando licencia...</div>;
  if (!result || result.state === "anonymous") return <LoginScreen onLoggedIn={() => window.location.reload()} />;
  if (result.state === "authenticated-no-entitlement") return <PaywallScreen email={result.email} />;
  if (result.state === "expired" || result.state === "device-limit") {
    return <PaywallScreen email={result.email} />; // v1: redirect to paywall/support
  }
  return <>
    &lt;LicenseBanner /&gt;
    {children}
  &lt;/&gt;;
}
```

Wrap the existing app content with `LicenseProvider` and `LicenseGate`.

- [ ] **Step 3: Add tests for gating.**

Add tests in `HubPage.test.tsx` that mock `useLicense` and verify each state renders the correct screen.

- [ ] **Step 4: Run full frontend tests.**

Run:
```powershell
pnpm --dir frontend test
```

Expected: PASS after adjusting any broken existing tests.

---

### Task 11: Integrate auth into onboarding

**Files:**
- Modify: onboarding flow files in `frontend/src/hub/onboarding/` or `frontend/src/hub/overlays/OverlaysStudioPage.tsx`

- [ ] **Step 1: Locate onboarding flow.**

Find the component that renders onboarding steps.

- [ ] **Step 2: Insert login and plan steps.**

After the simulator selection step, add:
- If no Supabase session → show `LoginScreen`.
- If session but `state === authenticated-no-entitlement` → show `PaywallScreen`.
- Then continue to recommended profile selection.

- [ ] **Step 3: Add test.**

Add/update onboarding test to verify auth step ordering.

---

### Task 12: Update docs/current-plan.md

**Files:**
- Modify: `docs/current-plan.md`

- [ ] **Step 1: Update objective block.**

Change `## Objetivo actual` to:

```markdown
## Objetivo actual

Release 02 Mini-Plan C completado: UI auth/license con login, paywall, banners, account settings, route gating y onboarding integration. Pendiente follow-up del webhook entitlement mapping y gate manual.
```

- [ ] **Step 2: Commit planning update.**

Run:
```powershell
git add docs/current-plan.md
```

---

### Task 13: Final checks and commit

- [ ] **Step 1: Run full checks.**

Run:
```powershell
gofmt -l internal/license/*.go cmd/vantare/main.go
go test ./internal/license ./pkg/config ./internal/app
go build ./cmd/vantare
pnpm --dir frontend test
pnpm --dir frontend build
pnpm --dir frontend lint
git diff --check
```

Expected: all pass. `pnpm --dir frontend lint` may show the existing `.eslintignore` warning but no errors.

- [ ] **Step 2: Stage and commit.**

Run:
```powershell
git add frontend/src/lib/supabase-auth.ts frontend/src/lib/supabase-auth.test.ts
frontendsrc/lib/license.ts frontend/src/lib/license.test.tsx
frontend/src/hub/auth/ frontend/src/hub/settings/AccountSettings*
frontend/src/hub/pages/HubPage.tsx frontend/src/hub/pages/HubPage.test.tsx
internal/license/service.go internal/license/types.go internal/license/wire_test.go
frontend/package.json frontend/pnpm-lock.yaml
cmd/vantare/main.go docs/current-plan.md
git commit -m "feat(auth): Release 02 Mini-Plan C - auth and license UI

- Add @supabase/supabase-js dependency.
- Add supabase-auth module with email/password and OAuth helpers.
- Add license frontend module with LicenseProvider and useLicense hook.
- Emit license:changed events from Go LicenseService.
- Wire Supabase URL/anon key and license events in main.go.
- Add LoginScreen, PaywallScreen, LicenseBanner and AccountSettings.
- Gate Hub routes by license state and integrate into onboarding.
- Update docs/current-plan.md.

Pending: webhook entitlement mapping and manual QA."
```

---

## Acceptance criteria

- [ ] User can log in with email/password.
- [ ] User can see login, paywall, banner and account screens.
- [ ] `useLicense()` exposes license state reactively.
- [ ] `LicenseService` emits `license:changed` events.
- [ ] `cmd/vantare/main.go` injects Supabase client and forwards validation events.
- [ ] Route gating renders correct screen per state.
- [ ] Onboarding includes login/plan steps.
- [ ] All frontend tests pass.
- [ ] `go build ./cmd/vantare` succeeds.
- [ ] No new Go dependencies.

## Checks

- `gofmt -l internal/license/*.go cmd/vantare/main.go`
- `go test ./internal/license ./pkg/config ./internal/app`
- `go build ./cmd/vantare`
- `pnpm --dir frontend test`
- `pnpm --dir frontend build`
- `pnpm --dir frontend lint`
- `git diff --check`

## Worker prompt

```markdown
Implement Release 02 Mini-Plan C from docs/superpowers/plans/2026-06-26-release-02-miniC-auth-license-ui.md.
This is frontend-heavy but requires small Go changes to emit/license events.
You may add @supabase/supabase-js as the only new frontend dependency.
Do not add new Go dependencies. Do not modify profile schema.
Run the checks listed in the plan and report results.
```
