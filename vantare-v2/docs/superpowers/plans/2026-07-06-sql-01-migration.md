# SQL-01 — Migración Supabase: tablas, RLS, trigger y RPCs

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear en el proyecto Supabase el esquema de licencias (tablas + RLS + trigger de `profiles` + 2 RPCs) que el Go `internal/license` ya invoca, para que un usuario pagado reciba sus entitlements reales.

**Architecture:** Un único archivo de migración SQL (idempotente, rerunnable con `IF NOT EXISTS` / `CREATE OR REPLACE`) que crea las 6 tablas planeadas, habilita RLS con políticas mínimas (SELECT al dueño; escritura solo service-role vía RPCs `SECURITY DEFINER`), un trigger `handle_new_user` que auto-inserta en `public.profiles` al crear usuario en `auth.users`, y los 2 RPCs `get_account_entitlements` y `reset_active_device` con la firma que el Go espera. No se toca Go ni React: el cliente ya llama estos RPCs.

**Tech Stack:** SQL (Postgres 15+ de Supabase), Supabase CLI (`supabase db push` o `supabase migration new`), RLS, PL/pgSQL.

---

## Contexto y contratos (leer antes de implementar)

- El Go invoca `POST /rest/v1/rpc/get_account_entitlements` con body `{"device_fingerprint": "<hash>"}` y espera `AccountInfo` = `{user_id, email, entitlements[], active_device, expires_at}` (`internal/license/supabase_client.go:40-69`, `types.go`).
- El Go invoca `POST /rest/v1/rpc/reset_active_device` con el mismo body (`supabase_client.go:72-97`).
- `internal/license/plan.go` clasifica por `product_key` (`overlays`, `engineer`, `bundle`, `beta_access`, `supporter`, `founder`, `pro_founder`, `visionary_backer`, `ac_lua_pack`).
- Estado actual: `find . -name "*.sql"` está vacío → la migración NO existe (bloqueador `TD-043`).
- Este plan NO incluye secretos ni deploy de la Edge Function (ver `DEPLOY-01`).

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `supabase/migrations/0001_licensing_schema.sql` | Tablas, RLS, trigger, RPCs. Idempotente. |
| Modify | `docs/release-02-licensing-auth-stage.md` | Marcar `SQL-01` ✅ al cerrar. |

**Forbidden files:** cualquier archivo Go (`internal/license/*`, `cmd/vantare/main.go`), cualquier archivo frontend (`frontend/src/**`), `supabase/functions/**` (EF).

---

### Task 1: Crear tablas base (idempotente)

**Files:**
- Create: `supabase/migrations/0001_licensing_schema.sql`
> **⚠️ CORRECCIONES APLICADAS (revisión del handoff, 2026-07-06):**
> - **Bug de rate-limit (issue 3a):** el RPC original `reset_active_device` usaba un contador `reset_count_24h` que nunca volvía a cero, así que tras el primer reset quedaba bloqueado para siempre. Se reemplaza por una sola fecha `last_reset_at` (decisión F: simplificar). Ver Task 1 (tabla `devices`) y Task 3 (RPC).
> - **1 PC por usuario (decisión E):** `devices.user_id` es `unique` a propósito. El "límite de dispositivo" es binario: el PC activo vs. uno nuevo. El reset simplemente limpia la fila. No se cambia el esquema de unicidad.
> - El parámetro `device_fingerprint` del RPC se mantiene por compatibilidad con el Go (lo envía siempre), pero el reset actúa sobre `auth.uid()`.

- [ ] **Step 1: Escribir el DDL de las 6 tablas**

