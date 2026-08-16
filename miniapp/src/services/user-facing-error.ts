const transportErrorPatterns = [
  /^request:fail\b/i,
  /^uploadFile:fail\b/i,
  /\bfailed to fetch\b/i,
  /\bnetwork error\b/i,
  /\bload failed\b/i,
  /\btimeout\b/i,
  /\babort(?:ed)?\b/i,
] as const;

export function userFacingErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback;
  const raw = error.message.trim();
  if (!raw || transportErrorPatterns.some((pattern) => pattern.test(raw))) return fallback;
  return raw;
}
