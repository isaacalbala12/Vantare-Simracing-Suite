// deno-lint-ignore-file no-control-regex
export type TestingCenterSanitization = {
  value: string;
  redactedValues: number;
  truncated: boolean;
};

const ENCODER = new TextEncoder();

function replaceCounted(
  value: string,
  pattern: RegExp,
  replacement: string,
): { value: string; count: number } {
  let count = 0;
  return {
    value: value.replace(pattern, () => {
      count++;
      return replacement;
    }),
    count,
  };
}

function truncateUtf8(
  value: string,
  maxBytes: number,
): TestingCenterSanitization {
  if (ENCODER.encode(value).length <= maxBytes) {
    return { value, redactedValues: 0, truncated: false };
  }

  const suffix = "…[truncated]";
  const suffixBytes = ENCODER.encode(suffix).length;
  let output = "";

  for (const character of value) {
    if (ENCODER.encode(output + character).length > maxBytes - suffixBytes) {
      break;
    }
    output += character;
  }

  return {
    value: output + suffix,
    redactedValues: 0,
    truncated: true,
  };
}

export function sanitizeTestingCenterTesterText(
  input: string,
  maxBytes = 1024,
): TestingCenterSanitization {
  let value = input.normalize("NFKC");
  let redactedValues = 0;
  const replacements: Array<[RegExp, string]> = [
    [
      /\b(?:gh[pousr]_[A-Za-z0-9]{16,}|sk-[A-Za-z0-9_-]{16,})\b/g,
      "[redacted-token]",
    ],
    [
      /\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
      "[redacted-token]",
    ],
    [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]"],
    [/\bhttps?:\/\/[^\s<>'"]+/gi, "[redacted-url]"],
    [/\b[A-Za-z]:[\\/][^\r\n]*/g, "[redacted-path]"],
    [/\\\\[^\r\n]*/g, "[redacted-path]"],
    [
      /\bauthorization\s*[:=]\s*(?:bearer\s+)?[^\s,;]+/gi,
      "authorization=[redacted-secret]",
    ],
    [
      /\b(?:cookie|password|passwd|secret|token|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi,
      "secret=[redacted-secret]",
    ],
    [
      /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069]/g,
      "[redacted-control]",
    ],
  ];

  for (const [pattern, replacement] of replacements) {
    const result = replaceCounted(value, pattern, replacement);
    value = result.value;
    redactedValues += result.count;
  }

  value = value
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/`/g, "'")
    .replace(/@/g, "@\u200b")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .trim();

  const truncated = truncateUtf8(value, maxBytes);
  return {
    value: truncated.value,
    redactedValues,
    truncated: truncated.truncated,
  };
}

export function buildTestingCenterUntrustedBlock(
  label: string,
  sanitizedValue: string,
): string {
  return `### ${label}\n\n<!-- vantare-untrusted-begin -->\n\`\`\`text\n${sanitizedValue}\n\`\`\`\n<!-- vantare-untrusted-end -->`;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", ENCODER.encode(value));
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  )
    .join("");
}
