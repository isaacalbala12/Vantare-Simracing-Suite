// Loopback transport for disposable SQL fixtures, matching Supabase RPC results.
export function fixtureRpc(
  base: string,
  token: string,
  send: typeof fetch = fetch,
) {
  const url = new URL(base);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1") {
    throw new Error("loopback_only");
  }
  return async (name: string, body: Record<string, unknown>) => {
    const response = await send(`${base}/rpc/${name}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    // PostgREST returns 204, without a body, for SQL functions returning void.
    // Parsing JSON here would turn a successful write into an Edge 503.
    if (response.status === 204) return { data: null, error: null };
    const data = await response.json();
    return response.ok
      ? { data, error: null }
      : { data: null, error: { code: String(data.code) } };
  };
}
