export const RESERVED_PATHS = [
  "/login",
  "/login/code",
  "/login/resend",
  "/logout",
  "/settings",
] as const;

export function normalizePath(raw: string): string | null {
  const t = raw.trim();
  if (t === "" || t === "/") return null;
  if (t.startsWith("//") || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(t)) return null;
  const withSlash = t.startsWith("/") ? t : `/${t}`;
  const out = withSlash.replace(/\/+$/, "");
  return out === "" ? null : out;
}

export function collidesWithAppRoutes(path: string): boolean {
  const lower = path.toLowerCase();
  return (RESERVED_PATHS as readonly string[]).some((r) => r === lower);
}
