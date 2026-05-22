const PATTERNS = [
  /Bearer\s+[A-Za-z0-9._-]+/gi,
  /"access_token"\s*:\s*"[^"]+"/gi,
  /"refresh_token"\s*:\s*"[^"]+"/gi,
  /"id_token"\s*:\s*"[^"]+"/gi,
  /"password"\s*:\s*"[^"]+"/gi,
  /eyJ[A-Za-z0-9._-]{20,}/g,
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
];

export function redact(input: unknown): string {
  let s = typeof input === 'string' ? input : JSON.stringify(input);
  for (const p of PATTERNS) {
    s = s.replace(p, '[REDACTED]');
  }
  return s;
}
