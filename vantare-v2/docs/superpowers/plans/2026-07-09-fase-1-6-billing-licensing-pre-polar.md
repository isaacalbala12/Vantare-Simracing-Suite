# Fase 1.6 — Billing/Licensing agnóstico (pre-Polar) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preparar Vantare con un modelo de billing/licensing provider-agnostic (Polar-ready), eliminar endpoints fantasma de checkout/portal en frontend, y crear la migración SQL correcta — sin aplicar a remoto, sin integrar Polar.

**Architecture:** El remoto usa el esquema viejo (`licenses`, `subscriptions`). El Go y el frontend usan el modelo nuevo (`user_entitlements`, `devices`, RPCs). Esta fase añade tablas nuevas de forma **additive** en [`supabase/migrations/`](supabase/migrations/) (raíz del monorepo, carpeta linkeada por CLI), archiva la migración muerta en `vantare-v2/`, y pone `BILLING_ENABLED=false` en frontend vía `billingClient`. No se borran tablas viejas ni se hace `db push`.

**Tech Stack:** SQL/Postgres (Supabase), PL/pgSQL, React 19 + TypeScript + Vitest, Go `internal/license`, Supabase CLI (solo lectura en auditoría).

**Ubicación:** `docs/superpowers/plans/2026-07-09-fase-1-6-billing-licensing-pre-polar.md`

---

## Contexto mínimo (leer antes de Task 1)

### Estado remoto (ya verificado)

- Proyecto: `vantare-overlays` / ref `olhwhfaczmrmooeaoqqf`
- Migración aplicada: `20260605140000_initial_schema.sql`
- Tablas: `profiles`, `licenses`, `subscriptions`, `license_validations`, `hwid_changes`, `rate_limits`
- **No existen:** `user_entitlements`, `devices`, `license_events`, `billing_*`, RPCs

### Dos carpetas Supabase (problema)

| Ruta | Contenido | CLI linkeado |
|------|-----------|--------------|
| `supabase/` (raíz repo) | `20260605140000_initial_schema.sql`, `validate-license` | **Sí** |
| `vantare-v2/supabase/` | `0001_licensing_schema.sql` (muerta), `stripe-webhook` | **No** |

### Contratos Go (no cambiar firmas RPC)

- `POST /rest/v1/rpc/get_account_entitlements` body: `{"device_fingerprint":"<hash>"}`
- Respuesta mínima (obligatoria): `{user_id, email, entitlements[], active_device, expires_at}`
- Respuesta extra (opcional, ignorada por Go hoy): `device_ok`, `provider_customer_id`, `billing_provider`
- Device mismatch: RPC devuelve `active_device` = fingerprint **guardado en BD** (no el del cliente). Go compara en `fromSupabase` → `device-limit`, `deviceOK=false`. Premium bloqueado en `access-policy.ts`.
- `POST /rest/v1/rpc/reset_active_device` mismo body
- Código: [`vantare-v2/internal/license/supabase_client.go`](vantare-v2/internal/license/supabase_client.go), [`service.go`](vantare-v2/internal/license/service.go) L148-152

### Bugs actuales a corregir

1. [`PaywallScreen.tsx`](vantare-v2/frontend/src/hub/auth/PaywallScreen.tsx) llama `/functions/v1/create-checkout-session` — **no existe**
2. [`AccountSettings.tsx`](vantare-v2/frontend/src/hub/settings/AccountSettings.tsx) llama `/functions/v1/create-portal-session` y manda `userId` como `stripeCustomerId`
3. `handleFrontendRequest` en `stripe-webhook/index.ts` **nunca se invoca** (código muerto)
4. RPC planeado no registra device en primera validación — **corregir en SQL**

### Decisiones cerradas

