import { Browser } from '@wailsio/runtime';
import { getSession } from './supabase-auth';

export const BILLING_ENABLED =
  (import.meta.env.VITE_BILLING_ENABLED as string | undefined) === 'true';

export type BillingProductKey = 'launch_lifetime' | 'pro_monthly' | 'pro_plus_monthly';

export type BillingErrorReason =
  | 'billing_not_available'
  | 'login_required'
  | 'network_error'
  | 'server_error'
  | 'billing_customer_not_found'
  | 'invalid_url';

export type BillingResult =
  { ok: true; url: string } | { ok: false; reason: BillingErrorReason; message?: string };

function supabaseFunctionsBase(): string {
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
  return `${supabaseUrl}/functions/v1`;
}

function isValidHttpsUrl(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

export async function getBillingAccessToken(): Promise<string | null> {
  const session = await getSession();
  return session?.access_token ?? null;
}

export async function openBillingUrl(url: string): Promise<void> {
  try {
    await Browser.OpenURL(url);
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

async function callBillingFunction(
  path: string,
  body: Record<string, unknown>,
): Promise<BillingResult> {
  if (!BILLING_ENABLED) {
    return { ok: false, reason: 'billing_not_available' };
  }

  const token = await getBillingAccessToken();
  if (!token) {
    return { ok: false, reason: 'login_required' };
  }

  try {
    const res = await fetch(`${supabaseFunctionsBase()}/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    const data = (await res.json().catch(() => ({}))) as {
      url?: string;
      error?: string;
    };

    if (res.status === 404 && data.error === 'billing_customer_not_found') {
      return { ok: false, reason: 'billing_customer_not_found' };
    }

    if (!res.ok) {
      return { ok: false, reason: 'server_error' };
    }

    if (!data.url || !isValidHttpsUrl(data.url)) {
      return { ok: false, reason: 'invalid_url' };
    }

    return { ok: true, url: data.url };
  } catch {
    return { ok: false, reason: 'network_error' };
  }
}

export async function createBillingCheckout(productKey: BillingProductKey): Promise<BillingResult> {
  const result = await callBillingFunction('billing-checkout', {
    productKey,
    attemptId: checkoutAttemptId(productKey),
  });
  if (result.ok) {
    await openBillingUrl(result.url);
  }
  return result;
}

export async function openBillingPortal(): Promise<BillingResult> {
  const result = await callBillingFunction('billing-portal', {});
  if (result.ok) {
    await openBillingUrl(result.url);
  }
  return result;
}

const ATTEMPT_TTL_MS = 30 * 60 * 1000;
const checkoutAttempts = new Map<BillingProductKey, { id: string; createdAt: number }>();

function checkoutAttemptId(productKey: BillingProductKey): string {
  const now = Date.now();
  const existing = checkoutAttempts.get(productKey);
  if (existing && now - existing.createdAt < ATTEMPT_TTL_MS) return existing.id;
  const created = { id: crypto.randomUUID(), createdAt: now };
  checkoutAttempts.set(productKey, created);
  return created.id;
}
