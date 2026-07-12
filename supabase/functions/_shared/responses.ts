import { corsHeaders } from "./cors.ts";

export function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
  });
}

export function errorResponse(
  code: string,
  message: string,
  status: number,
  extra: Record<string, unknown> = {},
): Response {
  return jsonResponse({ error: code, message, ...extra }, status);
}