- **NO** aplicar `vantare-v2/supabase/migrations/0001_licensing_schema.sql` (Stripe + directorio incorrecto)
- **SÍ** nueva migración timestamp en `supabase/migrations/`
- **NO** `db push`, `db reset`, deploy EF, Polar, ni `DROP` de tablas viejas
- **NO** reemplazar trigger `handle_new_user` remoto (sigue creando `licenses` free)

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `supabase/migrations/20260709120000_provider_agnostic_billing.sql` | Tablas billing + entitlements + RPCs |
| Move | `vantare-v2/supabase/migrations/0001_licensing_schema.sql` → `docs/archive/sql/0001_licensing_schema.sql.stripe-obsolete` | Archivar migración muerta |
| Move | `vantare-v2/supabase/functions/stripe-webhook/` → `supabase/functions/_deprecated/stripe-webhook/` | Aislar código Stripe |
| Create | `supabase/functions/billing-webhook/README.md` | Stub Fase 2 Polar |
| Modify | `supabase/functions/validate-license/index.ts` | Banner `@deprecated` |
| Create | `vantare-v2/frontend/src/lib/billing-client.ts` | Capa checkout/portal futura |
| Create | `vantare-v2/frontend/src/lib/billing-client.test.ts` | Tests billingClient |
| Modify | `vantare-v2/frontend/src/hub/auth/PaywallScreen.tsx` | Usar billingClient |
| Modify | `vantare-v2/frontend/src/hub/auth/PaywallScreen.test.tsx` | Sin fetch fantasma |
| Modify | `vantare-v2/frontend/src/hub/settings/AccountSettings.tsx` | Portal seguro |
| Modify | `vantare-v2/frontend/src/hub/settings/AccountSettings.test.tsx` | Sin Stripe URLs |
| Modify | `vantare-v2/frontend/src/lib/license-types.ts` | Campos billing opcionales |
| Modify | `vantare-v2/docs/technical-debt.md` | TD-043 estado |
| Modify | `vantare-v2/docs/current-plan.md` | Nota Fase 1.6 |

**Forbidden en esta fase:** `db push`, `db reset`, Polar SDK, deploy EF, borrar tablas viejas, tocar WidgetStudio/LayoutStudio/calendario.

---

## Fase 1.6A — Auditoría (solo lectura)

### Task 0: Confirmar inventario antes de editar

**Files:** ninguno (solo comandos)

- [ ] **Step 1: Verificar git status**

```bash
cd C:/Users/isaac/Desktop/Vantare-Overlays
git status --short
```

Expected: listar cambios previos; **no mezclar** con esta tarea.

- [ ] **Step 2: Confirmar migraciones remotas**

```bash
cd C:/Users/isaac/Desktop/Vantare-Overlays
supabase migration list
```

Expected: solo `20260605140000_initial_schema.sql` aplicada local/remoto.

- [ ] **Step 3: Confirmar Edge Functions deployadas**

```bash
supabase functions list
```

Expected: anotar si `validate-license` o `stripe-webhook` están deployadas.

- [ ] **Step 4: Grep referencias Stripe en código ejecutable**

```bash
cd C:/Users/isaac/Desktop/Vantare-Overlays/vantare-v2
rg -i "stripe|create-checkout-session|create-portal-session|stripeCustomerId" --glob "*.{ts,tsx,go}" frontend internal cmd
```

Expected: hits en PaywallScreen, AccountSettings, stripe-webhook, tests.

- [ ] **Step 5: Documentar hallazgos en commit de plan (opcional)**

Si hay EF deployada no documentada, **parar** y pedir revisión humana antes de Task 1.

### Task 0.5: Validar schema remoto antes de escribir SQL (OBLIGATORIO)

**Files:** ninguno (solo lectura)

- [ ] **Step 1: Listar columnas reales de `public.profiles`**

En Supabase SQL Editor o con CLI conectado al remoto:

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
order by ordinal_position;
```

Expected en remoto (según `20260605140000_initial_schema.sql`): `id`, `display_name`, `avatar_url`, `preferred_sim`, `created_at`, `updated_at`. **No asumir sin ejecutar esta query.**

- [ ] **Step 2: Anotar columnas que ya existen vs las que hay que añadir**

Solo añadir con `ADD COLUMN IF NOT EXISTS`: `email`, `language`, `primary_simulator`, `onboarding_completed`.

- [ ] **Step 3: Decidir backfill `preferred_sim` → `primary_simulator`**

Solo si Step 1 confirma que **ambas** columnas existen. Si `preferred_sim` no existe, **omitir** ese backfill (el bloque DO condicional del SQL lo hace automáticamente).

- [ ] **Step 4: Parar si hay divergencia no documentada**

Si el remoto no coincide con la migración tracked, pedir revisión humana antes de Task 2.

---

## Fase 1.6B — Migración SQL

### Task 1: Archivar migración muerta

**Files:**
- Move: `vantare-v2/supabase/migrations/0001_licensing_schema.sql` → `vantare-v2/docs/archive/sql/0001_licensing_schema.sql.stripe-obsolete`

- [ ] **Step 1: Crear directorio archive**

```bash
mkdir -p C:/Users/isaac/Desktop/Vantare-Overlays/vantare-v2/docs/archive/sql
```

- [ ] **Step 2: Mover archivo (git mv)**

```bash
cd C:/Users/isaac/Desktop/Vantare-Overlays
git mv vantare-v2/supabase/migrations/0001_licensing_schema.sql vantare-v2/docs/archive/sql/0001_licensing_schema.sql.stripe-obsolete
```

- [ ] **Step 3: Añadir cabecera de obsoleto al archivo movido**

Añadir al inicio del archivo:

```sql
-- OBSOLETO: no ejecutar. Reemplazado por 20260709120000_provider_agnostic_billing.sql
-- Razón: nombres Stripe, directorio no linkeado, conflicto con profiles remota.
```

- [ ] **Step 4: Commit**

```bash
git add vantare-v2/docs/archive/sql/0001_licensing_schema.sql.stripe-obsolete
git commit -m "chore(supabase): archive obsolete stripe licensing migration"
```

---

### Task 2: Crear migración provider-agnostic

**Files:**
- Create: `supabase/migrations/20260709120000_provider_agnostic_billing.sql`

- [ ] **Step 1: Crear archivo con DDL (borrador validado en Task 0.5)**

Crear `supabase/migrations/20260709120000_provider_agnostic_billing.sql`. **No copiar a ciegas:** contrastar con el output de Task 0.5. El borrador corregido es:

```sql
-- Fase 1.6: billing/licensing provider-agnostic (Polar-ready)
-- Additive: no borra tablas viejas (licenses, subscriptions, etc.)
-- Idempotente: IF NOT EXISTS / CREATE OR REPLACE

