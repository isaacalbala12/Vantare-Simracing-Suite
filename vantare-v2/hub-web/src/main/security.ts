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