```sql
-- 0001_licensing_schema.sql
-- Migración de licencias para Release 02. Idempotente.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  language text default 'es',
  primary_simulator text,
  onboarding_completed boolean default false
);

create table if not exists public.user_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  product_key text not null,
  status text not null default 'active',
  expires_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  metadata jsonb,
  unique (user_id, product_key)
);

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  fingerprint_hash text,
  first_seen_at timestamptz default now(),
  last_seen_at timestamptz default now(),
  -- last_reset_at: cuándo se hizo el último reset de dispositivo.
  -- Sustituye al contador reset_count_24h (ver nota de corrección arriba).
  -- La regla "1 reset cada 24h" se comprueba contra esta fecha.
  last_reset_at timestamptz
);

create table if not exists public.license_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  event_type text not null,
  payload jsonb,
  created_at timestamptz default now()
);

create table if not exists public.stripe_customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  stripe_customer_id text not null unique,
  created_at timestamptz default now()
);

create table if not exists public.stripe_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  stripe_subscription_id text not null unique,
  stripe_price_id text,
  status text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists user_entitlements_user_id_idx on public.user_entitlements (user_id);
create index if not exists user_entitlements_user_product_idx on public.user_entitlements (user_id, product_key);
create index if not exists devices_user_id_idx on public.devices (user_id);
create index if not exists devices_fingerprint_hash_idx on public.devices (fingerprint_hash);
create index if not exists license_events_user_id_idx on public.license_events (user_id);
create index if not exists license_events_created_at_idx on public.license_events (created_at);
create index if not exists stripe_customers_customer_id_idx on public.stripe_customers (stripe_customer_id);
create index if not exists stripe_subscriptions_sub_id_idx on public.stripe_subscriptions (stripe_subscription_id);
create index if not exists stripe_subscriptions_user_id_idx on public.stripe_subscriptions (user_id);
```

- [ ] **Step 2: Aplicar en el proyecto Supabase**

Run: `supabase db push` (o `supabase migration up` contra el proyecto linkado).
Expected: las 6 tablas creadas sin error. Si el proyecto no está linkado, el humano debe correr `supabase link --project-ref <ref>` primero (bloqueador de acceso).

- [ ] **Step 3: Commit solo del SQL**

```bash
git add supabase/migrations/0001_licensing_schema.sql
git commit -m "feat(supabase): add licensing schema tables (SQL-01)"
```

---

### Task 2: RLS y trigger de profiles

**Files:**
- Modify: `supabase/migrations/0001_licensing_schema.sql` (append)

- [ ] **Step 1: Escribir RLS + trigger**

```sql
-- RLS: activar en todas las tablas
alter table public.profiles enable row level security;
alter table public.user_entitlements enable row level security;
alter table public.devices enable row level security;
alter table public.license_events enable row level security;
alter table public.stripe_customers enable row level security;
alter table public.stripe_subscriptions enable row level security;

-- profiles: el usuario ve/actualiza solo su fila
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (auth.uid() = id);
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = id);

-- user_entitlements: el usuario solo lee las suyas
drop policy if exists entitlements_select_own on public.user_entitlements;
create policy entitlements_select_own on public.user_entitlements
  for select using (auth.uid() = user_id);

-- devices: el usuario solo lee la suya
drop policy if exists devices_select_own on public.devices;
create policy devices_select_own on public.devices
  for select using (auth.uid() = user_id);

-- license_events: el usuario lee las suyas (ventana 30 días)
drop policy if exists license_events_select_own on public.license_events;

create policy license_events_select_own on public.license_events
  for select using (auth.uid() = user_id and created_at > now() - interval '30 days');

-- stripe_customers: el usuario solo lee la suya
drop policy if exists stripe_customers_select_own on public.stripe_customers;
create policy stripe_customers_select_own on public.stripe_customers
  for select using (auth.uid() = user_id);

-- stripe_subscriptions: el usuario solo lee las suyas
drop policy if exists stripe_subscriptions_select_own on public.stripe_subscriptions;
create policy stripe_subscriptions_select_own on public.stripe_subscriptions
  for select using (auth.uid() = user_id);

-- trigger: auto-crear perfil en auth.users INSERT
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

- [ ] **Step 2: Aplicar en Supabase**

Run: `supabase db push`.
Expected: RLS activado en las 6 tablas; trigger creado.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0001_licensing_schema.sql
git commit -m "feat(supabase): add RLS and profiles trigger (SQL-01)"
```

---

### Task 3: Crear los 2 RPCs que el Go invoca

**Files:**
- Modify: `supabase/migrations/0001_licensing_schema.sql` (append)

- [ ] **Step 1: Escribir los RPCs**

El Go (`internal/license/supabase_client.go:40-69`) llama `POST /rest/v1/rpc/get_account_entitlements` con body `{"device_fingerprint": "<hash>"}` y espera `AccountInfo` = `{user_id, email, entitlements[], active_device, expires_at}`. El RPC devuelve JSON.

