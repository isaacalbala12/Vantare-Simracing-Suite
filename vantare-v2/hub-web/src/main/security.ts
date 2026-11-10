export const CSP =
  "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'";
export function isAppDocument(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "app:" &&
      url.host === "hub" &&
      !url.username &&
      !url.password &&
      url.port === ""
    );
  } catch {
    return false;
  }
}
export function assetPath(value: string): string | null {
  if (!isAppDocument(value)) return null;
  try {
    const path = decodeURIComponent(new URL(value).pathname);
    if (
      path.includes("\\") ||
      path.includes("\0") ||
      path.split("/").some((p) => p === ".." || p.includes(":"))
    )
      return null;
    return path === "/" ? "index.html" : path.slice(1);
  } catch {
    return null;
  }
}

export function developmentUrl(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const url = new URL(value);
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password
  )
    throw new Error("Renderer development server must use loopback");
  return url.href;
}
