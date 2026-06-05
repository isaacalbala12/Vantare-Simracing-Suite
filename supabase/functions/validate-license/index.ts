import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RATE_LIMIT_MAX = 100;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized', valid: false }, 401);
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return json({ error: 'Unauthorized', valid: false }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const hwid = typeof body.hwid === 'string' ? body.hwid : '';

    if (!hwid) {
      return json({ error: 'HWID required', valid: false }, 400);
    }

    const { data: license, error: licenseError } = await supabase
      .from('licenses')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (licenseError || !license) {
      await logValidation(supabase, null, user.id, hwid, req, false, 'No active license');
      return json({ valid: false, tier: 'free', error: 'No active license found' });
    }

    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
    const { count: recentCount } = await supabase
      .from('rate_limits')
      .select('*', { count: 'exact', head: true })
      .eq('license_id', license.id)
      .eq('endpoint', 'validate-license')
      .gte('window_start', windowStart);

    if ((recentCount ?? 0) >= RATE_LIMIT_MAX) {
      return json({ valid: false, tier: 'free', error: 'Rate limit exceeded' }, 429);
    }

    await supabase.from('rate_limits').insert({
      user_id: user.id,
      license_id: license.id,
      endpoint: 'validate-license',
      ip_address: clientIp(req),
    });

    if (license.expires_at && new Date(license.expires_at) < new Date()) {
      await supabase
        .from('licenses')
        .update({ is_active: false, deactivated_at: new Date().toISOString() })
        .eq('id', license.id);

      await logValidation(supabase, license.id, user.id, hwid, req, false, 'License expired');
      return json({ valid: false, tier: 'free', error: 'License expired' });
    }

    if (license.hwid && license.hwid !== hwid) {
      await logValidation(supabase, license.id, user.id, hwid, req, false, 'Hardware mismatch');
      return json({
        valid: false,
        tier: 'free',
        error: 'Hardware mismatch',
      });
    }

    if (!license.hwid) {
      await supabase
        .from('licenses')
        .update({
          hwid,
          last_validated_at: new Date().toISOString(),
          validation_count: (license.validation_count ?? 0) + 1,
        })
        .eq('id', license.id);
    } else {
      await supabase
        .from('licenses')
        .update({
          last_validated_at: new Date().toISOString(),
          validation_count: (license.validation_count ?? 0) + 1,
        })
        .eq('id', license.id);
    }

    await logValidation(supabase, license.id, user.id, hwid, req, true, null);

    return json({
      valid: true,
      tier: license.tier,
      expires_at: license.expires_at,
      license_id: license.id,
    });
  } catch {
    return json({ error: 'Internal server error', valid: false }, 500);
  }
});

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function clientIp(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? null;
  return req.headers.get('cf-connecting-ip');
}

async function logValidation(
  supabase: ReturnType<typeof createClient>,
  licenseId: string | null,
  userId: string,
  hwid: string,
  req: Request,
  isValid: boolean,
  failureReason: string | null,
) {
  if (!licenseId) return;

  await supabase.from('license_validations').insert({
    license_id: licenseId,
    user_id: userId,
    hwid,
    ip_address: clientIp(req),
    is_valid: isValid,
    failure_reason: failureReason,
  });
}
