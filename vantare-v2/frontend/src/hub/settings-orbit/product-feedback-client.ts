import { getSession, getSupabaseClient } from "../../lib/supabase-auth";

export type ProductFeedbackCategory = "problem" | "idea" | "experience";
export type ProductFeedbackChannel = "stable" | "testers" | "nightly" | "unknown";
export type ProductFeedbackStatus = "new" | "reviewed" | "action_created" | "closed";

export type ProductFeedbackInput = {
  category: ProductFeedbackCategory;
  message: string;
  appVersion: string | null;
  channel: ProductFeedbackChannel;
  replyOptIn: boolean;
};

export type ProductFeedbackEntry = ProductFeedbackInput & {
  id: string;
  status: ProductFeedbackStatus;
  createdAt: string;
  expiresAt: string;
};

export type FeedbackErrorCode = "sign_in_required" | "invalid_message" | "unavailable";

export class ProductFeedbackError extends Error {
  readonly code: FeedbackErrorCode;

  constructor(code: FeedbackErrorCode) {
    super(code);
    this.name = "ProductFeedbackError";
    this.code = code;
  }
}

const PAGE_SIZE = 20;

export function prepareProductFeedback(input: ProductFeedbackInput): ProductFeedbackInput {
  const message = input.message.trim();
  if (message.length < 10 || message.length > 2000 || new TextEncoder().encode(message).length > 8000) {
    throw new ProductFeedbackError("invalid_message");
  }
  return {
    ...input,
    message,
    appVersion: input.appVersion?.slice(0, 64) || null,
  };
}

async function requireClient() {
  try {
    if (!(await getSession())) throw new ProductFeedbackError("sign_in_required");
    return getSupabaseClient();
  } catch (error) {
    if (error instanceof ProductFeedbackError) throw error;
    throw new ProductFeedbackError("unavailable");
  }
}

export async function submitProductFeedback(input: ProductFeedbackInput): Promise<void> {
  const prepared = prepareProductFeedback(input);
  const client = await requireClient();
  const { error } = await client.from("product_feedback").insert({
    category: prepared.category,
    message: prepared.message,
    app_version: prepared.appVersion,
    channel: prepared.channel,
    reply_opt_in: prepared.replyOptIn,
  });
  if (error) throw new ProductFeedbackError("unavailable");
}

export async function listProductFeedback(page = 0): Promise<{ entries: ProductFeedbackEntry[]; hasMore: boolean }> {
  const client = await requireClient();
  const from = Math.max(0, Math.floor(page)) * PAGE_SIZE;
  const { data, error } = await client
    .from("product_feedback")
    .select("id,category,message,app_version,channel,reply_opt_in,triage_status,created_at,expires_at")
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE);
  if (error || !Array.isArray(data)) throw new ProductFeedbackError("unavailable");
  return { entries: data.slice(0, PAGE_SIZE).map(decodeEntry), hasMore: data.length > PAGE_SIZE };
}

export async function deleteProductFeedback(id: string): Promise<void> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new ProductFeedbackError("unavailable");
  }
  const client = await requireClient();
  const { data, error } = await client.from("product_feedback").delete().eq("id", id).select("id");
  if (error || !Array.isArray(data) || data.length !== 1) {
    throw new ProductFeedbackError("unavailable");
  }
}

function decodeEntry(value: unknown): ProductFeedbackEntry {
  if (!value || typeof value !== "object") throw new ProductFeedbackError("unavailable");
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== "string" ||
    !["problem", "idea", "experience"].includes(String(row.category)) ||
    typeof row.message !== "string" ||
    !["stable", "testers", "nightly", "unknown"].includes(String(row.channel)) ||
    typeof row.reply_opt_in !== "boolean" ||
    !["new", "reviewed", "action_created", "closed"].includes(String(row.triage_status)) ||
    typeof row.created_at !== "string" ||
    typeof row.expires_at !== "string" ||
    (row.app_version !== null && typeof row.app_version !== "string")
  ) {
    throw new ProductFeedbackError("unavailable");
  }
  return {
    id: row.id,
    category: row.category as ProductFeedbackCategory,
    message: row.message,
    appVersion: row.app_version as string | null,
    channel: row.channel as ProductFeedbackChannel,
    replyOptIn: row.reply_opt_in,
    status: row.triage_status as ProductFeedbackStatus,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}
