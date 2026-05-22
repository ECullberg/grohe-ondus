export function safeNumber(v: unknown, fallback: number | null = null): number | null {
  if (typeof v === 'number' && !isNaN(v) && isFinite(v)) return v;
  return fallback;
}
