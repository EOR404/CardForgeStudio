export function isSensitiveConfigKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  return (
    normalized === "apikey" ||
    normalized === "authorization" ||
    normalized === "proxyauthorization" ||
    normalized === "bearertoken" ||
    normalized === "accesstoken" ||
    normalized === "refreshtoken" ||
    normalized.endsWith("apikey") ||
    normalized.endsWith("token") ||
    normalized.endsWith("secret") ||
    normalized.endsWith("password")
  );
}

export function sanitizeSensitiveHeaders(headers?: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers ?? {}).map(([key, value]) => [key, isSensitiveConfigKey(key) ? "" : value])
  );
}

export function sensitiveHeaderKeys(headers?: Record<string, string>): string[] {
  return Object.keys(headers ?? {}).filter(isSensitiveConfigKey);
}