-- ============================================================
-- 1. EXTENDER profiles (ya existe en remoto con columnas distintas)
-- ============================================================

alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists language text default 'es';
alter table public.profiles add column if not exists primary_simulator text;
alter table public.profiles add column if not exists onboarding_completed boolean default false;

-- Backfill email desde auth.users (best effort, idempotente)
update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id
  and p.email is null
  and u.email is not null;

-- Backfill preferred_sim -> primary_simulator SOLO si ambas columnas existen (Task 0.5)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'preferred_sim'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'primary_simulator'
  ) then
    update public.profiles
    set primary_simulator = preferred_sim
    where primary_simulator is null
      and preferred_sim is not null;
  end if;
end $$;

-- ============================================================
-- 2. TABLAS NUEVAS
-- ============================================================

create table if not exists public.user_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  product_key text not null,
  status text not null default 'active',
  source text not null default 'manual',
  expires_at timestamptz,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, product_key)
);

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  fingerprint_hash text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_reset_at timestamptz
);

create table if not exists public.license_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  event_type text not null,
  idempotency_key text,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.billing_customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null,
  provider_customer_id text not null,
  email text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider),
  unique (provider, provider_customer_id)
);

create table if not exists public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null,
  provider_subscription_id text not null,
  provider_product_id text,
  provider_price_id text,
  status text not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean default false,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_subscription_id)
);

-- Índices
create index if not exists user_entitlements_user_id_idx on public.user_entitlements (user_id);
create index if not exists user_entitlements_user_product_idx on public.user_entitlements (user_id, product_key);
create index if not exists devices_fingerprint_hash_idx on public.devices (fingerprint_hash);
create index if not exists license_events_user_id_idx on public.license_events (user_id);
create index if not exists license_events_created_at_idx on public.license_events (created_at desc);
create index if not exists billing_customers_provider_customer_idx on public.billing_customers (provider, provider_customer_id);
create index if not exists billing_subscriptions_user_id_idx on public.billing_subscriptions (user_id);

create unique index if not exists license_events_idempotency_uq
  on public.license_events (event_type, idempotency_key)
  where idempotency_key is not null;

-- ============================================================
-- 3. RLS
-- ============================================================

alter table public.user_entitlements enable row level security;
alter table public.devices enable row level security;
alter table public.license_events enable row level security;
alter table public.billing_customers enable row level security;
alter table public.billing_subscriptions enable row level security;

drop policy if exists entitlements_select_own on public.user_entitlements;
create policy entitlements_select_own on public.user_entitlements
  for select using (auth.uid() = user_id);

drop policy if exists devices_select_own on public.devices;
create policy devices_select_own on public.devices
  for select using (auth.uid() = user_id);

drop policy if exists license_events_select_own on public.license_events;
create policy license_events_select_own on public.license_events
  for select using (auth.uid() = user_id and created_at > now() - interval '30 days');

drop policy if exists billing_customers_select_own on public.billing_customers;
create policy billing_customers_select_own on public.billing_customers
  for select using (auth.uid() = user_id);

drop policy if exists billing_subscriptions_select_own on public.billing_subscriptions;
create policy billing_subscriptions_select_own on public.billing_subscriptions
  for select using (auth.uid() = user_id);