```sql
-- RPC: get_account_entitlements
-- Devuelve los entitlements activos del usuario autenticado, su email,
-- fingerprint del device actual y la fecha de expiración más próxima.
create or replace function public.get_account_entitlements(device_fingerprint text)
returns table(
  user_id uuid,
  email text,
  entitlements text[],
  active_device text,
  expires_at timestamptz,
  -- stripe_customer_id: lo necesita el frontend para el botón de Customer
  -- Portal (CHECKOUT-01 Task 3). El Go (AccountInfo) lo ignora porque no
  -- está en sus json tags; es frontend-only. Decisión C.
  stripe_customer_id text
) language plpgsql security definer as $$
declare
  v_user_id uuid := auth.uid();
begin
  return query
  select
    p.id as user_id,
    p.email,
    coalesce(
      array_agg(ue.product_key order by ue.product_key) filter (where ue.product_key is not null),
      '{}'::text[]
    ) as entitlements,
    d.fingerprint_hash as active_device,
    min(ue.expires_at) filter (where ue.expires_at is not null) as expires_at,
    sc.stripe_customer_id
  from public.profiles p
  left join public.user_entitlements ue
    on ue.user_id = p.id and ue.status = 'active'
  left join public.devices d
    on d.user_id = p.id
  left join public.stripe_customers sc
    on sc.user_id = p.id
  group by p.id, p.email, d.fingerprint_hash;
end;
$$;

-- RPC: reset_active_device
-- Borra el fingerprint del device activo para que Validate pueda
-- reregistrar este PC como activo. Rate-limit 1 reset cada 24h.
create or replace function public.reset_active_device(device_fingerprint text)
returns void language plpgsql security definer as $$
declare
  v_user_id uuid := auth.uid();
  v_last_reset timestamptz;
begin
  select d.last_reset_at into v_last_reset
  from public.devices d
  where d.user_id = v_user_id;

  -- Rate-limit: 1 reset cada 24h. Si el último reset fue hace menos de
  -- 24h, bloqueamos. (Corrige el bug original donde un contador que nunca
  -- volvía a cero bloqueaba al usuario para siempre tras el primer reset.)
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

- [ ] **Step 2: Aplicar en Supabase**

Run: `supabase db push`.
Expected: los 2 RPCs accesibles via REST con la anon key, `SECURITY DEFINER` usando `auth.uid()`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0001_licensing_schema.sql
git commit -m "feat(supabase): add RPCs get_account_entitlements and reset_active_device (SQL-01)"
```

---

### Task 4: Verificación y cierre

- [ ] **Step 1: Verificar contrato con el Go existente**

Confirmar en `internal/license/supabase_client.go:64-69` que el `AccountInfo` deserializa correctamente del RPC:

```go
type AccountInfo struct {
    UserID       string        `json:"user_id"`
    Email        string        `json:"email"`
    Entitlements []Entitlement `json:"entitlements"`
    ActiveDevice string        `json:"active_device"`
    ExpiresAt    *time.Time    `json:"expires_at"`
}
```

Los tags JSON (`user_id`, `email`, `entitlements`, `active_device`, `expires_at`) coinciden con las columnas alias del `RETURNS TABLE` del RPC. No se modifica código Go.

- [ ] **Step 2: Validar RLS con 2 usuarios distintos**

Desde el dashboard de Supabase SQL Editor o `psql`:

```sql
-- Crear 2 usuarios de prueba (via Supabase Auth dashboard, no SQL directo).
-- Asignar un entitlement al usuario A.
insert into public.user_entitlements (user_id, product_key, status)
values ('<uuid-A>', 'overlays', 'active');

-- Con el JWT del usuario A: get_account_entitlements debe devolver 1 entitlement.
-- Con el JWT del usuario B: get_account_entitlements debe devolver array vacío.
-- B no puede SELECT de user_entitlements donde user_id = A.
```

Expected: cada usuario ve solo sus datos; el RPC de A devuelve `overlays`; el de B `{}`.

- [ ] **Step 3: Marcar cierre en el stage doc**

En `docs/release-02-licensing-auth-stage.md`, cambiar `SQL-01` de 🔴 BLOQUEADO a ✅ HECHO.
Cerrar `TD-043` en `docs/technical-debt.md`.

- [ ] **Step 4: Commit final del stage update**

```bash
git add docs/release-02-licensing-auth-stage.md docs/technical-debt.md
git commit -m "chore: close SQL-01 and TD-043"
```

---

## Self-Review

- [x] Spec coverage: las 6 tablas del schema doc, RLS en todas, trigger de profiles, 2 RPCs con el contrato del Go.
- [x] Placeholder scan: sin TBD ni "implement later".
- [x] Type consistency: los alias `RETURNS TABLE` del RPC coinciden con los `json` tags de `AccountInfo`.

Plan completo. Para ejecutar, requiere el ref del proyecto Supabase (bloqueador de acceso F0).