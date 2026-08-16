const SECRET_PATTERNS = [
  /\b(?:sk|rk|pk)_[A-Za-z0-9_-]{16,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/-]{12,}=*/gi,
  /\b(?:postgres(?:ql)?|mysql|redis):\/\/[^\s'"<>]+/gi,
  /\b(?:password|passwd|secret|token|api[_-]?key)\s*[=:]\s*[^\s'"<>]{6,}/gi,
] as const;

export const MAX_LOG_BYTES = 64 * 1024;

export function sanitizeLog(value: string): {
  text: string;
  truncated: boolean;
} {
  let redacted = value.replaceAll("\0", "�");
  for (const pattern of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, "[REDACTED]");
  }
  const bytes = new TextEncoder().encode(redacted);
  if (bytes.byteLength <= MAX_LOG_BYTES) {
    return { text: redacted, truncated: false };
  }
  const clipped = new TextDecoder().decode(bytes.slice(0, MAX_LOG_BYTES));
  return { text: `${clipped}\n[OUTPUT TRUNCATED]`, truncated: true };
}