-- Sin políticas INSERT/UPDATE/DELETE para authenticated en tablas de billing/entitlements

-- ============================================================
-- 4. RPC: get_account_entitlements (device binding seguro)
-- ============================================================
-- Contrato Go (obligatorio, no romper):
--   IN:  { "device_fingerprint": "<hash>" }
--   OUT mínimo: user_id, email, entitlements[], active_device, expires_at
--   OUT extra (ignorado por Go hoy): device_ok, provider_customer_id, billing_provider
--
-- Seguridad device binding:
--   - Primer PC: registra fingerprint si no hay fila o fingerprint_hash IS NULL (post-reset).
--   - Mismatch: NO sobrescribe fingerprint en BD; devuelve active_device = fingerprint guardado.
--   - Go detecta mismatch (active_device != fingerprint local) -> state device-limit, deviceOK=false.
--   - access-policy.ts bloquea premium en device-limit aunque entitlements[] venga poblado.
--   - device_ok es redundante pero explícito para debug/frontend futuro.

create or replace function public.get_account_entitlements(device_fingerprint text)
returns table(
  user_id uuid,
  email text,
  entitlements text[],
  active_device text,
  expires_at timestamptz,
  device_ok boolean,
  provider_customer_id text,
  billing_provider text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_fp text := nullif(trim(device_fingerprint), '');
  v_bound_fp text;
  v_device_ok boolean := false;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  select d.fingerprint_hash into v_bound_fp
  from public.devices d
  where d.user_id = v_user_id;

  if not found then
    -- Primer dispositivo: crear fila y registrar fingerprint
    if v_fp is not null then
      insert into public.devices (user_id, fingerprint_hash, first_seen_at, last_seen_at)
      values (v_user_id, v_fp, now(), now());
      v_bound_fp := v_fp;
      v_device_ok := true;
    end if;
  elsif v_bound_fp is null then
    -- Post-reset: permitir re-registro del PC actual
    if v_fp is not null then
      update public.devices
      set fingerprint_hash = v_fp,
          last_seen_at = now()
      where user_id = v_user_id;
      v_bound_fp := v_fp;
      v_device_ok := true;
    end if;
  elsif v_fp is not null and v_bound_fp = v_fp then
    -- Mismo dispositivo: solo actualizar last_seen
    update public.devices
    set last_seen_at = now()
    where user_id = v_user_id;
    v_device_ok := true;
  elsif v_fp is not null and v_bound_fp <> v_fp then
    -- Mismatch: NO escribir; devolver fingerprint activo guardado (otro PC)
    v_device_ok := false;
  end if;

  return query
  select
    p.id as user_id,
    coalesce(p.email, u.email) as email,
    coalesce(
      array_agg(ue.product_key order by ue.product_key)
        filter (where ue.product_key is not null),
      '{}'::text[]
    ) as entitlements,
    v_bound_fp as active_device,
    min(ue.expires_at) filter (
      where ue.expires_at is not null
        and ue.status in ('active', 'grace', 'past_due')
    ) as expires_at,
    v_device_ok as device_ok,
    bc.provider_customer_id,
    bc.provider as billing_provider
  from public.profiles p
  left join auth.users u on u.id = p.id
  left join public.user_entitlements ue
    on ue.user_id = p.id
   and ue.status in ('active', 'grace', 'past_due')
   and (ue.expires_at is null or ue.expires_at > now())
  left join lateral (
    select bc_inner.provider_customer_id, bc_inner.provider
    from public.billing_customers bc_inner
    where bc_inner.user_id = p.id
    order by bc_inner.updated_at desc
    limit 1
  ) bc on true
  where p.id = v_user_id
  group by p.id, p.email, u.email, v_bound_fp, v_device_ok, bc.provider_customer_id, bc.provider;
end;
$$;

-- ============================================================
-- 5. RPC: reset_active_device
-- ============================================================

create or replace function public.reset_active_device(device_fingerprint text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_last_reset timestamptz;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  select d.last_reset_at into v_last_reset
  from public.devices d
  where d.user_id = v_user_id;

  if v_last_reset is not null and v_last_reset > now() - interval '24 hours' then
    raise exception 'rate_limit: solo 1 reset cada 24h';
  end if;

  update public.devices
  set fingerprint_hash = null,
      last_reset_at = now()
  where user_id = v_user_id;
end;
$$;
```

- [ ] **Step 2: Verificar sintaxis y contrato Go (sin push)**

```bash
cd C:/Users/isaac/Desktop/Vantare-Overlays
supabase db lint
```

Checklist manual:
- No hay `DROP TABLE`, `stripe_*`, ni `CREATE TABLE profiles`
- `billing_customers` tiene `unique (user_id, provider)` (no `user_id unique`)
- RPC devuelve las 5 columnas mínimas que Go decodifica en `AccountInfo`
- Columnas extra (`device_ok`, `provider_customer_id`, `billing_provider`) son opcionales; Go las ignora

Test de regresión Go (sin cambiar Go): `go test ./internal/license/...` debe seguir PASS — el decoder JSON ignora campos extra.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260709120000_provider_agnostic_billing.sql
git commit -m "feat(supabase): add provider-agnostic billing schema and RPCs (Fase 1.6B)"
```

**NO ejecutar:** `supabase db push` (eso es Fase 1.6E, gate humano).

---

## Fase 1.6C — Frontend billingClient

### Task 3: Crear billing-client con tests (TDD)

**Files:**
- Create: `vantare-v2/frontend/src/lib/billing-client.ts`
- Create: `vantare-v2/frontend/src/lib/billing-client.test.ts`

- [ ] **Step 1: Escribir tests que fallan**

Crear `vantare-v2/frontend/src/lib/billing-client.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  BILLING_ENABLED,
  createCheckoutSession,
  openCustomerPortal,
} from "./billing-client";

describe("billing-client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("BILLING_ENABLED is false by default in Fase 1.6", () => {
    expect(BILLING_ENABLED).toBe(false);
  });

  it("createCheckoutSession returns billing_not_available when disabled", async () => {
    const res = await createCheckoutSession({
      productKey: "overlays",
      email: "u@example.com",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("billing_not_available");
  });

  it("openCustomerPortal returns billing_not_available when disabled", async () => {
    const res = await openCustomerPortal({ providerCustomerId: "cus_1" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("billing_not_available");
  });

  it("openCustomerPortal rejects missing providerCustomerId", async () => {
    const res = await openCustomerPortal({ providerCustomerId: "" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("missing_provider_customer_id");
  });
});
```

- [ ] **Step 2: Ejecutar tests — deben fallar**

```bash
cd C:/Users/isaac/Desktop/Vantare-Overlays/vantare-v2
pnpm --dir frontend test frontend/src/lib/billing-client.test.ts
```

Expected: FAIL — módulo `./billing-client` no encontrado.

- [ ] **Step 3: Implementar billing-client**

Crear `vantare-v2/frontend/src/lib/billing-client.ts`:

```typescript
export const BILLING_ENABLED =
  (import.meta.env.VITE_BILLING_ENABLED as string | undefined) === "true";

export type BillingErrorReason =
  | "billing_not_available"
  | "missing_provider_customer_id"
  | "network_error"
  | "server_error";

export type BillingResult =
  | { ok: true; url: string }
  | { ok: false; reason: BillingErrorReason; message?: string };

export type CheckoutInput = {
  productKey: string;
  email: string;
};

export type PortalInput = {
  providerCustomerId: string;
  returnUrl?: string;
};

function supabaseFunctionsBase(): string {
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";
  return `${supabaseUrl}/functions/v1`;
}

export async function createCheckoutSession(
  input: CheckoutInput,
): Promise<BillingResult> {
  if (!BILLING_ENABLED) {
    return { ok: false, reason: "billing_not_available" };
  }
  try {
    const res = await fetch(`${supabaseFunctionsBase()}/billing-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productKey: input.productKey,
        email: input.email,
      }),
    });
    if (!res.ok) {
      return { ok: false, reason: "server_error" };
    }
    const data = (await res.json()) as { url?: string };
    if (!data.url) {
      return { ok: false, reason: "server_error" };
    }
    return { ok: true, url: data.url };
  } catch {
    return { ok: false, reason: "network_error" };
  }
}

