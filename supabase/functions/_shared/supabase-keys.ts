type EnvReader = (name: string) => string | undefined;
type DenoRuntime = typeof globalThis & {
  Deno?: { env?: { get(name: string): string | undefined } };
};

function readRuntimeEnv(name: string) {
  return (globalThis as DenoRuntime).Deno?.env?.get(name);
}

export function readNamedKey(raw: string | undefined, keyName = "default") {
  if (!raw) return null;
  try {
    const keys = JSON.parse(raw) as unknown;
    if (!keys || typeof keys !== "object" || Array.isArray(keys)) return null;
    const key = (keys as Record<string, unknown>)[keyName];
    return typeof key === "string" && key.length > 0 ? key : null;
  } catch {
    return null;
  }
}

export function getSupabaseKeys(
  readEnv: EnvReader = readRuntimeEnv,
) {
  const url = readEnv("SUPABASE_URL") ?? null;
  const publishableKey = readNamedKey(readEnv("SUPABASE_PUBLISHABLE_KEYS"));
  const secretKey = readNamedKey(readEnv("SUPABASE_SECRET_KEYS"));
  return { url, publishableKey, secretKey };
}
