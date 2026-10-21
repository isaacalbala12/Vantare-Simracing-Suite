import { isAllowedCheckoutProductKey } from "./mapping.ts";

// Do not treat provider-controlled strings as safe merely because their key is
// `msg`, `type` or `loc`: validation errors can echo arbitrary customer input.
const codes = new Set([
  "validation_error",
  "request_validation_error",
  "invalid_request",
  "invalid_request_error",
  "insufficient_scope",
  "unauthorized",
  "forbidden",
  "not_found",
  "server_error",
  "missing",
  "extra_forbidden",
  "value_error",
  "assertion_error",
  "json_invalid",
  "uuid_parsing",
  "uuid_type",
  "uuid_version",
  "string_type",
  "string_too_long",
  "string_too_short",
  "string_pattern_mismatch",
  "url_parsing",
  "url_scheme",
  "url_type",
  "url_syntax_violation",
  "int_parsing",
  "int_type",
  "bool_parsing",
  "bool_type",
  "list_type",
  "dict_type",
  "literal_error",
  "enum",
  "greater_than",
  "greater_than_equal",
  "less_than",
  "less_than_equal",
  "model_type",
  "model_attributes_type",
  "union_tag_invalid",
  "union_tag_not_found",
]);
const fields = new Set([
  "body",
  "query",
  "path",
  "products",
  "product_id",
  "product_price_id",
  "prices",
  "customer_id",
  "external_customer_id",
  "customer_email",
  "customer_name",
  "customer_billing_address",
  "customer_billing_name",
  "customer_tax_id",
  "customer_ip_address",
  "customer_metadata",
  "metadata",
  "discount_id",
  "allow_discount_codes",
  "allow_trial",
  "trial_interval",
  "trial_interval_count",
  "success_url",
  "return_url",
  "embed_origin",
  "subscription_id",
  "amount",
  "seats",
  "min_seats",
  "max_seats",
  "units",
  "min_units",
  "max_units",
  "require_billing_address",
  "is_business_customer",
  "locale",
  "custom_field_data",
  "country",
  "line1",
  "line2",
  "postal_code",
  "city",
  "state",
]);
const messages = new Set([
  "Field required",
  "Extra inputs are not permitted",
  "Input should be a valid string",
  "Input should be a valid UUID",
  "Input should be a valid URL",
  "Input should be a valid integer",
  "Input should be a valid boolean",
  "Input should be a valid list",
  "Input should be a valid dictionary",
  "Product is a draft.",
  "Product is archived.",
  "Price is archived.",
  "Product does not exist.",
  "Price does not exist.",
  "Discount does not exist.",
  "Discount is not applicable.",
  "Discount has expired.",
  "Discount is not active.",
]);
function code(value: unknown): string | null {
  return typeof value === "string"
    ? codes.has(value) ? value : "[redacted]"
    : null;
}
function message(value: unknown): string {
  // Closed technical messages, never input/ctx/error_description/free text.
  return (typeof value === "string" && messages.has(value)
    ? value
    : "[redacted]").slice(0, 200);
}

async function errorBody(response: Response): Promise<Record<string, unknown>> {
  const reader = response.body?.getReader();
  if (!reader) return {};
  // Logging must not turn an immediate rejection into a stalled checkout.
  const timer = setTimeout(() => {
    void reader.cancel().catch(() => {});
  }, 250);
  try {
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 8192) {
        void reader.cancel().catch(() => {});
        return {};
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}

export async function polarCheckoutDiagnostic(
  response: Response,
  productKey: string,
) {
  const body = await errorBody(response);
  return {
    status: response.status,
    product_key: isAllowedCheckoutProductKey(productKey)
      ? productKey
      : "[redacted]",
    error: code(body.error),
    type: code(body.type),
    detail: Array.isArray(body.detail)
      ? body.detail.slice(0, 20).map((raw) => {
        const item = raw && typeof raw === "object"
          ? raw as Record<string, unknown>
          : {};
        return {
          loc: Array.isArray(item.loc)
            ? item.loc.slice(0, 8).map((part: unknown) =>
              typeof part === "string" && fields.has(part)
                ? part
                : Number.isSafeInteger(part) && Number(part) >= 0 &&
                    Number(part) <= 10000
                ? part
                : "[redacted]"
            )
            : [],
          type: code(item.type),
          msg: message(item.msg),
        };
      })
      : [],
  };
}