export async function openCustomerPortal(
  input: PortalInput,
): Promise<BillingResult> {
  if (!input.providerCustomerId) {
    return { ok: false, reason: "missing_provider_customer_id" };
  }
  if (!BILLING_ENABLED) {
    return { ok: false, reason: "billing_not_available" };
  }
  try {
    const res = await fetch(`${supabaseFunctionsBase()}/billing-portal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        providerCustomerId: input.providerCustomerId,
        returnUrl: input.returnUrl,
      }),
    });
    if (!res.ok) {
      return { ok: false, reason: "server_error" };
    }
    const data = (await res.json()) as { url?: string };
    if (!data.url) {
      return { ok: false, reason: "server_error" };
    }
    return { ok: true, url: data.url };
  } catch {
    return { ok: false, reason: "network_error" };
  }
}
```

- [ ] **Step 4: Ejecutar tests — deben pasar**

```bash
pnpm --dir frontend test frontend/src/lib/billing-client.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add vantare-v2/frontend/src/lib/billing-client.ts vantare-v2/frontend/src/lib/billing-client.test.ts
git commit -m "feat(frontend): add billing-client with billing disabled (Fase 1.6C)"
```

---

### Task 4: Actualizar PaywallScreen

**Files:**
- Modify: `vantare-v2/frontend/src/hub/auth/PaywallScreen.tsx`
- Modify: `vantare-v2/frontend/src/hub/auth/PaywallScreen.test.tsx`

- [ ] **Step 1: Escribir test — subscribe muestra coming soon, sin fetch**

En `PaywallScreen.test.tsx`, reemplazar el test que espera `create-checkout-session` por:

```typescript
  it("shows coming soon when billing is disabled and does not fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<PaywallScreen email="u@example.com" />);
    const buttons = screen.getAllByRole("button", { name: /suscribirse/i });
    fireEvent.click(buttons[0]);
    await vi.waitFor(() =>
      expect(screen.getByTestId("paywall-coming-soon")).toBeTruthy(),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
```

- [ ] **Step 2: Ejecutar test — debe fallar**

```bash
pnpm --dir frontend test frontend/src/hub/auth/PaywallScreen.test.tsx
```

- [ ] **Step 3: Modificar PaywallScreen.tsx**

Cambios clave:
1. Importar `createCheckoutSession`, `BILLING_ENABLED` desde `../../lib/billing-client`
2. En `handleSubscribe`: si `!BILLING_ENABLED`, setear estado `comingSoon` y return
3. Si `BILLING_ENABLED`, usar `createCheckoutSession({ productKey: planKey, email })`
4. Eliminar fetch directo a `create-checkout-session`
5. Añadir bloque UI:

```tsx
{comingSoon && (
  <div data-testid="paywall-coming-soon" className="mb-6 rounded border border-white/10 bg-[#111] px-4 py-2 font-mono text-[10px] text-vantare-textDim">
    {t("paywall.comingSoon")}
  </div>
)}
```

6. Deshabilitar botones de planes de pago cuando `!BILLING_ENABLED`:

```tsx
disabled={
  (plan.key !== "free" && !BILLING_ENABLED) ||
  (plan.key === "free" && summary.status !== "free")
}
```

- [ ] **Step 4: Añadir i18n key `paywall.comingSoon`** en los 4 locales (`es`, `en`, `pt`, `it`):

```typescript
"paywall.comingSoon": "Los planes de pago estarán disponibles pronto.",
```

(traducir en `en.ts`, `pt.ts`, `it.ts`)

- [ ] **Step 5: Ejecutar tests PaywallScreen**

```bash
pnpm --dir frontend test frontend/src/hub/auth/PaywallScreen.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add vantare-v2/frontend/src/hub/auth/PaywallScreen.tsx vantare-v2/frontend/src/hub/auth/PaywallScreen.test.tsx vantare-v2/frontend/src/i18n/locales/
git commit -m "fix(frontend): PaywallScreen uses billingClient, no phantom checkout (Fase 1.6C)"
```

---

### Task 5: Actualizar AccountSettings

**Files:**
- Modify: `vantare-v2/frontend/src/lib/license-types.ts`
- Modify: `vantare-v2/frontend/src/hub/settings/AccountSettings.tsx`
- Modify: `vantare-v2/frontend/src/hub/settings/AccountSettings.test.tsx`

- [ ] **Step 1: Extender LicenseResult**

En `license-types.ts`, añadir campos opcionales:

```typescript
  providerCustomerId?: string;
  billingProvider?: string;
```

- [ ] **Step 2: Reemplazar test portal — no fetch cuando billing off**

En `AccountSettings.test.tsx`, reemplazar tests de `create-portal-session` por:

```typescript
  it("hides manage subscription when billing is disabled", () => {
    mockUseLicense({
      state: "active",
      entitlements: ["overlays"],
      userId: "u",
      email: "u@example.com",
      deviceOK: true,
      providerCustomerId: "polar_cus_1",
    });
    render(<AccountSettings />);
    expect(screen.queryByRole("button", { name: /gestionar suscripción/i })).toBeNull();
  });
```

- [ ] **Step 3: Ejecutar test — debe fallar**

```bash
pnpm --dir frontend test frontend/src/hub/settings/AccountSettings.test.tsx
```

- [ ] **Step 4: Modificar AccountSettings.tsx**

1. Importar `openCustomerPortal`, `BILLING_ENABLED` desde `../../lib/billing-client`
2. Reemplazar `handleManageSubscription`:

```typescript
  const handleManageSubscription = useCallback(async () => {
    setPortalError(null);
    const customerId = result?.providerCustomerId ?? "";
    const portal = await openCustomerPortal({ providerCustomerId: customerId });
    if (!portal.ok) {
      if (portal.reason === "billing_not_available") return;
      setPortalError(t("account.portalError"));
      return;
    }
    await Browser.OpenURL(portal.url);
  }, [result?.providerCustomerId, t]);
```

3. Render condicional del botón:

```tsx
{BILLING_ENABLED && result?.providerCustomerId ? (
  <button ...>{t("account.manageSubscription")}</button>
) : null}
```

- [ ] **Step 5: Ejecutar tests AccountSettings**

```bash
pnpm --dir frontend test frontend/src/hub/settings/AccountSettings.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add vantare-v2/frontend/src/lib/license-types.ts vantare-v2/frontend/src/hub/settings/AccountSettings.tsx vantare-v2/frontend/src/hub/settings/AccountSettings.test.tsx
git commit -m "fix(frontend): AccountSettings safe portal via billingClient (Fase 1.6C)"
```

---

## Fase 1.6D — Consolidar Supabase + deprecar legacy

### Task 6: Mover stripe-webhook a deprecated

**Files:**
- Move: `vantare-v2/supabase/functions/stripe-webhook/` → `supabase/functions/_deprecated/stripe-webhook/`
- Create: `supabase/functions/billing-webhook/README.md`

- [ ] **Step 1: Crear directorios**

```bash
mkdir -p C:/Users/isaac/Desktop/Vantare-Overlays/supabase/functions/_deprecated
mkdir -p C:/Users/isaac/Desktop/Vantare-Overlays/supabase/functions/billing-webhook
```

- [ ] **Step 2: Mover stripe-webhook**

```bash
cd C:/Users/isaac/Desktop/Vantare-Overlays
git mv vantare-v2/supabase/functions/stripe-webhook supabase/functions/_deprecated/stripe-webhook
```

- [ ] **Step 3: Crear README deprecated** en `supabase/functions/_deprecated/stripe-webhook/DEPRECATED.md`:

```markdown
# DEPRECATED — Stripe webhook

No deployar. Reemplazado por `billing-webhook` (Polar) en Fase 2.
Mantenido solo como referencia histórica.
```

- [ ] **Step 4: Crear stub Polar** `supabase/functions/billing-webhook/README.md`:

```markdown
# billing-webhook (Fase 2 — Polar)

Endpoints planeados:
- POST /billing-checkout — crear sesión checkout (JWT requerido)
- POST /billing-portal — portal cliente (JWT requerido)
- POST / — webhook Polar (firma + idempotencia en license_events)

Tablas: billing_customers, billing_subscriptions, user_entitlements.
```

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/
git commit -m "chore(supabase): deprecate stripe-webhook, add billing-webhook stub (Fase 1.6D)"
```

---

### Task 7: Deprecar validate-license

**Files:**
- Modify: `supabase/functions/validate-license/index.ts`

- [ ] **Step 1: Añadir banner al inicio del archivo**

```typescript
/**
 * @deprecated Fase 1.6 — Usa Go LicenseService + RPC get_account_entitlements.
 * Esta EF opera sobre el esquema viejo (licenses/hwid). No borrar hasta Fase 3.
 */
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/validate-license/index.ts
git commit -m "docs(supabase): mark validate-license as deprecated (Fase 1.6D)"
```

---

### Task 8: Verificación final

**Files:** ninguno nuevo

- [ ] **Step 1: Tests frontend completos**

```bash
cd C:/Users/isaac/Desktop/Vantare-Overlays/vantare-v2
pnpm --dir frontend test
```

Expected: PASS.

- [ ] **Step 2: Build frontend**

```bash
pnpm --dir frontend build
```

Expected: exit 0.

- [ ] **Step 3: Tests Go license**

```bash
cd C:/Users/isaac/Desktop/Vantare-Overlays/vantare-v2
go test ./internal/license/...
```

Expected: PASS.

- [ ] **Step 4: Grep — no deben quedar llamadas fantasma en frontend**

```bash
rg "create-checkout-session|create-portal-session|stripeCustomerId" vantare-v2/frontend/src --glob "*.{ts,tsx}"
```

Expected: 0 matches en código de producción (tests viejos ya actualizados).

- [ ] **Step 5: Actualizar TD-043** en `vantare-v2/docs/technical-debt.md`:

Marcar que migración SQL existe localmente (`20260709120000_...`) pero **pendiente db push humano**.

- [ ] **Step 6: Commit docs**

```bash
git add vantare-v2/docs/technical-debt.md vantare-v2/docs/current-plan.md
git commit -m "docs: Fase 1.6 billing/licensing pre-Polar — migration ready, push gated"
```

---

## Fase 1.6E — Gate humano (NO automatizar)

### Task 9: Checklist antes de `db push`

**Solo humano.** El agente **no ejecuta** estos pasos salvo orden explícita.

- [ ] Backup schema remoto (`supabase db dump` o dashboard)
- [ ] Revisar SQL en PR
- [ ] `supabase migration list` — debe aparecer nueva migración como **local only**
- [ ] `supabase db push` en ventana controlada
- [ ] Smoke SQL: `select * from get_account_entitlements('test-fp');` con JWT de usuario test
- [ ] Insert manual `user_entitlements` + revalidar app
- [ ] Rollback plan documentado

---

## Fase 2 — Polar (plan separado, no ejecutar ahora)

Crear después: `docs/superpowers/plans/2026-XX-XX-fase-2-polar-integration.md` con:
- EF `billing-webhook` implementada
- `VITE_BILLING_ENABLED=true` en release
- Mapeo `provider_price_id` → `product_key[]`
- Webhook idempotente → `license_events`
- E2E checkout → entitlement → app desbloquea

---

## Fase 3 — Cleanup esquema viejo (plan separado)

Cuando Polar estable y 0 dependencias:
- `DROP` tablas `licenses`, `subscriptions`, `license_validations`, `hwid_changes`, `rate_limits`
- Eliminar `validate-license` y `_deprecated/stripe-webhook`
- Actualizar docs Stripe → Polar

---

## Seguridad (referencia rápida)

- Service-role **solo** en Edge Functions / CLI admin local — nunca en Wails
- Checkout/portal Fase 2: **JWT obligatorio**, `user_id` = `auth.uid()`, ignorar body `userId`
- RLS: solo SELECT own en tablas billing; escritura vía webhook service-role
- Device reset: 1/24h vía `last_reset_at`
- Webhooks: `idempotency_key` unique en `license_events`

---

## Lo que NO tocar

- `supabase db push` / `db reset` (gate 1.6E)
- Polar API keys / productos
- Deploy Edge Functions
- `20260605140000_initial_schema.sql`
- Tablas viejas (`licenses`, etc.)
- `cmd/vantare/main.go` license wiring
- WidgetStudio / LayoutStudio / calendario / launcher
- `../pnpm-workspace.yaml`

---

## Self-review (cobertura spec)

| Requisito usuario | Task |
|-------------------|------|
| Diagnóstico estado repo | Contexto + Task 0 |
| Decisión migraciones | Task 1-2, decisiones cerradas |
| Schema provider-agnostic | Task 2 SQL completo |
| RPCs con device binding | Task 2 SQL |
| PaywallScreen | Task 4 |
| AccountSettings | Task 5 |
| validate-license | Task 7 |
| Plan por fases | Tasks 0-9 + Fase 2/3 refs |
| Seguridad | Sección seguridad |
| Archivos a tocar | File Structure |
| NO tocar | Sección final |
| Checklist pre-implementación | Task 9 |

**Plan complete.**

**Opciones de ejecución:**
1. **Subagent-Driven** — un subagente por Task (recomendado para modelo pequeño)
2. **Inline** — ejecutar Tasks 0→8 en sesión con checkpoints tras cada commit

## Todos

- [ ] **task-0-audit** — Task 0: Auditoría readonly (migration list, functions list, grep Stripe)
- [ ] **task-0.5-schema** — Task 0.5: Validar columnas reales de profiles en remoto antes de SQL
- [ ] **task-1-archive** — Task 1: Archivar 0001_licensing_schema.sql a docs/archive/sql/
- [ ] **task-2-migration** — Task 2: Crear supabase/migrations/20260709120000_provider_agnostic_billing.sql
- [ ] **task-3-billing-client** — Task 3: TDD billing-client.ts + tests
- [ ] **task-4-paywall** — Task 4: PaywallScreen + i18n comingSoon + tests
- [ ] **task-5-account** — Task 5: AccountSettings + license-types + tests
- [ ] **task-6-deprecated** — Task 6: Mover stripe-webhook a _deprecated + billing-webhook README
- [ ] **task-7-validate-license** — Task 7: Deprecar validate-license
- [ ] **task-8-verify** — Task 8: pnpm test/build + go test + grep + docs
- [ ] **task-9-human-gate** — Task 9: Gate humano db push (NO automatizar)
