-- Vantare Overlays — initial auth & licensing schema (Sprint 6)

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  preferred_sim TEXT NOT NULL DEFAULT 'iracing',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.licenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'pro', 'ultimate')),
  hwid TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  deactivated_at TIMESTAMPTZ,
  deactivation_reason TEXT,
  last_validated_at TIMESTAMPTZ,
  validation_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL CHECK (plan IN ('free', 'pro', 'ultimate')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired', 'past_due')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  payment_provider TEXT DEFAULT 'stripe',
  payment_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.license_validations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id UUID NOT NULL REFERENCES public.licenses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hwid TEXT NOT NULL,
  ip_address INET,
  validated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_valid BOOLEAN NOT NULL,
  failure_reason TEXT
);

CREATE TABLE public.hwid_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id UUID NOT NULL REFERENCES public.licenses(id) ON DELETE CASCADE,
  old_hwid TEXT,
  new_hwid TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  auto_approved BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE public.rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  license_id UUID REFERENCES public.licenses(id) ON DELETE CASCADE,
  ip_address INET,
  endpoint TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX idx_profiles_preferred_sim ON public.profiles(preferred_sim);

CREATE INDEX idx_licenses_user_id ON public.licenses(user_id);
CREATE INDEX idx_licenses_hwid ON public.licenses(hwid);
CREATE INDEX idx_licenses_tier ON public.licenses(tier);
CREATE INDEX idx_licenses_active ON public.licenses(is_active) WHERE is_active = TRUE;

CREATE UNIQUE INDEX idx_licenses_one_active_per_user
  ON public.licenses(user_id)
  WHERE is_active = TRUE;

CREATE INDEX idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON public.subscriptions(status);

CREATE INDEX idx_validations_license_id ON public.license_validations(license_id);
CREATE INDEX idx_validations_user_id ON public.license_validations(user_id);
CREATE INDEX idx_validations_validated_at ON public.license_validations(validated_at DESC);

CREATE INDEX idx_hwid_changes_license ON public.hwid_changes(license_id);

CREATE INDEX idx_rate_limits_license_endpoint ON public.rate_limits(license_id, endpoint, window_start);
CREATE INDEX idx_rate_limits_user_ip ON public.rate_limits(user_id, ip_address, endpoint);
CREATE INDEX idx_rate_limits_window ON public.rate_limits(window_start);

-- ---------------------------------------------------------------------------
-- Triggers: profile + free license on sign-up
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER subscriptions_set_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', '')
  );

  INSERT INTO public.licenses (user_id, tier, is_active)
  VALUES (NEW.id, 'free', TRUE);

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.license_validations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hwid_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY profiles_select_own
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY profiles_update_own
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- licenses (read-only for end users; writes via service role / triggers)
CREATE POLICY licenses_select_own
  ON public.licenses FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY licenses_no_public_insert
  ON public.licenses FOR INSERT
  WITH CHECK (FALSE);

CREATE POLICY licenses_no_public_update
  ON public.licenses FOR UPDATE
  USING (FALSE);

CREATE POLICY licenses_no_public_delete
  ON public.licenses FOR DELETE
  USING (FALSE);

-- subscriptions
CREATE POLICY subscriptions_select_own
  ON public.subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY subscriptions_no_public_insert
  ON public.subscriptions FOR INSERT
  WITH CHECK (FALSE);

CREATE POLICY subscriptions_no_public_update
  ON public.subscriptions FOR UPDATE
  USING (FALSE);

CREATE POLICY subscriptions_no_public_delete
  ON public.subscriptions FOR DELETE
  USING (FALSE);

-- license_validations (inserts only via service role in edge functions)
CREATE POLICY license_validations_select_own
  ON public.license_validations FOR SELECT
  USING (auth.uid() = user_id);

-- hwid_changes
CREATE POLICY hwid_changes_select_own
  ON public.hwid_changes FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.licenses l
      WHERE l.id = license_id
        AND l.user_id = auth.uid()
    )
  );

-- rate_limits: no client policies (service role only)
